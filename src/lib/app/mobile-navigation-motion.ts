export type MobileNavigationKind = 'tab' | 'push' | 'pop'
export const mobileMotion = {
  tab: 170, page: 260, expand: 300,
  enter: 'cubic-bezier(.16,1,.3,1)',
  exit: 'cubic-bezier(.4,0,1,1)',
  standard: 'cubic-bezier(.2,.8,.2,1)',
} as const

export function mobileNavigationKind(direction: string, primary: boolean): MobileNavigationKind {
  return direction === 'back' ? 'pop' : primary || direction === 'soft' ? 'tab' : 'push'
}

export function mobilePageFrames(kind: MobileNavigationKind, entering: boolean, sharedCover = false): [Keyframe, Keyframe] {
  const offset = kind === 'tab' ? 'translate3d(0,8px,0)' : kind === 'pop' ? 'translate3d(-12px,0,0)' : 'translate3d(32px,0,0)'
  if (entering) return [{ opacity: kind === 'tab' ? .4 : 0, transform: sharedCover ? 'none' : offset }, { opacity: 1, transform: 'none' }]
  return [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: kind === 'pop' ? 'translate3d(32px,0,0)' : kind === 'push' ? 'translate3d(-12px,0,0)' : 'none' }]
}

export function createMobileNavigationMotion() {
  let generation = 0
  const animations = new Set<Animation>()
  function cancel() { generation++; animations.forEach(animation => animation.cancel()); animations.clear() }
  return {
    cancel,
    play(incoming: HTMLElement, outgoing: HTMLElement | null, kind: MobileNavigationKind, sharedCover: boolean, reduced: boolean, done: () => void) {
      cancel()
      const current = generation
      if (reduced) { done(); return }
      const pending = [incoming, outgoing].filter((node): node is HTMLElement => !!node).map((node, index) => {
        const animation = node.animate(mobilePageFrames(kind, index === 0, sharedCover), {
          duration: kind === 'tab' ? mobileMotion.tab : mobileMotion.page,
          easing: mobileMotion.standard,
        })
        animations.add(animation)
        return animation.finished.catch(() => {})
      })
      Promise.all(pending).then(() => {
        if (current !== generation) return
        animations.forEach(animation => animation.cancel())
        animations.clear()
        done()
      })
    },
  }
}
