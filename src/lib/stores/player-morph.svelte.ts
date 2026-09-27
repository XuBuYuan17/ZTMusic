/**
 * PlayerMorph — 桌面播放器「迷你条 ↔ 全屏」连续变形状态
 *
 * 单一进度 p（0=条，1=全屏）驱动所有几何；拖拽期直接写 p（跟手），
 * 松手后由 spring.ts 积分 rAF 驱动。几何/判定纯函数在 morph-geometry.ts。
 * 仅桌面使用：PlayerMorph.svelte 挂载，移动端不挂载。
 */

import { stepSpring } from '../app/spring.ts'
import {
  rectLerp, panToProgress, sampleVelocity, decideSnap, travelRange,
  type Rect, type Sample,
} from '../app/morph-geometry.ts'
import { reducedMotion } from '../app/desktop-motion.ts'

type Phase = 'closed' | 'dragging' | 'animating' | 'open'

export function elementRect(el: Element, radius: number): Rect {
  const r = el.getBoundingClientRect()
  return {
    top: r.top,
    left: r.left,
    right: window.innerWidth - r.right,
    bottom: window.innerHeight - r.bottom,
    width: r.width,
    height: r.height,
    radius,
  }
}

class PlayerMorphState {
  phase = $state<Phase>('closed')
  p = $state(0)
  sourceBar = $state<Rect | null>(null)
  sourceCover = $state<Rect | null>(null)
  sourceTitle = $state<Rect | null>(null)
  targetCover = $state<Rect | null>(null)
  targetTitle = $state<Rect | null>(null)

  private samples: Sample[] = []
  private dragStartY = 0
  private p0 = 0
  private rafId: number | null = null
  private springTarget: 0 | 1 = 0
  private springV = 0
  private lastT = 0

  get active(): boolean { return this.phase !== 'closed' }
  get isOpen(): boolean { return this.phase === 'open' }

  // 外轮廓：源条 rect → 视口（inset 全 0、尺寸为视口、半径 0）
  get surfaceRect(): Rect {
    const src = this.sourceBar
    if (!src) return { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0, radius: 0 }
    return rectLerp(src, {
      top: 0, right: 0, bottom: 0, left: 0,
      width: window.innerWidth, height: window.innerHeight, radius: 0,
    }, this.p)
  }

  // 共享封面：源 48px → 槽位大封面；目标未测到前恒驻源
  get coverRect(): Rect | null {
    if (!this.sourceCover) return null
    return rectLerp(this.sourceCover, this.targetCover ?? this.sourceCover, this.p)
  }

  // 共享标题同理
  get titleRect(): Rect | null {
    if (!this.sourceTitle) return null
    return rectLerp(this.sourceTitle, this.targetTitle ?? this.sourceTitle, this.p)
  }

  private measureSources(): void {
    const bar = document.querySelector('.player-bar')
    if (!bar) return
    this.sourceBar = elementRect(bar, 12)
    const cover = bar.querySelector('.lcd-artwork__img')
    this.sourceCover = cover ? elementRect(cover, 6) : null
    const title = bar.querySelector('.lcd-meta__title')
    this.sourceTitle = title ? elementRect(title, 0) : null
  }

  // ── 底栏上滑发起；startY 是 pointerdown 的原始位置，锁轴前位移也计入进度 ──
  beginDrag(startY: number): void {
    this.measureSources()
    if (!this.sourceBar) return
    this.cancelRaf()
    this.phase = 'dragging'
    this.p = 0
    this.p0 = 0
    this.dragStartY = startY
    this.samples = []
  }

  // ── 全屏态下滑发起（源几何保留，从 p=1 反向）──
  beginCloseDrag(): void {
    this.cancelRaf()
    this.phase = 'dragging'
    this.p = 1
    this.p0 = 1
    this.samples = []
  }

  dragTo(clientY: number): void {
    if (this.phase !== 'dragging') return
    const travel = travelRange(window.innerHeight)
    if (!this.samples.length) this.dragStartY = clientY
    this.p = panToProgress(this.p0, clientY - this.dragStartY, travel)
    this.samples.push({ y: clientY, t: performance.now() })
    if (this.samples.length > 6) this.samples.shift()
  }

  endDrag(): void {
    if (this.phase !== 'dragging') return
    const travel = travelRange(window.innerHeight)
    // 钳 ±10 p/s：真实甩动 <9；防同帧微 dt 算出荒谬速度把弹簧轰出远期
    const v = Math.max(-10, Math.min(10, sampleVelocity(this.samples, performance.now()) / travel))
    this.launch(decideSnap(this.p, v), v)
  }

  // ── tap 打开（给一个上抛初速度制造「起步快」）/ 程序化打开 ──
  open(): void {
    if (this.phase === 'open' || this.phase === 'animating') return
    if (!this.sourceBar) this.measureSources()
    this.launch(1, 2.4)
  }

  close(v0 = 0): void {
    if (this.phase === 'closed') return
    this.launch(0, v0)
  }

  private launch(target: 0 | 1, v0: number): void {
    if (reducedMotion()) {
      this.p = target
      this.phase = target === 1 ? 'open' : 'closed'
      return
    }
    this.springTarget = target
    this.springV = v0
    this.phase = 'animating'
    // 无条件重启：launch 必带新初速度，重设时间基线避免 dt 跳变；
    // 也保证「旧帧句柄悬空」时不会留下 rafId 非空但 loop 已死的状态
    this.startLoop()
  }

  private startLoop(): void {
    this.cancelRaf()
    this.lastT = performance.now()
    this.rafId = requestAnimationFrame(this.loop)
  }

  private loop = (now: number): void => {
    if (this.phase !== 'animating') { this.rafId = null; return }
    const dt = (now - this.lastT) / 1000
    this.lastT = now
    const next = stepSpring({ x: this.p, v: this.springV }, dt, this.springTarget)
    this.p = next.x
    this.springV = next.v
    if (next.x === this.springTarget && next.v === 0) {
      this.rafId = null
      this.phase = this.springTarget === 1 ? 'open' : 'closed'
      return
    }
    this.rafId = requestAnimationFrame(this.loop)
  }

  private cancelRaf(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null }
  }

  // resize：未激活无需处理；激活时重测源（目标槽位由组件 effect 重测）
  remeasure(): void {
    if (this.phase === 'closed' || this.phase === 'open') return
    this.measureSources()
  }

  // 可见性恢复后兜底：动画态且帧循环已断则以当前 p/v 续跑
  resumeStalled(): void {
    if (this.phase === 'animating' && this.rafId === null) this.startLoop()
  }
}

export const playerMorph = new PlayerMorphState()

window.addEventListener('resize', () => playerMorph.remeasure())

// 页面隐藏期间 rAF 不触发：回到可见时若句柄已悬空则补调度，杜绝动画冻结
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) playerMorph.resumeStalled()
})
