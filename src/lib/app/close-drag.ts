// 全屏态「左栏下滑关闭」手势：薄层 action，判定/速度/物理全在 player-morph store。
// 歌词区原生滚动、进度条等不经过这里（只挂 .ly-left）。

import { playerMorph } from '../stores/player-morph.svelte.ts'
import { SLOP, AXIS_RATIO } from './morph-geometry.ts'

export function closeDrag(node: HTMLElement, handle = false) {
  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let active = false
  let suppressClick = false

  function down(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // tools 面板、进度条、滑块、按钮组里的可交互子元素不发起
    if (!handle && (e.target as Element).closest('button, a, input, [role="button"], [role="slider"], .pb-track, .ly-cover-wrap, .ly-track-wrap')) return
    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    active = false
    suppressClick = false
  }

  function move(e: PointerEvent): void {
    if (pointerId !== e.pointerId) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!active) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
      // 只响应竖直向下；斜向偏水平或上移放手给元素自身
      if (dy <= 0 || Math.abs(dy) <= AXIS_RATIO * Math.abs(dx)) { pointerId = null; return }
      active = true
      suppressClick = true
      // 确认手势后才捕获：down 阶段就捕获会让子按钮的 click 目标变成 node，整栏按钮失效
      try { node.setPointerCapture(pointerId) } catch {}
      playerMorph.beginCloseDrag(startY)
    }
    playerMorph.dragTo(e.clientY)
    e.preventDefault()
    e.stopPropagation()
  }

  function up(e: PointerEvent): void {
    if (pointerId !== e.pointerId) return
    if (active) playerMorph.endDrag()
    pointerId = null
    active = false
  }

  function cancel(e: PointerEvent): void {
    if (pointerId !== e.pointerId) return
    if (active) playerMorph.cancelDrag()
    pointerId = null
    active = false
  }

  // 拖拽会吞掉封面按钮本该有的 click 语义：捕获阶段拦一次
  function click(e: MouseEvent): void {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false }
  }

  node.addEventListener('pointerdown', down)
  node.addEventListener('pointermove', move)
  node.addEventListener('pointerup', up)
  node.addEventListener('pointercancel', cancel)
  node.addEventListener('lostpointercapture', cancel)
  node.addEventListener('click', click, true)

  return {
    destroy() {
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
      node.removeEventListener('pointercancel', cancel)
      node.removeEventListener('lostpointercapture', cancel)
      node.removeEventListener('click', click, true)
    },
  }
}
