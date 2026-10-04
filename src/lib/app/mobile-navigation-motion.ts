export type MobileNavigationKind = 'tab' | 'push' | 'pop'
export const mobileMotion = {
  tab: 160, page: 300, expand: 420,
  enter: 'cubic-bezier(.16,1,.3,1)',
  exit: 'cubic-bezier(.4,0,1,1)',
  standard: 'cubic-bezier(.2,.8,.2,1)',
} as const

export function mobileNavigationKind(direction: string, primary: boolean): MobileNavigationKind {
  return direction === 'back' ? 'pop' : primary || direction === 'soft' ? 'tab' : 'push'
}

export function mobilePageFrames(kind: MobileNavigationKind, entering: boolean, sharedCover = false, surface = false): [Keyframe, Keyframe] {
  if (surface) {
    if (kind === 'pop') return entering
      ? [{ opacity: .72, transform: 'translate3d(0,-8px,0)', filter: 'brightness(.96)' }, { opacity: 1, transform: 'none', filter: 'brightness(1)' }]
      : [{ opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0 round 0)' }, { opacity: 0, transform: 'translate3d(0,32px,0)', clipPath: 'inset(0 0 12% 0 round 28px 28px 0 0)' }]
    return entering
      ? [{ opacity: 0, transform: 'translate3d(0,28px,0)', clipPath: 'inset(10% 0 0 0 round 28px 28px 0 0)' }, { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0 round 0)' }]
      : [{ opacity: 1, transform: 'none', filter: 'brightness(1)' }, { opacity: .72, transform: 'translate3d(0,-8px,0)', filter: 'brightness(.96)' }]
  }
  const offset = kind === 'tab' ? 'none' : kind === 'pop' ? 'translate3d(-20px,0,0)' : 'translate3d(64px,0,0)'
  if (entering) return [{ opacity: kind === 'tab' ? .4 : 0, transform: sharedCover ? 'none' : offset }, { opacity: 1, transform: 'none' }]
  return [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: kind === 'pop' ? 'translate3d(64px,0,0)' : kind === 'push' ? 'translate3d(-20px,0,0)' : 'none' }]
}

export function createMobileNavigationMotion() {
  let generation = 0
  const animations = new Set<Animation>()
  function cancel() { generation++; animations.forEach(animation => animation.cancel()); animations.clear() }
  return {
    cancel,
    play(incoming: HTMLElement, outgoing: HTMLElement | null, kind: MobileNavigationKind, sharedCover: boolean, surface: boolean, reduced: boolean, done: () => void) {
      cancel()
      const current = generation
      if (reduced) { done(); return }
      const pending = [incoming, outgoing].filter((node): node is HTMLElement => !!node).map((node, index) => {
        const animation = node.animate(mobilePageFrames(kind, index === 0, sharedCover, surface), {
          duration: surface ? mobileMotion.expand : kind === 'tab' ? mobileMotion.tab : mobileMotion.page,
          easing: mobileMotion.standard,
        })
        animations.add(animation)
        return animation.finished.catch(() => {})
      })
      if (surface && kind !== 'pop') {
        incoming.querySelectorAll<HTMLElement>('.playlist-hero-copy, .playlist-toolbar, .playlist-track-surface').forEach((node, index) => {
          const animation = node.animate([
            { opacity: 0, transform: 'translate3d(0,18px,0)' },
            { opacity: 1, transform: 'none' },
          ], { duration: 300, delay: 70 + index * 35, easing: mobileMotion.standard, fill: 'backwards' })
          animations.add(animation)
          pending.push(animation.finished.catch(() => {}))
        })
      }
      Promise.all(pending).then(() => {
        if (current !== generation) return
        animations.forEach(animation => animation.cancel())
        animations.clear()
        done()
      })
    },
  }
}
