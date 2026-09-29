import { expoOut } from 'svelte/easing'

export type SwipeDirection = 'horizontal' | 'vertical' | null

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function createMobileSwipe(horizontal = false) {
  let start: { x: number; y: number } | null = null
  let direction: SwipeDirection = null
  let dx = 0
  let dy = 0
  return {
    start(x: number, y: number) { start = { x, y }; direction = null; dx = 0; dy = 0 },
    move(x: number, y: number) {
      if (!start) return { x: 0, y: 0, direction: null }
      dx = x - start.x; dy = y - start.y
      if (!direction && Math.max(Math.abs(dx), Math.abs(dy)) >= 10) {
        direction = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'horizontal' : 'vertical'
      }
      return { x: horizontal && direction === 'horizontal' ? dx : 0, y: direction === 'vertical' ? Math.max(0, dy) : 0, direction }
    },
    end(): 'next' | 'previous' | 'dismiss' | null {
      if (!start) return null
      start = null
      if (horizontal && direction === 'horizontal' && Math.abs(dx) >= 64) return dx < 0 ? 'next' : 'previous'
      if (direction === 'vertical' && dy >= 100) return 'dismiss'
      return null
    },
    cancel() { start = null; direction = null; dx = 0; dy = 0 },
  }
}

/** A handle owns dismissal; the cover also owns horizontal track changes. */
export function mobileDrag(node: HTMLElement, options: { close: () => void; next?: () => void; previous?: () => void; target?: () => HTMLElement | null; blocked?: () => boolean; panel?: boolean }) {
  const swipe = createMobileSwipe(!!options.next)
  let pointer: number | null = null
  let moved = false
  let target: HTMLElement | null = null
  let animation: Animation | undefined
  let clickTimer: ReturnType<typeof setTimeout> | undefined
  let dismissing = false
  function reset() {
    if (target) { target.style.removeProperty('translate'); target.style.removeProperty('transition') }
  }
  function down(event: PointerEvent) {
    if (!document.documentElement.classList.contains('mobile-runtime') || dismissing || pointer !== null || options.blocked?.() || !event.isPrimary || event.button !== 0) return
    const control = (event.target as Element).closest('button, a, input, textarea, select, [role="slider"], [contenteditable="true"]')
    if (control && control !== node) return
    clearTimeout(clickTimer)
    animation?.cancel(); reset()
    pointer = event.pointerId; moved = false
    target = null
    swipe.start(event.clientX, event.clientY)
    node.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) return
    const delta = swipe.move(event.clientX, event.clientY)
    moved ||= delta.direction !== null
    if (!moved) return
    target = delta.direction === 'horizontal' ? node : (options.target?.() ?? (options.panel ? node.parentElement : node))
    if (target) { target.style.transition = 'none'; target.style.translate = `${delta.x * 0.4}px ${delta.y}px` }
  }
  function finish(event: PointerEvent) {
    if (event.pointerId !== pointer) return
    const cancelled = event.type !== 'pointerup'
    if (!cancelled) move(event)
    const result = cancelled ? (swipe.cancel(), null) : swipe.end()
    pointer = null
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId)
    const from = target?.style.translate || '0px 0px'
    if (moved) clickTimer = setTimeout(() => { moved = false }, 350)
    if (result === 'dismiss') {
      dismissing = true
      if (options.panel && target && !reduced()) {
        animation = target.animate([{ translate: from }, { translate: `0px ${target.getBoundingClientRect().height}px` }], { duration: 220, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
        animation.finished.then(options.close).catch(() => {})
      } else options.close()
      return
    }
    reset()
    if (result === 'next') options.next?.()
    if (result === 'previous') options.previous?.()
    if (target && moved && !reduced()) {
      animation = target.animate([{ translate: from }, { translate: '0px 0px' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' })
    }
  }
  function click(event: MouseEvent) { if (moved) { event.preventDefault(); event.stopImmediatePropagation(); moved = false } }
  node.addEventListener('pointerdown', down)
  node.addEventListener('pointermove', move)
  node.addEventListener('pointerup', finish)
  node.addEventListener('pointercancel', finish)
  node.addEventListener('lostpointercapture', finish)
  node.addEventListener('click', click, true)
  return { destroy() {
    clearTimeout(clickTimer)
    animation?.cancel(); swipe.cancel(); reset()
    if (pointer !== null && node.hasPointerCapture(pointer)) node.releasePointerCapture(pointer)
    node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move)
    node.removeEventListener('pointerup', finish); node.removeEventListener('pointercancel', finish)
    node.removeEventListener('lostpointercapture', finish); node.removeEventListener('click', click, true)
  } }
}

export function mobileViewport(_node: HTMLElement) {
  const root = document.documentElement
  const viewport = window.visualViewport
  let baseline = window.innerHeight
  function update() {
    const editing = !!document.activeElement?.matches('input:not([type="range"]), textarea, [contenteditable="true"]')
    if (!editing) baseline = window.innerHeight
    const height = viewport?.height ?? window.innerHeight
    const keyboard = editing && (viewport?.scale ?? 1) < 1.1 && Math.max(baseline, window.innerHeight) - height > 120
    root.classList.toggle('mobile-keyboard-open', keyboard)
    root.style.setProperty('--mobile-viewport-height', keyboard ? `${height}px` : '100dvh')
    root.style.setProperty('--mobile-viewport-top', `${viewport?.offsetTop ?? 0}px`)
  }
  viewport?.addEventListener('resize', update)
  viewport?.addEventListener('scroll', update)
  window.addEventListener('resize', update)
  document.addEventListener('focusin', update); document.addEventListener('focusout', update)
  update()
  return { destroy() {
    viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    document.removeEventListener('focusin', update); document.removeEventListener('focusout', update)
    root.classList.remove('mobile-keyboard-open')
    root.style.removeProperty('--mobile-viewport-height'); root.style.removeProperty('--mobile-viewport-top')
  } }
}

/**
 * 移动端底部 sheet 的「从屏幕顶外降下」过渡 —— `desktopPanel`（desktop-motion.ts:7）的镜像。
 * 桌面端与 reduced-motion 下返回 duration: 0，桌面那套 CSS slideIn 照常跑。
 *
 * 用独立属性 `translate` 而非 `transform`：mobileDrag 也用 translate 拖同一个面板，同属性下
 * WAAPI 的 fill:'forwards' 能盖住这里的补间；换成 transform 两个位移会叠加，面板会飞出屏幕。
 *
 * 行程必须是 100dvh 而不是 -100%：面板是 bottom:0 + height:min(75dvh,640px)，
 * -100% 只挪 75dvh，底部还会露 25dvh 在屏幕里。
 */
export function mobileSheet(_node: HTMLElement, options: { duration?: number } = {}) {
  if (reduced() || !document.documentElement.classList.contains('mobile-runtime')) return { duration: 0 }
  return {
    duration: options.duration ?? 480,
    // expoOut 与 desktopPanel 用的 cubic-bezier(0.16,1,0.3,1) 基本重合（t=0.3 时两者都是 0.875）：
    // 100dvh 的行程需要「快速落下 + 稳稳停住」。TransitionConfig.easing 只收函数，不收 CSS 字符串。
    easing: expoOut,
    css: (t: number) => `translate: 0 ${(1 - t) * -100}dvh`,
  }
}
