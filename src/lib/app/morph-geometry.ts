// 播放器 morph 的纯几何 / 手势判定：无 DOM。rect 同时携带 inset 四边与尺寸，
// 外轮廓插值用 inset，封面 / 标题插值用 left/top + width/height。

export interface Rect {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
  radius: number
}

// ── 手势 / 吸附阈值（单一出处，组件与测试共用）──
export const SLOP = 8                 // 锁轴前自由位移 px
export const AXIS_RATIO = 1.2         // 主轴位移需 > 副轴的倍数才锁轴
export const SAMPLE_WINDOW = 110      // 速度采样窗口 ms
export const PROJECTION_T = 0.22      // 松手后惯性投射时长 s
export const SNAP_P = 0.5
export const HARD_OPEN = 0.62         // 越过恒开（无视速度）
export const HARD_CLOSE = 0.14        // 低于且无明显上甩恒关

// 手指走满 travel 即 p=1：视口高度的 45%，夹在 300..440px
export function travelRange(viewportHeight: number): number {
  return Math.min(440, Math.max(300, viewportHeight * 0.45))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function rectLerp(a: Rect, b: Rect, t: number): Rect {
  return {
    top: lerp(a.top, b.top, t),
    right: lerp(a.right, b.right, t),
    bottom: lerp(a.bottom, b.bottom, t),
    left: lerp(a.left, b.left, t),
    width: lerp(a.width, b.width, t),
    height: lerp(a.height, b.height, t),
    radius: lerp(a.radius, b.radius, t),
  }
}

// 竖向位移 → 进度：dy 为负（上滑）时进度增大；p0 是本次手势起点进度（0 或 1）
export function panToProgress(p0: number, dy: number, travel: number): number {
  return Math.max(0, Math.min(1, p0 - dy / travel))
}

export interface Sample { y: number; t: number }

// 采样窗口内的平均速度 px/s：y 减小（上滑）为正。不足两点或同帧返回 0。
export function sampleVelocity(samples: Sample[], now: number): number {
  const recent = samples.filter(s => now - s.t <= SAMPLE_WINDOW)
  if (recent.length < 2) return 0
  const first = recent[0]!
  const last = recent[recent.length - 1]!
  const dt = last.t - first.t
  if (dt <= 0) return 0
  return (first.y - last.y) / (dt / 1000)
}

// 松手吸附：位置硬阈值优先，否则把进度按初速度投射 220ms 后看落在哪一侧
export function decideSnap(p: number, v: number): 0 | 1 {
  if (p >= HARD_OPEN) return 1
  if (p <= HARD_CLOSE && v < 2) return 0
  const proj = Math.max(0, Math.min(1, p + v * PROJECTION_T))
  return proj >= SNAP_P ? 1 : 0
}
