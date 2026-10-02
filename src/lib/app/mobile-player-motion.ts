import { tick } from 'svelte'
import { reducedMotion, replaceAnimation } from './desktop-motion.ts'

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
  function cancel() {
    generation++
    animations.forEach(animation => animation.cancel())
    animations.clear()
  }
  function animate(node: HTMLElement, frames: Keyframe[]) {
    const animation = node.animate(frames, { duration: 360, easing: 'cubic-bezier(.2,0,0,1)' })
    animations.add(animation)
    animation.finished.then(() => { animation.cancel(); animations.delete(animation) }).catch(() => {})
  }
  return {
    async change(node: HTMLElement, update: () => void) {
      const cover = node.querySelector<HTMLElement>('.am-flying-cover')
      const title = node.querySelector<HTMLElement>(node.classList.contains('lyrics-mode') ? '.am-corner-info' : '.am-track-info')
      const from = cover?.getBoundingClientRect()
      const titleFrom = title?.getBoundingClientRect()
      const radius = cover && getComputedStyle(cover).borderRadius
      cancel()
      cover?.getAnimations().forEach(animation => animation.cancel())
      const version = generation
      update()
      await tick()
      if (version !== generation || !node.isConnected || reducedMotion()) return
      const to = cover?.getBoundingClientRect()
      if (cover && from?.width && from.height && to?.width && to.height) {
        const sx = from.width / to.width, sy = from.height / to.height
        animate(cover, [
          { transformOrigin: '0 0', transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${sx},${sy})`, borderRadius: `calc(${radius} / ${sx})` },
          { transformOrigin: '0 0', transform: 'none', borderRadius: getComputedStyle(cover).borderRadius },
        ])
      }
      const nextTitle = node.querySelector<HTMLElement>(node.classList.contains('lyrics-mode') ? '.am-corner-info' : '.am-track-info')
      if (nextTitle && titleFrom) {
        const to = nextTitle.getBoundingClientRect()
        animate(nextTitle, [{ opacity: .5, transform: `translate(${titleFrom.left - to.left}px,${titleFrom.top - to.top}px)` }, { opacity: 1, transform: 'none' }])
      }
      const lyrics = node.querySelector<HTMLElement>('.am-lyrics-area')
      if (lyrics && node.classList.contains('lyrics-mode')) animate(lyrics,
        [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }])
    },
    destroy: cancel,
  }
}
