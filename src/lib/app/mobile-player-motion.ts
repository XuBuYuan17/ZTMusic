import { tick } from 'svelte'
import { reducedMotion, replaceAnimation } from './desktop-motion.ts'

export const mobilePlayerTiming = {
  duration: 300,
  enterDuration: 280,
  exitDuration: 320,
  chromeDuration: 180,
  contentDuration: 220,
  contentDelay: 36,
  easing: 'cubic-bezier(.2,.78,.15,1)',
  contentEasing: 'cubic-bezier(.2,0,0,1)',
} as const

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

  function rememberStyle(node: HTMLElement) {
    if (!restores.has(node)) restores.set(node, node.style.cssText)
  }

  function freezeTransition(node: HTMLElement | null | undefined) {
    if (!node) return
    rememberStyle(node)
    node.style.transition = 'none'
  }

  function cancel() {
    generation++
    animations.forEach(animation => animation.cancel())
    animations.clear()
    restores.forEach((style, node) => { node.style.cssText = style })
    restores.clear()
  }

  function animate(node: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions = {}) {
    const animation = node.animate(frames, {
      duration: mobilePlayerTiming.duration,
      easing: mobilePlayerTiming.easing,
      fill: 'both',
      ...options,
    })
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

      // The component also has layout-property CSS transitions for desktop. On mobile
      // they would race the FLIP animation after lyrics-mode changes, making the cover
      // feel as if it slowly moves twice. Freeze them for this one mode transition and
      // let the Web Animation below be the single owner of motion.
      for (const selector of [
        '.am-flying-cover', '.am-track-info', '.am-corner-info', '.am-mobile-like',
        '.am-more-shell', '.am-bottom-controls', '.am-mobile-footer', '.am-lyrics-area',
      ]) freezeTransition(node.querySelector<HTMLElement>(selector))

      update()
      await tick()
      if (version !== generation || !node.isConnected) return
      if (reducedMotion()) { cancel(); return }

      const pending: Promise<unknown>[] = []
      const coverDuration = entering ? mobilePlayerTiming.enterDuration : mobilePlayerTiming.exitDuration
      const to = cover?.getBoundingClientRect()
      if (cover && from?.width && from.height && to?.width && to.height) {
        // Animate the real artwork through fixed geometry instead of scaling it.
        // The final painted size now exactly matches layout, so Android WebView has
        // no transformed bitmap to resize for one extra frame after it lands.
        const targetRadius = getComputedStyle(cover).borderRadius
        rememberStyle(cover)
        Object.assign(cover.style, {
          position: 'fixed',
          inset: 'auto',
          left: `${to.left}px`,
          top: `${to.top}px`,
          width: `${to.width}px`,
          height: `${to.height}px`,
          margin: '0',
          transform: 'none',
          transition: 'none',
          zIndex: '3',
        })
        pending.push(animate(cover, [
          { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, transform: 'none', borderRadius: radius },
          { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, transform: 'none', borderRadius: targetRadius },
        ], { duration: coverDuration }))
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
          ...[.38, .7].map(offset => {
            const left = from.left + (to.left - from.left) * offset
            const top = from.top + (to.top - from.top) * offset
            const width = from.width + (to.width - from.width) * offset
            const height = from.height + (to.height - from.height) * offset
            return { left: (entering ? offset === .7 : offset === .38) ? left + width + sideGap : entering ? titleFrom.left : titleTo.left, top: top + height + gap * (entering ? 1 - offset : offset), offset, scale: entering ? 1 + (scale - 1) * Math.max(0, 1 - offset / .7) : scale + (1 - scale) * offset }
          }),
          { left: titleTo.left, top: titleTo.top, offset: 1, scale: 1 },
        ]
        pending.push(animate(nextTitle, titlePath.map(point => ({ offset: point.offset, transformOrigin: '0 0', transform: `translate(${point.left - titleTo.left}px,${point.top - titleTo.top}px) scale(${point.scale})` })), { duration: coverDuration }))
      }

      for (const { element, from } of moving) {
        if (!element || !from?.width) continue
        const to = element.getBoundingClientRect()
        const frames = titlePath.length && titleFrom && titleTo ? titlePath.map(point => ({ offset: point.offset, transform: `translate(${(from.left - to.left) * (1 - point.offset)}px,${point.top + (from.top - titleFrom.top) * (1 - point.offset) + (to.top - titleTo.top) * point.offset - to.top}px)` })) : [{ transform: `translate(${from.left - to.left}px,${from.top - to.top}px)` }, { transform: 'none' }]
        pending.push(animate(element, frames, { duration: coverDuration }))
      }

      for (const { element, rect, opacity, display, clipPath } of outgoing) {
        if (!element || !rect?.height) continue
        const parent = node.getBoundingClientRect()
        rememberStyle(element)
        Object.assign(element.style, { display: display || 'block', position: 'absolute', inset: 'auto', left: `${rect.left - parent.left}px`, top: `${rect.top - parent.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', pointerEvents: 'none', clipPath: clipPath || 'none', transition: 'none' })
        const distance = entering ? 24 : 18
        pending.push(animate(element, [
          { opacity: opacity || '1', transform: 'none' },
          { opacity: 0, transform: `translateY(${distance}px)` },
        ], { duration: mobilePlayerTiming.chromeDuration, easing: mobilePlayerTiming.contentEasing }))
      }

      for (const selector of entering ? ['.am-lyrics-area'] : ['.am-bottom-controls', '.am-mobile-footer']) {
        const incoming = node.querySelector<HTMLElement>(selector)
        if (!incoming) continue
        const rect = incoming.getBoundingClientRect()
        const distance = entering ? 18 : 22
        pending.push(animate(incoming, [
          { opacity: 0, transform: `translateY(${distance}px)`, ...(entering && from && rect ? { clipPath: `inset(${Math.max(0, from.top + from.height - rect.top)}px 0px 0px 0px)` } : {}) },
          { opacity: 1, transform: 'none', ...(entering ? { clipPath: 'inset(0px 0px 0px 0px)' } : {}) },
        ], {
          duration: mobilePlayerTiming.contentDuration,
          delay: entering ? mobilePlayerTiming.contentDelay : 0,
          easing: mobilePlayerTiming.contentEasing,
        }))
      }

      void Promise.all(pending).then(() => { if (version === generation) cancel() })
    },
    destroy: cancel,
  }
}
