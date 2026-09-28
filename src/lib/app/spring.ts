// 弹簧物理：纯函数积分，无 DOM / rAF。rAF 薄驱动在 player-morph store。
// 单位：x 为任意插值量（morph 里是 0..1 的进度），v 为 x/秒，dt 为秒。

export interface SpringState { x: number; v: number }
export interface SpringParams { stiffness: number; damping: number }

// 临界阻尼：展开与收回共用，不在端点回弹。
export const LYRIC_SPRING: SpringParams = { stiffness: 300, damping: 35 }

const MAX_DT = 0.032       // 后台切回的大帧钳制，防数值爆炸
const SUBSTEP_AT = 0.02    // 超过则拆两个半步积分
const SETTLE_X = 0.001
const SETTLE_V = 0.012

function integrate(s: SpringState, dt: number, target: number, p: SpringParams): SpringState {
  // semi-implicit Euler：先更新 v 再用新 v 更新 x，比显式 Euler 稳定
  const a = -p.stiffness * (s.x - target) - p.damping * s.v
  const v = s.v + a * dt
  return { x: s.x + v * dt, v }
}

// 给定状态与帧时长返回下一状态；满足 settle 阈值时精确吸附到目标（不留下来回抖尾）
export function stepSpring(s: SpringState, dt: number, target = 1, p: SpringParams = LYRIC_SPRING): SpringState {
  const clamped = Math.min(dt, MAX_DT)
  const next = clamped > SUBSTEP_AT
    ? integrate(integrate(s, clamped / 2, target, p), clamped / 2, target, p)
    : integrate(s, clamped, target, p)
  if (Math.abs(next.x - target) < SETTLE_X && Math.abs(next.v) < SETTLE_V) return { x: target, v: 0 }
  return next
}

// 固定 16ms 跑 N 步：测试 / 预演用，结果确定
export function runSpring(s: SpringState, steps: number, target = 1, p: SpringParams = LYRIC_SPRING): SpringState {
  let state = s
  for (let i = 0; i < steps; i++) state = stepSpring(state, 0.016, target, p)
  return state
}
