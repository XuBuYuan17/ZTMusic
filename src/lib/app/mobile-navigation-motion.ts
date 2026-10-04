export type MobileNavigationKind = 'tab' | 'push' | 'pop'
export const mobileMotion = {
  tab: 220,
  page: 360,
  expand: 420,
  dismiss: 260,
  enter: 'cubic-bezier(.2,0,0,1)',
  exit: 'cubic-bezier(.32,0,.2,1)',
  standard: 'cubic-bezier(.2,0,0,1)',
} as const

export function mobileNavigationKind(direction: string, primary: boolean): MobileNavigationKind {
  return direction === 'back' ? 'pop' : primary || direction === 'soft' ? 'tab' : 'push'
}

export function mobilePageFrames(
  kind: MobileNavigationKind,
  entering: boolean,
  sharedCover = false,
  surface = false,
  surfaceClip?: string | null,
): [Keyframe, Keyframe, ...Keyframe[]] {
  if (surface) {
    const fullSurface = { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0 round 0px)' }
    const clippedSurface = { opacity: 1, transform: 'none', clipPath: surfaceClip || 'inset(8% 8% 72% 8% round 22px)' }

    if (kind === 'pop') {
      // Back navigation is a page-layer transition, not the inverse of the card reveal.
      // The source page is already restored underneath; both layers move from frame one,
      // avoiding the old three-stage sequence (content fade -> floating cover -> source page).
      if (entering) {
        return [
          { opacity: .84, transform: 'translate3d(-10px,0,0) scale(.985)', clipPath: 'inset(0 0 0 0 round 0px)' },
          fullSurface,
        ]
      }
      return [
        fullSurface,
        {
          opacity: .96,
          transform: 'translate3d(18px,0,0) scale(.997)',
          clipPath: 'inset(0 0 0 0 round 0px)',
          offset: .48,
        },
        {
          opacity: 0,
          transform: 'translate3d(44px,0,0) scale(.992)',
          clipPath: 'inset(0 0 0 0 round 0px)',
        },
      ]
    }

    // Entering a playlist still grows from the tapped cover region. The source page stays still.
    return entering
      ? [clippedSurface, fullSurface]
      : [fullSurface, fullSurface]
  }

  if (kind === 'tab') {
    return entering
      ? [{ opacity: .18, transform: 'translate3d(14px,0,0)' }, { opacity: 1, transform: 'none' }]
      : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(-8px,0,0)' }]
  }

  const offset = kind === 'pop' ? 'translate3d(-24px,0,0)' : 'translate3d(24px,0,0)'
  if (entering) return [{ opacity: sharedCover ? .7 : 0, transform: sharedCover ? 'none' : offset }, { opacity: 1, transform: 'none' }]
  return [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: kind === 'pop' ? 'translate3d(24px,0,0)' : 'translate3d(-12px,0,0)' }]
}

function sharedCoverSource(): HTMLImageElement | null {
  if (typeof document === 'undefined') return null
  const source = document.querySelector<HTMLImageElement>('img[data-shared-cover-return="true"]')
  if (!source?.isConnected) return null
  const rect = source.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 ? source : null
}

function clipToRect(page: HTMLElement, rect: DOMRect, radius: string): string | null {
  const box = page.getBoundingClientRect()
  if (!box.width || !box.height || !rect.width || !rect.height) return null
  const top = Math.max(0, rect.top - box.top)
  const left = Math.max(0, rect.left - box.left)
  const right = Math.max(0, box.right - rect.right)
  const bottom = Math.max(0, box.bottom - rect.bottom)
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius})`
}

function clearSharedCoverReturn(): void {
  if (typeof document === 'undefined') return
  document.querySelector<HTMLElement>('[data-shared-cover-return="true"]')?.removeAttribute('data-shared-cover-return')
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
      if (reduced) { if (surface && kind === 'pop') clearSharedCoverReturn(); done(); return }

      // Source geometry is only useful for the forward reveal. On pop it was the main source
      // of visual discontinuity because scroll restoration and fixed clone geometry raced.
      const source = surface && kind !== 'pop' ? sharedCoverSource() : null
      const sourceRect = source?.getBoundingClientRect() ?? null
      const sourceRadius = source ? (getComputedStyle(source).borderRadius || getComputedStyle(source.parentElement!).borderRadius || '22px') : '22px'
      const incomingClip = sourceRect ? clipToRect(incoming, sourceRect, sourceRadius) : null
      const outgoingClip = outgoing && sourceRect ? clipToRect(outgoing, sourceRect, sourceRadius) : null
      const duration = surface
        ? kind === 'pop' ? mobileMotion.dismiss : mobileMotion.expand
        : kind === 'tab' ? mobileMotion.tab : mobileMotion.page
      const easing = surface && kind === 'pop' ? mobileMotion.exit : mobileMotion.standard

      const pending = [incoming, outgoing].filter((node): node is HTMLElement => !!node).map((node, index) => {
        const entering = index === 0
        const clip = entering ? incomingClip : outgoingClip
        const animation = node.animate(mobilePageFrames(kind, entering, sharedCover, surface, clip), {
          duration,
          easing,
        })
        animations.add(animation)
        return animation.finished.catch(() => {})
      })

      Promise.all(pending).then(() => {
        if (current !== generation) return
        animations.forEach(animation => animation.cancel())
        animations.clear()
        if (surface && kind === 'pop') clearSharedCoverReturn()
        done()
      })
    },
  }
}