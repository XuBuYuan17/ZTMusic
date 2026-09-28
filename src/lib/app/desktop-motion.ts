export const motion = { press: 90, release: 280, menu: 220, panel: 320, page: 300, lyrics: 480 } as const

export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function desktopPanel(node: Element) {
  if (document.documentElement.classList.contains('mobile-runtime') || reducedMotion()) return { duration: 0 }
  const isMenu = node.getAttribute('role') === 'menu'
  // WAAPI：避免 Svelte css 补间把 translate/scale 转成 matrix 后与 transform: translateX(-50%) 嵌套合成
  const animation = node.animate(
    [{ opacity: 0, transform: 'translateY(8px) scale(0.97)', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }, { opacity: 1, transform: 'none' }],
    { duration: isMenu ? motion.menu : motion.panel, fill: 'backwards' },
  )
  return { duration: 0, destroy: () => animation.cancel() }
}

export function replaceAnimation() {
  let current: Animation | null = null
  let generation = 0
  return {
    run(node: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions, complete?: () => void) {
      const version = ++generation
      current?.cancel()
      const animation = node.animate(frames, options)
      current = animation
      animation.finished.then(() => {
        if (version !== generation) return
        if (options.fill !== 'forwards') { animation.cancel(); current = null }
        complete?.()
      }).catch(() => {})
    },
    cancel() { generation++; current?.cancel(); current = null },
  }
}

export function pageMotion(node: HTMLElement, value: { identity: string; direction: string }) {
  const animation = replaceAnimation()
  let identity = ''
  function update(next: typeof value) {
    if (next.identity === identity) return
    identity = next.identity
    if (document.documentElement.classList.contains('mobile-runtime')) return
    const x = next.direction === 'back' ? -16 : next.direction === 'forward' ? 16 : 0
    animation.run(node, [{ opacity: .3, transform: `translate(${reducedMotion() ? 0 : x}px, 0)` }, { opacity: 1, transform: 'none' }], { duration: reducedMotion() ? 100 : motion.page, easing: 'cubic-bezier(.2,.8,.2,1)' })
  }
  update(value)
  return { update, destroy: () => animation.cancel() }
}

const handledPresses = new WeakSet<Event>()
export function desktopFeedback(node: HTMLElement) {
  let active: HTMLElement | null = null
  const animation = replaceAnimation()
  const targetSelector = 'button:not([disabled]):not(.artist-link):not(.artist-name), [data-motion="card"]'
  function down(event: PointerEvent) {
    if (handledPresses.has(event)) return
    if (event.button !== 0 || reducedMotion() || document.documentElement.classList.contains('mobile-runtime')) return
    const target = (event.target as Element).closest<HTMLElement>(targetSelector)
    if (!target || target.closest('[role="slider"], input, .track-table tbody, .queue-item, .profile-home__track-list, .user-page__tracks') || target.getAttribute('aria-disabled') === 'true') return
    if (active && active !== target) animation.cancel()
    handledPresses.add(event)
    active = target
    animation.run(target, [{ scale: getComputedStyle(target).scale }, { scale: target.dataset.motion === 'card' ? '.98' : '.96' }], { duration: motion.press, fill: 'forwards', easing: 'ease-out' })
  }
  function up(event: PointerEvent) {
    const target = active
    active = null
    if (!target) return
    animation.run(target, [{ scale: getComputedStyle(target).scale }, { scale: event.type === 'pointercancel' ? '1' : '1.015', offset: .55 }, { scale: '1' }], { duration: motion.release, easing: 'ease-out' })
  }
  node.addEventListener('pointerdown', down)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  return { destroy() { animation.cancel(); node.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) } }
}

const layers: HTMLElement[] = []
export function dialogFocus(node: HTMLElement, close: () => void) {
  if (document.documentElement.classList.contains('mobile-runtime')) return {}
  const previous = document.activeElement as HTMLElement | null
  layers.push(node)
  const items = () => [...node.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), textarea, select, a[href], [tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[inert]'))
  queueMicrotask(() => { if (node.isConnected && layers.at(-1) === node) (items()[0] || node).focus({ preventScroll: true }) })
  function key(event: KeyboardEvent) {
    if (layers.at(-1) !== node) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close() }
    if (event.key === 'Tab') {
      const list = items(), first = list[0], last = list.at(-1)
      if (!first) { event.preventDefault(); node.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
  }
  window.addEventListener('keydown', key, true)
  return { destroy() { const top = layers.at(-1) === node; const index = layers.indexOf(node); if (index >= 0) layers.splice(index, 1); window.removeEventListener('keydown', key, true); if (top && previous?.isConnected) previous.focus({ preventScroll: true }) } }
}
