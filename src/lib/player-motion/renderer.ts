import { cancelFrame, frame } from 'motion'
import type { PlayerSurfaceController } from './controller.ts'
import { clampProgress, coverFrame, surfaceFrame, type SurfaceRect } from './geometry.ts'

export function renderPlayerSurface(root: HTMLElement, controller: PlayerSurfaceController) {
  const sheet = root.querySelector<HTMLElement>('.ly-container')!
  const player = root.querySelector<HTMLElement>('.apple-music-player')!
  const cover = root.querySelector<HTMLElement>('.am-flying-cover')
  const backdrop = root.querySelector<HTMLElement>('.m-player-backdrop')
  const background = root.querySelector<HTMLElement>('.am-bg')
  const nav = document.querySelector<HTMLElement>('.mobile-tab-bar')
  const mini = document.querySelector<HTMLElement>('.mobile-mini-player')
  const miniCover = mini?.querySelector<HTMLElement>('.mini-player-artwork')
  const saved = new Map<HTMLElement, Map<string, { value: string; priority: string }>>()
  let source: SurfaceRect
  let coverSource: SurfaceRect | undefined
  let coverTarget: SurfaceRect | undefined
  let coverSourceRadius = 0
  let coverTargetRadius = 0
  let viewport = { width: innerWidth, height: innerHeight }
  let shared: HTMLElement | undefined
  let ghost: HTMLElement | undefined
  let captured = false
  let destroyed = false
  let content: Array<{ node: HTMLElement; opacity: number; transform: string }> = []

  function set(node: HTMLElement | null | undefined, property: string, value: string) {
    if (!node) return
    let properties = saved.get(node)
    if (!properties) { properties = new Map(); saved.set(node, properties) }
    if (!properties.has(property)) properties.set(property, {
      value: node.style.getPropertyValue(property), priority: node.style.getPropertyPriority(property),
    })
    node.style.setProperty(property, value, 'important')
  }

  function restore() {
    saved.forEach((properties, node) => properties.forEach(({ value, priority }, property) => {
      if (value) node.style.setProperty(property, value, priority)
      else node.style.removeProperty(property)
    }))
    saved.clear()
  }

  function clone(node: HTMLElement, className: string) {
    const visual = node.cloneNode(true) as HTMLElement
    visual.className = `${node.className} ${className}`
    visual.inert = true
    visual.setAttribute('aria-hidden', 'true')
    for (const element of [visual, ...visual.querySelectorAll<HTMLElement>('[id], [tabindex]')]) {
      element.removeAttribute('id')
      element.removeAttribute('tabindex')
    }
    Object.assign(visual.style, {
      position: 'absolute', inset: 'auto', margin: '0', transition: 'none', pointerEvents: 'none',
      visibility: 'visible', transformOrigin: '0 0', transform: 'none',
    })
    root.append(visual)
    return visual
  }

  function measure() {
    viewport = { width: innerWidth, height: innerHeight }
    source = mini?.getBoundingClientRect() ?? { left: 0, top: viewport.height, width: viewport.width, height: 0 }
    const from = miniCover?.getBoundingClientRect()
    const to = cover?.getBoundingClientRect()
    coverSource = from?.width && from.height ? from : undefined
    coverTarget = to?.width && to.height ? to : undefined
    const radius = (node: HTMLElement | null | undefined, width: number): number => {
      if (!node) return 0
      const value = getComputedStyle(node).borderTopLeftRadius
      const parsed = parseFloat(value)
      return Number.isFinite(parsed) ? Math.max(0, Math.min(width / 2, value.includes('%') ? width * parsed / 100 : parsed)) : 0
    }
    coverSourceRadius = radius(miniCover, from?.width ?? 0)
    coverTargetRadius = radius(cover, to?.width ?? 0)
  }

  function measureContent() {
    content = [...root.querySelectorAll<HTMLElement>('.am-track-info, .am-corner-info, .am-bottom-controls, .am-mobile-footer, .am-more-shell, .am-mobile-like, .am-lyrics-area')].map(node => {
      const style = getComputedStyle(node)
      return { node, opacity: Number(style.opacity), transform: style.transform === 'none' ? '' : style.transform }
    })
  }

  function capture() {
    if (captured) return
    captured = true
    root.classList.add('surface-transitioning')
    player.dispatchEvent(new Event('mobile-player-suspend'))
    measure()
    measureContent()
    if (mini) {
      ghost = clone(mini, 'player-surface-mini')
      ghost.querySelector<HTMLElement>('.mini-player-artwork')?.style.setProperty('visibility', 'hidden')
      Object.assign(ghost.style, {
        left: `${source.left}px`, top: `${source.top}px`, width: `${source.width}px`, height: `${source.height}px`,
        minHeight: `${source.height}px`, padding: getComputedStyle(mini).padding,
        background: 'transparent', border: '0', boxShadow: 'none', zIndex: '20',
      })
    }
    if (cover && coverSource && coverTarget) {
      shared = clone(cover, 'player-surface-cover')
      Object.assign(shared.style, {
        left: '0', top: '0', width: `${coverTarget.width}px`, height: `${coverTarget.width}px`,
        borderRadius: getComputedStyle(cover).borderRadius, opacity: '1', zIndex: '30',
      })
      set(cover, 'visibility', 'hidden')
    }
    document.documentElement.classList.add('mobile-player-expanded')
    // A mode click can have a pending Svelte layout update in this same event.
    queueMicrotask(remeasure)
  }

  function release() {
    cancelFrame(render)
    restore()
    shared?.remove()
    ghost?.remove()
    shared = ghost = undefined
    captured = false
    root.classList.remove('surface-transitioning')
    player.dispatchEvent(new Event('mobile-player-resume'))
  }

  function render() {
    if (destroyed || !captured) return
    const p = clampProgress(controller.sheetProgress.get())
    const visual = surfaceFrame(p, source, viewport)
    set(nav, 'transition', 'none')
    set(sheet, 'clip-path', visual.clipPath)
    set(nav, 'transform', visual.navTransform)
    set(backdrop, 'opacity', `${visual.backdropOpacity}`)
    set(background, 'opacity', `${visual.backgroundOpacity}`)
    if (ghost) ghost.style.opacity = `${visual.miniOpacity}`
    for (const { node, opacity, transform } of content) {
      set(node, 'transition', 'none')
      set(node, 'opacity', `${opacity * visual.contentOpacity}`)
      set(node, 'transform', `translateY(${24 * (1 - p)}px) ${transform}`)
    }
    if (shared && coverSource && coverTarget) {
      const next = coverFrame(p, coverSource, coverTarget, coverSourceRadius, coverTargetRadius)
      shared.style.transform = `translate(${next.left}px, ${next.top}px) scale(${next.scale})`
      shared.style.borderRadius = `${next.radius}px`
    }
  }

  const unsubscribeProgress = controller.sheetProgress.on('change', () => frame.render(render))
  const unsubscribeState = controller.subscribe(({ phase }) => {
    if (phase === 'open') { release(); return }
    if (phase === 'closed') { release(); document.documentElement.classList.remove('mobile-player-expanded'); return }
    capture()
    render()
  })

  function remeasure() {
    if (!destroyed && captured) {
      // Restore our overrides while measuring the frozen mode's current layout.
      restore()
      measure()
      measureContent()
      if (cover && shared && coverTarget) {
        shared.style.width = shared.style.height = `${coverTarget.width}px`
        set(cover, 'visibility', 'hidden')
      }
      if (ghost) Object.assign(ghost.style, { left: `${source.left}px`, top: `${source.top}px`, width: `${source.width}px`, height: `${source.height}px` })
      render()
    }
  }
  function refresh() {
    if (document.hidden) return
    controller.refresh()
    remeasure()
  }
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  window.addEventListener('resize', refresh)
  document.addEventListener('visibilitychange', refresh)
  media.addEventListener('change', refresh)

  return { destroy() {
    destroyed = true
    unsubscribeProgress()
    unsubscribeState()
    release()
    document.documentElement.classList.remove('mobile-player-expanded')
    window.removeEventListener('resize', refresh)
    document.removeEventListener('visibilitychange', refresh)
    media.removeEventListener('change', refresh)
  } }
}
