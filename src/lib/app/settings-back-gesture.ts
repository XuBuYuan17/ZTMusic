import { createMobileSwipe } from './mobile-interaction.ts'

interface SettingsBackOptions {
  enabled: () => boolean
  back: () => void
}

export function settingsBackGesture(node: HTMLElement, initial: SettingsBackOptions) {
  let options = initial
  const swipe = createMobileSwipe(true)
  let pointer: number | null = null
  let horizontal = false
  let suppressClick = false

  const available = () => options.enabled()
    && document.documentElement.classList.contains('mobile-runtime')
    && !document.documentElement.classList.contains('mobile-panel-open')

  function clear() {
    const id = pointer
    pointer = null
    swipe.cancel()
    if (id !== null && node.hasPointerCapture(id)) node.releasePointerCapture(id)
    window.removeEventListener('blur', cancel)
    window.removeEventListener('resize', cancel)
  }

  function cancel() { suppressClick ||= horizontal; horizontal = false; clear() }

  function down(event: PointerEvent) {
    if (pointer === null && event.isPrimary && event.button === 0) suppressClick = false
    if (pointer !== null || !available() || !event.isPrimary || event.button !== 0) return
    const x = event.clientX - node.getBoundingClientRect().left
    if (x < 0 || x > 28) return
    if ((event.target as Element).closest('button, a, input, textarea, select, [role="slider"], [role="switch"], [role="radio"], [contenteditable="true"]')) return
    pointer = event.pointerId
    horizontal = false
    suppressClick = false
    swipe.start(event.clientX, event.clientY)
    window.addEventListener('blur', cancel)
    window.addEventListener('resize', cancel)
  }

  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) return
    if (!available()) { cancel(); return }
    const delta = swipe.move(event.clientX, event.clientY)
    if (delta.direction === 'vertical') { cancel(); return }
    if (delta.direction !== 'horizontal') return
    if (delta.x <= 0) { cancel(); return }
    if (!horizontal) node.setPointerCapture(event.pointerId)
    horizontal = true
    suppressClick = true
    event.preventDefault()
  }

  function finish(event: PointerEvent) {
    if (event.pointerId !== pointer) return
    if (event.type === 'lostpointercapture' && event.target !== node) return
    if (event.type !== 'pointerup') { cancel(); return }
    move(event)
    if (event.pointerId !== pointer) return
    const back = horizontal && swipe.end() === 'previous' && available()
    horizontal = false
    clear()
    if (back) options.back()
  }

  function click(event: MouseEvent) {
    if (!suppressClick || event.detail === 0) return
    suppressClick = false
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  node.addEventListener('pointerdown', down)
  node.addEventListener('pointermove', move, { passive: false })
  node.addEventListener('pointerup', finish)
  node.addEventListener('pointercancel', finish)
  node.addEventListener('lostpointercapture', finish)
  node.addEventListener('click', click, true)
  node.addEventListener('mobile-view-change', cancel)
  return {
    update(next: SettingsBackOptions) { options = next; if (!available()) cancel() },
    destroy() {
      cancel()
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', finish)
      node.removeEventListener('pointercancel', finish)
      node.removeEventListener('lostpointercapture', finish)
      node.removeEventListener('click', click, true)
      node.removeEventListener('mobile-view-change', cancel)
    },
  }
}
