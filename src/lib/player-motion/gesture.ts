import { AXIS_RATIO, SLOP } from '../app/morph-geometry.ts'
import type { PlayerSurfaceController } from './controller.ts'

interface GestureOptions {
  controller?: PlayerSurfaceController
  opening?: boolean
  blocked?: () => boolean
  horizontal?: (x: number) => void
  changeTrack?: (direction: 1 | -1) => void
}

export function playerSurfaceGesture(node: HTMLElement, initial: GestureOptions) {
  let options = initial
  let start: { id: number; x: number; y: number; time: number } | undefined
  let axis: 'horizontal' | 'vertical' | undefined
  let moved = false
  let suppressClick = false
  let dx = 0

  function down(event: PointerEvent) {
    if (!options.controller || start || !event.isPrimary || event.button !== 0 || options.blocked?.()) return
    start = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp }
    axis = undefined
    moved = false
    suppressClick = false
    dx = 0
    // Window listeners survive the mini player's background becoming inert on mount.
    window.addEventListener('pointermove', move, { capture: true, passive: false })
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', finish, true)
    window.addEventListener('blur', cancel)
    window.addEventListener('resize', cancel)
  }

  function move(event: PointerEvent) {
    if (!start || event.pointerId !== start.id) return
    dx = event.clientX - start.x
    const dy = event.clientY - start.y
    moved ||= Math.max(Math.abs(dx), Math.abs(dy)) >= SLOP
    if (!axis && moved) {
      if (Math.abs(dx) > Math.abs(dy) * AXIS_RATIO) axis = 'horizontal'
      else if (Math.abs(dy) > Math.abs(dx) * AXIS_RATIO) {
        axis = 'vertical'
        if ((options.opening && dy > 0) || (!options.opening && dy < 0 && options.controller?.phase === 'open')) return
        if (options.opening) node.focus({ preventScroll: true })
        options.controller?.beginDrag(start.y, start.time)
      }
    }
    if (axis === 'vertical' && options.controller?.phase === 'dragging') {
      event.preventDefault()
      options.controller.dragTo(event.clientY, event.timeStamp)
    } else if (axis === 'horizontal') options.horizontal?.(dx)
  }

  function detach() {
    start = undefined
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', finish, true)
    window.removeEventListener('pointercancel', finish, true)
    window.removeEventListener('blur', cancel)
    window.removeEventListener('resize', cancel)
  }

  function cancel() {
    if (!start) return
    suppressClick = moved
    if (axis === 'vertical') options.controller?.cancelDrag()
    options.horizontal?.(0)
    detach()
  }

  function finish(event: PointerEvent) {
    if (!start || event.pointerId !== start.id) return
    if (event.type !== 'pointerup') { cancel(); return }
    move(event)
    suppressClick = moved
    if (axis === 'vertical') options.controller?.release(event.timeStamp)
    if (axis === 'horizontal' && Math.abs(dx) >= 64) options.changeTrack?.(dx < 0 ? 1 : -1)
    else options.horizontal?.(0)
    detach()
  }

  function click(event: MouseEvent) {
    if (suppressClick && event.detail !== 0) {
      event.preventDefault()
      event.stopImmediatePropagation()
      suppressClick = false
    }
  }

  node.addEventListener('pointerdown', down)
  node.addEventListener('lostpointercapture', finish)
  node.addEventListener('click', click, true)
  return {
    update(next: GestureOptions) { options = next },
    destroy() {
      cancel()
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('lostpointercapture', finish)
      node.removeEventListener('click', click, true)
    },
  }
}
