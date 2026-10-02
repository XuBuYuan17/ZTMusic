export function mobileFeedback(node: HTMLElement) {
  let active: HTMLElement | null = null
  let pointer: number | null = null
  let start = { x: 0, y: 0 }
  const controls = 'button, a, summary, [role="button"], [role="radio"], [role="switch"]'
  function clear() {
    active?.removeAttribute('data-mobile-pressed')
    active = null
    pointer = null
  }
  function down(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return
    clear()
    const target = (event.target as Element).closest<HTMLElement>(controls)
    if (!target || target.matches(':disabled, [aria-disabled="true"], [class*="backdrop"], .m-sheet-handle') || target.closest('[inert]')) return
    active = target
    pointer = event.pointerId
    start = { x: event.clientX, y: event.clientY }
    const row = target.matches('[role="button"], .mini-player-open, .nav-item, [role="menuitem"], .am-secondary-row, .sort-sheet-option, .mobile-choice-option, .song-menu__item') || !!target.closest('.queue-item, .track-table tbody')
    target.setAttribute('data-mobile-pressed', row ? 'row' : 'control')
  }
  function move(event: PointerEvent) {
    if (pointer !== event.pointerId || !active) return
    const rect = active.getBoundingClientRect()
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 10 || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) clear()
  }
  function up(event: PointerEvent) { if (pointer === event.pointerId) clear() }
  function key(event: KeyboardEvent) {
    if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return
    const target = (event.target as Element).closest<HTMLElement>(controls)
    if (!target || target.matches(':disabled, [aria-disabled="true"]')) return
    clear()
    active = target
    target.setAttribute('data-mobile-pressed', 'row')
  }
  node.addEventListener('pointerdown', down, true)
  node.addEventListener('keydown', key, true)
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
  window.addEventListener('keyup', clear, true)
  window.addEventListener('blur', clear)
  node.addEventListener('scroll', clear, true)
  return { destroy() {
    clear()
    node.removeEventListener('pointerdown', down, true)
    node.removeEventListener('keydown', key, true)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', up, true)
    window.removeEventListener('keyup', clear, true)
    window.removeEventListener('blur', clear)
    node.removeEventListener('scroll', clear, true)
  } }
}
