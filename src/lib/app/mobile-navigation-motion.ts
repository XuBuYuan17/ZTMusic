export type MobileNavigationKind = 'tab' | 'push' | 'pop'
export const mobileMotion = {
  tab: 220,
  page: 360,
  expand: 520,
  dismiss: 460,
  enter: 'cubic-bezier(.2,0,0,1)',
  exit: 'cubic-bezier(.32,0,.2,1)',
  shared: 'cubic-bezier(.16,1,.3,1)',
  standard: 'cubic-bezier(.2,0,0,1)',
} as const

interface RectLike {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

interface SharedReturnGeometry {
  rect: RectLike
  radius: string
  viewportWidth: number
  viewportHeight: number
}

export function playlistDismissProgress(distance: number, travel: number): number {
  return travel > 0 ? Math.max(0, Math.min(1, distance / travel)) : 0
}

export function finishPlaylistDismiss(progress: number, velocity: number, distance: number, cancelled = false): boolean {
  return !cancelled && (progress >= .25 || (velocity >= .5 && distance >= 48))
}

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
    const clippedSurface = surfaceClip
      ? { opacity: 1, transform: 'none', clipPath: surfaceClip }
      : null

    if (kind === 'pop') {
      if (surfaceClip) {
        return entering
          ? [fullSurface, fullSurface]
          : [fullSurface, clippedSurface]
      }

      if (entering) {
        return [
          { opacity: .84, transform: 'translate3d(-10px,0,0) scale(.985)', clipPath: 'inset(0 0 0 0 round 0px)' },
          fullSurface,
        ]
      }
      return [
        fullSurface,
        { opacity: .96, transform: 'translate3d(18px,0,0) scale(.997)', clipPath: 'inset(0 0 0 0 round 0px)', offset: .48 },
        { opacity: 0, transform: 'translate3d(44px,0,0) scale(.992)', clipPath: 'inset(0 0 0 0 round 0px)' },
      ]
    }

    if (clippedSurface) {
      return entering
        ? [clippedSurface, fullSurface]
        : [fullSurface, fullSurface]
    }

    return entering
      ? [{ opacity: 0, transform: 'translate3d(0,12px,0)', clipPath: fullSurface.clipPath }, fullSurface]
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

function copyRect(rect: RectLike): RectLike {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
}

function clipInsets(page: RectLike, rect: RectLike) {
  return {
    top: Math.max(0, rect.top - page.top),
    right: Math.max(0, page.right - rect.right),
    bottom: Math.max(0, page.bottom - rect.bottom),
    left: Math.max(0, rect.left - page.left),
  }
}

function clipToRect(page: HTMLElement, rect: RectLike, radius: string): string | null {
  const box = page.getBoundingClientRect()
  if (!box.width || !box.height || !rect.width || !rect.height) return null
  const inset = clipInsets(box, rect)
  return `inset(${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px round ${radius})`
}

function interpolatedClip(page: RectLike, rect: RectLike, radius: string, progress: number): string {
  const inset = clipInsets(page, rect)
  const p = Math.max(0, Math.min(1, progress))
  const radiusPx = (Number.parseFloat(radius) || 22) * p
  return `inset(${inset.top * p}px ${inset.right * p}px ${inset.bottom * p}px ${inset.left * p}px round ${radiusPx}px)`
}

function clearSharedCoverReturn(): void {
  if (typeof document === 'undefined') return
  document.querySelector<HTMLElement>('[data-shared-cover-return="true"]')?.removeAttribute('data-shared-cover-return')
}

function attachPlaylistDismiss(
  page: HTMLElement,
  geometry: SharedReturnGeometry,
  commit: () => Promise<void>,
): (preserve?: boolean) => void {
  const maybeScroller = page.closest<HTMLElement>('.mobile-page-content')
  if (!maybeScroller) return () => {}
  const scroller: HTMLElement = maybeScroller

  let pointer: number | null = null
  let startX = 0
  let startY = 0
  let startTime = 0
  let currentY = 0
  let active = false
  let suppressClick = false
  let box: RectLike | null = null
  let travel = 1
  let animation: Animation | null = null
  let committing = false

  const fullClip = 'inset(0px 0px 0px 0px round 0px)'
  const reset = () => {
    if (committing) return
    page.style.removeProperty('clip-path')
    page.style.removeProperty('will-change')
  }

  function down(event: PointerEvent): void {
    if (pointer !== null || committing || event.button !== 0 || !event.isPrimary || scroller.scrollTop > 1) return
    if (Math.abs(window.innerWidth - geometry.viewportWidth) > 8 || Math.abs(window.innerHeight - geometry.viewportHeight) > 8) return
    if ((event.target as Element).closest('button, a, input, textarea, select, [role="slider"], [contenteditable="true"]')) return
    animation?.cancel()
    reset()
    pointer = event.pointerId
    startX = event.clientX
    startY = event.clientY
    currentY = event.clientY
    startTime = event.timeStamp
    active = false
    suppressClick = false
    box = null
  }

  function move(event: PointerEvent): void {
    if (pointer !== event.pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    currentY = event.clientY
    if (!active) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return
      if (dy <= 0 || Math.abs(dy) <= Math.abs(dx) * 1.25) { pointer = null; return }
      active = true
      suppressClick = true
      box = copyRect(page.getBoundingClientRect())
      travel = Math.max(240, Math.min(box.height * .68, window.innerHeight * .62))
      page.style.willChange = 'clip-path'
      try { page.setPointerCapture(event.pointerId) } catch {}
    }
    if (!box) return
    const progress = playlistDismissProgress(dy, travel)
    page.style.clipPath = interpolatedClip(box, geometry.rect, geometry.radius, progress)
    event.preventDefault()
    event.stopPropagation()
  }

  function finish(event: PointerEvent): void {
    if (pointer !== event.pointerId) return
    const cancelled = event.type !== 'pointerup'
    if (!cancelled) move(event)
    const dy = Math.max(0, currentY - startY)
    const elapsed = Math.max(16, event.timeStamp - startTime)
    const velocity = dy / elapsed
    const progress = playlistDismissProgress(dy, travel)
    const complete = active && finishPlaylistDismiss(progress, velocity, dy, cancelled)
    pointer = null
    if (page.hasPointerCapture(event.pointerId)) page.releasePointerCapture(event.pointerId)

    if (!active || !box) { active = false; return }
    active = false
    const from = page.style.clipPath || interpolatedClip(box, geometry.rect, geometry.radius, progress)
    if (complete) {
      committing = true
      const target = interpolatedClip(box, geometry.rect, geometry.radius, 1)
      animation = page.animate([{ clipPath: from }, { clipPath: target }], {
        duration: Math.max(120, Math.round(mobileMotion.dismiss * (1 - progress))),
        easing: mobileMotion.shared,
        fill: 'forwards',
      })
      animation.finished.then(() => {
        page.style.clipPath = target
        void commit().catch(() => {
          committing = false
          page.style.removeProperty('will-change')
          animation = page.animate([{ clipPath: target }, { clipPath: fullClip }], {
            duration: 220,
            easing: 'cubic-bezier(.22,.8,.2,1)',
          })
          animation.finished.then(reset).catch(reset)
        })
      }).catch(() => {})
      return
    }

    animation = page.animate([{ clipPath: from }, { clipPath: fullClip }], {
      duration: 300,
      easing: 'cubic-bezier(.22,.8,.2,1)',
    })
    animation.finished.then(reset).catch(reset)
  }

  function click(event: MouseEvent): void {
    if (!suppressClick) return
    event.preventDefault()
    event.stopImmediatePropagation()
    suppressClick = false
  }

  page.addEventListener('pointerdown', down)
  page.addEventListener('pointermove', move)
  page.addEventListener('pointerup', finish)
  page.addEventListener('pointercancel', finish)
  page.addEventListener('lostpointercapture', finish)
  page.addEventListener('click', click, true)

  return (preserve = false) => {
    page.removeEventListener('pointerdown', down)
    page.removeEventListener('pointermove', move)
    page.removeEventListener('pointerup', finish)
    page.removeEventListener('pointercancel', finish)
    page.removeEventListener('lostpointercapture', finish)
    page.removeEventListener('click', click, true)
    if (pointer !== null && page.hasPointerCapture(pointer)) page.releasePointerCapture(pointer)
    pointer = null
    animation?.cancel()
    if (!preserve) {
      committing = false
      reset()
    }
  }
}

export function createMobileNavigationMotion() {
  let generation = 0
  const animations = new Set<Animation>()
  let dismissCleanup: ((preserve?: boolean) => void) | null = null
  let skipNextInteractivePop = false

  function cancel() {
    generation++
    animations.forEach(animation => animation.cancel())
    animations.clear()
    dismissCleanup?.(skipNextInteractivePop)
    dismissCleanup = null
  }

  return {
    cancel,
    play(incoming: HTMLElement, outgoing: HTMLElement | null, kind: MobileNavigationKind, sharedCover: boolean, surface: boolean, reduced: boolean, done: () => void) {
      cancel()
      const current = generation

      if (surface && kind === 'pop' && skipNextInteractivePop) {
        skipNextInteractivePop = false
        clearSharedCoverReturn()
        done()
        if (outgoing) queueMicrotask(() => {
          outgoing.style.removeProperty('clip-path')
          outgoing.style.removeProperty('will-change')
        })
        return
      }

      if (reduced) { if (surface && kind === 'pop') clearSharedCoverReturn(); done(); return }

      const source = surface ? sharedCoverSource() : null
      const sourceRect = source?.getBoundingClientRect() ?? null
      const sourceRadius = source ? (getComputedStyle(source).borderRadius || getComputedStyle(source.parentElement!).borderRadius || '22px') : '22px'
      const incomingClip = sourceRect ? clipToRect(incoming, sourceRect, sourceRadius) : null
      const outgoingClip = outgoing && sourceRect ? clipToRect(outgoing, sourceRect, sourceRadius) : null
      const duration = surface
        ? kind === 'pop' ? mobileMotion.dismiss : mobileMotion.expand
        : kind === 'tab' ? mobileMotion.tab : mobileMotion.page
      const hasSharedGeometry = Boolean(sourceRect && (kind === 'pop' ? outgoingClip : incomingClip))
      const easing = surface && hasSharedGeometry ? mobileMotion.shared : surface && kind === 'pop' ? mobileMotion.exit : mobileMotion.standard
      const returnGeometry: SharedReturnGeometry | null = surface && kind === 'push' && sourceRect && incoming.querySelector('.playlist-detail-page')
        ? { rect: copyRect(sourceRect), radius: sourceRadius, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }
        : null

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
        if (returnGeometry) {
          dismissCleanup = attachPlaylistDismiss(incoming, returnGeometry, async () => {
            skipNextInteractivePop = true
            try {
              const { router } = await import('../stores/router.svelte.ts')
              router.goBack()
            } catch (error) {
              skipNextInteractivePop = false
              throw error
            }
          })
        }
        done()
      })
    },
  }
}
