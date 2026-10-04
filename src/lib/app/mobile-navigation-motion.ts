export type MobileNavigationKind = 'tab' | 'push' | 'pop'
export const mobileMotion = {
  tab: 220,
  page: 360,
  expand: 420,
  dismiss: 300,
  enter: 'cubic-bezier(.2,0,0,1)',
  exit: 'cubic-bezier(.4,0,1,1)',
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
): Keyframe[] {
  if (surface) {
    const fullSurface = { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0 round 0px)' }
    const clippedSurface = { opacity: 1, transform: 'none', clipPath: surfaceClip || 'inset(8% 8% 72% 8% round 22px)' }

    if (kind === 'pop') {
      if (entering) return [fullSurface, fullSurface]
      // 返回时不要把标题、按钮、歌曲列表一起硬压回封面卡片。
      // 底页保持原位，详情内容快速退场；共享封面单独负责“飞回来源”的空间连续性。
      return [
        fullSurface,
        {
          opacity: 0,
          transform: 'translate3d(0,10px,0) scale(.992)',
          clipPath: 'inset(0 0 0 0 round 0px)',
          offset: .72,
        },
        {
          opacity: 0,
          transform: 'translate3d(0,10px,0) scale(.992)',
          clipPath: 'inset(0 0 0 0 round 0px)',
        },
      ]
    }

    // 进入详情仍从用户点下的封面区域展开；来源页完全静止，避免双层横移。
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

function animateCoverReturn(outgoing: HTMLElement, source: HTMLImageElement): Promise<void> {
  const target = outgoing.querySelector<HTMLElement>('.playlist-cover')
  if (!target || typeof document === 'undefined') return Promise.resolve()
  const from = target.getBoundingClientRect()
  const to = source.getBoundingClientRect()
  if (!from.width || !to.width) return Promise.resolve()

  const clone = document.createElement('img')
  clone.className = 'shared-cover-flight shared-cover-flight--return'
  clone.src = target instanceof HTMLImageElement ? (target.currentSrc || target.src) : (source.currentSrc || source.src)
  clone.alt = ''
  clone.setAttribute('aria-hidden', 'true')
  const targetOpacity = target.style.opacity
  const sourceOpacity = source.style.opacity
  target.style.opacity = '0'
  source.style.opacity = '0'
  const fromRadius = getComputedStyle(target).borderRadius
  const toRadius = getComputedStyle(source).borderRadius || getComputedStyle(source.parentElement!).borderRadius
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    objectFit: 'cover',
    pointerEvents: 'none',
    transformOrigin: '0 0',
    zIndex: '40',
    boxShadow: 'var(--shadow-lg)',
    borderRadius: fromRadius,
  })
  document.body.append(clone)
  const sx = to.width / from.width
  const sy = to.height / from.height
  const animation = clone.animate([
    { transform: 'none', borderRadius: fromRadius },
    { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${sx}, ${sy})`, borderRadius: `calc(${toRadius} / ${sx})` },
  ], { duration: mobileMotion.dismiss, easing: mobileMotion.standard })

  return animation.finished.catch(() => {}).then(() => {
    target.style.opacity = targetOpacity
    source.style.opacity = sourceOpacity
    source.removeAttribute('data-shared-cover-return')
    clone.remove()
  })
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

      const source = surface ? sharedCoverSource() : null
      const sourceRect = source?.getBoundingClientRect() ?? null
      const sourceRadius = source ? (getComputedStyle(source).borderRadius || getComputedStyle(source.parentElement!).borderRadius || '22px') : '22px'
      const incomingClip = sourceRect ? clipToRect(incoming, sourceRect, sourceRadius) : null
      const outgoingClip = outgoing && sourceRect ? clipToRect(outgoing, sourceRect, sourceRadius) : null
      const duration = surface
        ? kind === 'pop' ? mobileMotion.dismiss : mobileMotion.expand
        : kind === 'tab' ? mobileMotion.tab : mobileMotion.page

      const pending = [incoming, outgoing].filter((node): node is HTMLElement => !!node).map((node, index) => {
        const entering = index === 0
        const clip = entering ? incomingClip : outgoingClip
        const animation = node.animate(mobilePageFrames(kind, entering, sharedCover, surface, clip), {
          duration,
          easing: mobileMotion.standard,
        })
        animations.add(animation)
        return animation.finished.catch(() => {})
      })

      if (surface && kind === 'pop' && outgoing && source) {
        pending.push(animateCoverReturn(outgoing, source))
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
