import { tick } from 'svelte'
import { reducedMotion, replaceAnimation } from './desktop-motion.ts'

export const mobilePlayerTiming = { duration: 480, easing: 'cubic-bezier(.22,.8,.2,1)' } as const

export interface MobilePlayerDrag {
  pointerId: number
  startY: number
  currentY: number
  startTime: number
  time: number
  released?: boolean
  cancelled?: boolean
}

export function playerDragProgress(startY: number, currentY: number, travel: number) {
  return travel > 0 ? Math.max(0, Math.min(1, (startY - currentY) / travel)) : 0
}

export function finishPlayerDrag(progress: number, velocity: number, distance: number, cancelled = false) {
  return !cancelled && (progress >= .25 || (velocity <= -.5 && distance >= 48))
}

export function sheetCoverTransform(from: { left: number; top: number; width: number; height: number }, to: { left: number; top: number; width: number; height: number }, sheetOffset = 0) {
  if (from.width <= 0 || from.height <= 0) return 'none'
  return `translate(${to.left - from.left}px, ${to.top - from.top - sheetOffset}px) scale(${to.width / from.width}, ${to.height / from.height})`
}

export function miniLyricMotion(node: HTMLElement, value: { text: string; lyric: boolean; song: unknown }) {
  const animation = replaceAnimation()
  let previous = value
  return {
    update(next: typeof value) {
      const changed = next.text !== previous.text
      const animate = changed && next.lyric && previous.lyric && next.song === previous.song
      previous = next
      if (!changed) return
      animation.cancel()
      if (animate && !reducedMotion()) animation.run(node,
        [{ opacity: .35, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
        { duration: 220, easing: 'cubic-bezier(.2,0,0,1)' })
    },
    destroy: () => animation.cancel(),
  }
}

export function createMobilePlayerMotion() {
  let generation = 0
  const animations = new Set<Animation>()
  const restores = new Map<HTMLElement, string>()
  function cancel() {
    generation++
    animations.forEach(animation => animation.cancel())
    animations.clear()
    restores.forEach((style, node) => { node.style.cssText = style })
    restores.clear()
  }
  function animate(node: HTMLElement, frames: Keyframe[]) {
    const animation = node.animate(frames, { ...mobilePlayerTiming, fill: 'both' })
    animations.add(animation)
    return animation.finished.catch(() => {})
  }
  return {
    async change(node: HTMLElement, update: () => void) {
      const entering = !node.classList.contains('lyrics-mode')
      const cover = node.querySelector<HTMLElement>('.am-flying-cover')
      const title = node.querySelector<HTMLElement>(entering ? '.am-track-info' : '.am-corner-info')
      const from = cover?.getBoundingClientRect()
      const titleFrom = title?.getBoundingClientRect()
      const titleScale = titleFrom && title?.offsetHeight ? titleFrom.height / title.offsetHeight : 1
      const titleSize = title?.firstElementChild && getComputedStyle(title.firstElementChild).fontSize
      const radius = cover && getComputedStyle(cover).borderRadius
      const moving = ['.am-mobile-like', '.am-more-shell'].map(selector => {
        const element = node.querySelector<HTMLElement>(selector)
        return { element, from: element?.getBoundingClientRect() }
      })
      const outgoing = (entering ? ['.am-bottom-controls', '.am-mobile-footer'] : ['.am-lyrics-area']).map(selector => {
        const element = node.querySelector<HTMLElement>(selector)
        return { element, rect: element?.getBoundingClientRect(), opacity: element && getComputedStyle(element).opacity, display: element && getComputedStyle(element).display, clipPath: element && getComputedStyle(element).clipPath }
      })
      cancel()
      cover?.getAnimations().forEach(animation => animation.cancel())
      const version = generation
      update()
      await tick()
      if (version !== generation || !node.isConnected || reducedMotion()) return
      const pending: Promise<unknown>[] = []
      const to = cover?.getBoundingClientRect()
      if (cover && from?.width && from.height && to?.width && to.height) {
        const sx = from.width / to.width, sy = from.height / to.height
        pending.push(animate(cover, [
          { transformOrigin: '0 0', transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${sx},${sy})`, borderRadius: `calc(${radius} / ${sx})` },
          { transformOrigin: '0 0', transform: 'none', borderRadius: getComputedStyle(cover).borderRadius },
        ]))
      }
      const nextTitle = node.querySelector<HTMLElement>(entering ? '.am-corner-info' : '.am-track-info')
      let titlePath: Array<{ left: number; top: number; offset: number; scale: number }> = []
      const titleTo = nextTitle?.getBoundingClientRect()
      if (nextTitle && titleFrom && titleTo && from && to) {
        const nextSize = nextTitle.firstElementChild && getComputedStyle(nextTitle.firstElementChild).fontSize
        const scale = titleSize && nextSize ? parseFloat(titleSize) * titleScale / parseFloat(nextSize) : 1
        const gap = entering ? titleFrom.top - from.top - from.height : titleTo.top - to.top - to.height
        const sideGap = entering ? titleTo.left - to.left - to.width : titleFrom.left - from.left - from.width
        titlePath = [
          { left: titleFrom.left, top: titleFrom.top, offset: 0, scale },
          ...[.35, .65].map(offset => {
            const left = from.left + (to.left - from.left) * offset
            const top = from.top + (to.top - from.top) * offset
            const width = from.width + (to.width - from.width) * offset
            const height = from.height + (to.height - from.height) * offset
            return { left: (entering ? offset === .65 : offset === .35) ? left + width + sideGap : entering ? titleFrom.left : titleTo.left, top: top + height + gap * (entering ? 1 - offset : offset), offset, scale: entering ? 1 + (scale - 1) * Math.max(0, 1 - offset / .65) : scale + (1 - scale) * offset }
          }),
          { left: titleTo.left, top: titleTo.top, offset: 1, scale: 1 },
        ]
        pending.push(animate(nextTitle, titlePath.map(point => ({ offset: point.offset, transformOrigin: '0 0', transform: `translate(${point.left - titleTo.left}px,${point.top - titleTo.top}px) scale(${point.scale})` }))))
      }
      for (const { element, from } of moving) {
        if (!element || !from?.width) continue
        const to = element.getBoundingClientRect()
        const frames = titlePath.length && titleFrom && titleTo ? titlePath.map(point => ({ offset: point.offset, transform: `translate(${(from.left - to.left) * (1 - point.offset)}px,${point.top + (from.top - titleFrom.top) * (1 - point.offset) + (to.top - titleTo.top) * point.offset - to.top}px)` })) : [{ transform: `translate(${from.left - to.left}px,${from.top - to.top}px)` }, { transform: 'none' }]
        pending.push(animate(element, frames))
      }
      for (const { element, rect, opacity, display, clipPath } of outgoing) {
        if (!element || !rect?.height) continue
        const parent = node.getBoundingClientRect()
        restores.set(element, element.style.cssText)
        Object.assign(element.style, { display: display || 'block', position: 'absolute', inset: 'auto', left: `${rect.left - parent.left}px`, top: `${rect.top - parent.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', pointerEvents: 'none', clipPath: clipPath || 'none' })
        const distance = entering ? Math.max(36, innerHeight - rect.top + 24) : 36
        pending.push(animate(element, [{ opacity: opacity || '1', transform: 'none' }, { opacity: 0, transform: `translateY(${distance}px)` }]))
      }
      for (const selector of entering ? ['.am-lyrics-area'] : ['.am-bottom-controls', '.am-mobile-footer']) {
        const incoming = node.querySelector<HTMLElement>(selector)
        if (!incoming) continue
        const rect = incoming.getBoundingClientRect()
        const distance = !entering && rect?.height ? Math.max(36, innerHeight - rect.top + 24) : 36
        pending.push(animate(incoming, [
          { opacity: 0, transform: `translateY(${distance}px)`, ...(entering && from && rect ? { clipPath: `inset(${Math.max(0, from.top + from.height - rect.top)}px 0px 0px 0px)` } : {}) },
          { opacity: 1, transform: 'none', ...(entering ? { clipPath: 'inset(0px 0px 0px 0px)' } : {}) },
        ]))
      }
      void Promise.all(pending).then(() => { if (version === generation) cancel() })
    },
    destroy: cancel,
  }
}
