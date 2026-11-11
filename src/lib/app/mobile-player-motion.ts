import { tick } from 'svelte'
import { reducedMotion, replaceAnimation } from './desktop-motion.ts'

export const mobilePlayerTiming = {
  duration: 520,
  enterDuration: 520,
  exitDuration: 540,
  chromeDuration: 300,
  contentDuration: 420,
  contentDelay: 45,
  // Subtle overshoot gives the artwork/title a damped finish without a JS
  // spring loop: the compositor can interpolate transform keyframes itself.
  easing: 'cubic-bezier(.22,.82,.28,1.04)',
  contentEasing: 'cubic-bezier(.22,.82,.28,1)',
} as const

/**
 * Match the original lyric reveal beneath the moving artwork without animating
 * clip-path over a large, scrollable text layer on Android.
 */
export function lyricRevealDistance(
  cover: { top: number; height: number } | undefined,
  lyricTop: number | undefined,
): number {
  if (!cover || lyricTop === undefined) return 96
  return Math.min(160, Math.max(28, Math.round(cover.top + cover.height - lyricTop)))
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
  let suspended = false
  let pendingLayout = false
  let intendedLyrics: boolean | null = null
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
    pendingLayout = false
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
    if (suspended) animation.pause()
    return animation.finished.catch(() => {})
  }

  return {
    async change(node: HTMLElement, update: () => void) {
      if (suspended) return
      const entering = intendedLyrics === null ? !node.classList.contains('lyrics-mode') : !intendedLyrics
      intendedLyrics = entering
      const cover = node.querySelector<HTMLElement>('.am-flying-cover')
      const title = node.querySelector<HTMLElement>(entering ? '.am-track-info' : '.am-corner-info')
      const from = cover?.getBoundingClientRect()
      const titleFrom = title?.getBoundingClientRect()
      const titleScale = titleFrom && title?.offsetHeight ? titleFrom.height / title.offsetHeight : 1
      const titleSize = title?.firstElementChild && getComputedStyle(title.firstElementChild).fontSize
      const moving = ['.am-mobile-like', '.am-more-shell'].map(selector => {
        const element = node.querySelector<HTMLElement>(selector)
        return { element, from: element?.getBoundingClientRect() }
      })
      const outgoing = (entering ? ['.am-bottom-controls', '.am-mobile-footer'] : ['.am-lyrics-area']).map(selector => {
        const element = node.querySelector<HTMLElement>(selector)
        const style = element && getComputedStyle(element)
        return { element, rect: element?.getBoundingClientRect(), opacity: style?.opacity, display: style?.display, clipPath: style?.clipPath }
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
      pendingLayout = true
      await tick()
      if (version !== generation || !node.isConnected) return
      pendingLayout = false
      if (reducedMotion()) { cancel(); return }

      const pending: Promise<unknown>[] = []
      const coverDuration = entering ? mobilePlayerTiming.enterDuration : mobilePlayerTiming.exitDuration
      // Read the new geometry together, before modifying animated styles.
      // In particular, moving the outgoing controls out of flow must not
      // force another layout while we're measuring the incoming lyrics.
      const to = cover?.getBoundingClientRect()
      const nextTitle = node.querySelector<HTMLElement>(entering ? '.am-corner-info' : '.am-track-info')
      const titleTo = nextTitle?.getBoundingClientRect()
      const nextSize = nextTitle?.firstElementChild && getComputedStyle(nextTitle.firstElementChild).fontSize
      const movingTargets = moving.map(({ element, from }) => ({
        element, from, to: element?.getBoundingClientRect(),
      }))
      const hasOutgoing = outgoing.some(({ element, rect }) => element && rect?.height)
      const parent = hasOutgoing ? node.getBoundingClientRect() : null
      const incomingTargets = (entering ? ['.am-lyrics-area'] : ['.am-bottom-controls', '.am-mobile-footer'])
        .map(selector => {
          const element = node.querySelector<HTMLElement>(selector)
          return { element, rect: element?.getBoundingClientRect() }
        })
      if (cover && from?.width && from.height && to?.width && to.height) {
        const sx = from.width / to.width, sy = from.height / to.height
        // ponytail: scaling also scales the corners; a separate clipped artwork layer
        // can preserve their exact radius if the visual difference becomes noticeable.
        pending.push(animate(cover, [
          { transformOrigin: '0 0', transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${sx},${sy})` },
          { transformOrigin: '0 0', transform: 'none' },
        ], { duration: coverDuration }))
      }

      let titlePath: Array<{ left: number; top: number; offset: number; scale: number }> = []
      if (nextTitle && titleFrom && titleTo && from && to) {
        const scale = titleSize && nextSize ? parseFloat(titleSize) * titleScale / parseFloat(nextSize) : 1
        titlePath = [
          { left: titleFrom.left, top: titleFrom.top, offset: 0, scale },
          { left: titleTo.left, top: titleTo.top, offset: 1, scale: 1 },
        ]
        pending.push(animate(nextTitle, titlePath.map(point => ({ offset: point.offset, transformOrigin: '0 0', transform: `translate(${point.left - titleTo.left}px,${point.top - titleTo.top}px) scale(${point.scale})` })), { duration: coverDuration }))
      }

      for (const { element, from, to } of movingTargets) {
        if (!element || !from?.width || !to) continue
        const frames = titlePath.length && titleFrom && titleTo ? titlePath.map(point => ({ offset: point.offset, transform: `translate(${(from.left - to.left) * (1 - point.offset)}px,${point.top + (from.top - titleFrom.top) * (1 - point.offset) + (to.top - titleTo.top) * point.offset - to.top}px)` })) : [{ transform: `translate(${from.left - to.left}px,${from.top - to.top}px)` }, { transform: 'none' }]
        pending.push(animate(element, frames, { duration: coverDuration }))
      }

      for (const { element, rect, opacity, display, clipPath } of outgoing) {
        if (!element || !rect?.height || !parent) continue
        rememberStyle(element)
        Object.assign(element.style, { display: display || 'block', position: 'absolute', inset: 'auto', left: `${rect.left - parent.left}px`, top: `${rect.top - parent.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', pointerEvents: 'none', clipPath: clipPath || 'none', transition: 'none' })
        const distance = entering ? 24 : element === node.querySelector('.am-lyrics-area') ? 42 : 18
        pending.push(animate(element, [
          { opacity: opacity || '1', transform: 'none' },
          { opacity: 0, transform: `translateY(${distance}px)` },
        ], { duration: mobilePlayerTiming.chromeDuration, easing: mobilePlayerTiming.contentEasing }))
      }

      for (const { element: incoming, rect } of incomingTargets) {
        if (!incoming) continue
        const lyricsEntering = entering && incoming === node.querySelector('.am-lyrics-area')
        // A larger compositor-only rise preserves the old cover-led reveal.
        // Do not tween clip-path or scrollTop alongside the cover's FLIP.
        const distance = lyricsEntering ? lyricRevealDistance(from, rect?.top) : entering ? 18 : 22
        pending.push(animate(incoming, [
          { opacity: 0, transform: `translateY(${distance}px)` },
          { opacity: 1, transform: 'none' },
        ], {
          duration: mobilePlayerTiming.contentDuration,
          delay: lyricsEntering ? mobilePlayerTiming.contentDelay : 0,
          easing: mobilePlayerTiming.contentEasing,
        }))
      }

      void Promise.all(pending).then(() => { if (version === generation) cancel() })
    },
    suspend() {
      suspended = true
      if (pendingLayout) cancel()
      else animations.forEach(animation => animation.pause())
    },
    resume() {
      if (!suspended) return
      suspended = false
      animations.forEach(animation => animation.play())
    },
    destroy() { suspended = false; intendedLyrics = null; cancel() },
  }
}
