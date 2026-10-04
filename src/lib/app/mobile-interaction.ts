import { cubicIn } from 'svelte/easing'

export type SwipeDirection = 'horizontal' | 'vertical' | null

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const mobileSheetTiming = { enter: 420, exit: 300, backdrop: 240 } as const

function dampedOut(t: number): number {
  const c = 0.55
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

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
        animation = target.animate([{ translate: from }, { translate: `0px ${target.getBoundingClientRect().height}px` }], { duration: mobileSheetTiming.exit, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
        animation.finished.then(() => { if (target) target.dataset.sheetDismissed = 'true'; options.close() }).catch(() => {})
      } else options.close()
      return
    }
    reset()
    if (result === 'next') options.next?.()
    if (result === 'previous') options.previous?.()
    if (target && moved && !reduced()) {
      animation = target.animate([{ translate: from }, { translate: '0px 0px' }], { duration: 360, easing: 'cubic-bezier(.22,.8,.2,1)' })
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

export function mobileLongPress(node: HTMLElement, options: { enabled: () => boolean; open: () => void }) {
  let pointer: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let start = { x: 0, y: 0 }
  let suppressClick = false
  function cancel() { clearTimeout(timer); timer = undefined; pointer = null }
  function down(event: PointerEvent) {
    if (!options.enabled() || !event.isPrimary || event.button !== 0 || pointer !== null) return
    if ((event.target as Element).closest('button, a, input, textarea, select')) return
    suppressClick = false
    pointer = event.pointerId
    start = { x: event.clientX, y: event.clientY }
    timer = setTimeout(() => {
      timer = undefined
      if (pointer !== null && options.enabled()) { suppressClick = true; options.open() }
    }, 500)
  }
  function move(event: PointerEvent) {
    if (event.pointerId === pointer && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 10) { suppressClick = true; cancel() }
  }
  function up(event: PointerEvent) {
    if (event.pointerId !== pointer) return
    move(event)
    cancel()
  }
  function click(event: MouseEvent) {
    if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false }
  }
  node.addEventListener('pointerdown', down)
  node.addEventListener('click', click, true)
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
  window.addEventListener('blur', cancel)
  window.addEventListener('scroll', cancel, true)
  return { destroy() {
    cancel()
    node.removeEventListener('pointerdown', down)
    node.removeEventListener('click', click, true)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', up, true)
    window.removeEventListener('blur', cancel)
    window.removeEventListener('scroll', cancel, true)
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
 * 移动端面板从底部进入，与把手向下关闭保持同一方向。
 * 桌面端与 reduced-motion 下返回 duration: 0，桌面那套 CSS slideIn 照常跑。
 *
 * 用独立属性 `translate` 而非 `transform`：mobileDrag 也用 translate 拖同一个面板，同属性下
 * WAAPI 的 fill:'forwards' 能盖住这里的补间；换成 transform 两个位移会叠加，面板会飞出屏幕。
 *
 * 行程为面板自身高度；拖动已完成退出时跳过补间，避免重复下落。
 */
export function mobileSheet(node: HTMLElement, options: { duration?: number } = {}, context: { direction?: 'in' | 'out' | 'both' } = {}) {
  if (reduced() || !document.documentElement.classList.contains('mobile-runtime')) return { duration: 0 }
  if (node.dataset?.sheetDismissed === 'true') return { duration: 0 }
  return {
    duration: options.duration ?? (context.direction === 'out' ? mobileSheetTiming.exit : mobileSheetTiming.enter),
    easing: context.direction === 'out' ? cubicIn : dampedOut,
    css: (t: number) => `translate: 0 ${(1 - t) * 100}%`,
  }
}
