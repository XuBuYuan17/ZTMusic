/**
 * Spring integrator self-check.
 * Run: node --experimental-strip-types src/lib/app/spring.test.ts
 * Status code: 0 = pass, 1 = fail.
 */

import { stepSpring, runSpring } from './spring.ts'

let passed = 0
let failed = 0

function assert(cond: unknown, msg: string) {
  if (cond) { passed++ } else { console.error('FAIL:', msg); failed++ }
}

function finite(n: number): boolean {
  return typeof n === 'number' && !Number.isNaN(n) && Number.isFinite(n)
}

// 逐帧跑到 settle，返回轨迹（dt=16ms，目标 1）
function trace(x: number, v: number, steps = 600): { states: Array<{ x: number; v: number }>; max: number } {
  let s = { x, v }
  const states = [s]
  let max = s.x
  for (let i = 0; i < steps; i++) {
    s = stepSpring(s, 0.016, 1)
    states.push(s)
    if (s.x > max) max = s.x
  }
  return { states, max }
}

// ── settle：从静止到目标 1，600 步内精确吸附 ──
{
  const { states } = trace(0, 0)
  const end = states[states.length - 1]!
  assert(end.x === 1 && end.v === 0, 'settle at {1,0} exactly')
}

// ── 无过冲 ──
{
  const { max } = trace(0, 0)
  assert(max === 1, `no overshoot (max=${max.toFixed(3)})`)
}

// ── 初速度方向：第一帧增量按 v0 排序 ──
{
  const up = stepSpring({ x: 0, v: 3 }, 0.016, 1)
  const none = stepSpring({ x: 0, v: 0 }, 0.016, 1)
  const down = stepSpring({ x: 0, v: -3 }, 0.016, 1)
  assert(up.x > none.x, 'positive v0 moves further on first frame')
  assert(none.x > down.x, 'negative v0 moves less on first frame')
}

// ── 大帧 dt 钳制：不产生 NaN / Infinity，结果落在合理邻域 ──
{
  const s = stepSpring({ x: 0.3, v: 2 }, 99999, 1)
  assert(finite(s.x) && finite(s.v), 'huge dt stays finite')
  assert(s.x >= 0 && s.x <= 1.12, 'huge dt result in sane range')
}

// ── target=0 对称收敛 ──
{
  let s = { x: 1, v: 0 }
  for (let i = 0; i < 600; i++) s = stepSpring(s, 0.016, 0)
  assert(s.x === 0 && s.v === 0, 'settle at target 0')
}

// ── runSpring 确定性：两次结果相同 ──
{
  const a = runSpring({ x: 0, v: 2.4 }, 40)
  const b = runSpring({ x: 0, v: 2.4 }, 40)
  assert(a.x === b.x && a.v === b.v, 'runSpring deterministic')
}

{
  let opening = { x: 0, v: 0 }
  let closing = { x: 1, v: 0 }
  for (let i = 0; i < 80; i++) {
    opening = stepSpring(opening, 0.016, 1)
    closing = stepSpring(closing, 0.016, 0)
    assert(Math.abs(opening.x + closing.x - 1) < 1e-8, 'opening and closing follow mirrored paths')
  }
  const midway = runSpring({ x: 0, v: 0 }, 8)
  const reversed = stepSpring(midway, 0.016, 0)
  assert(Math.abs(reversed.x - midway.x) < 0.1, 'reversal continues without endpoint jump')
  const cancelled = runSpring({ x: 0.75, v: 0 }, 100, 1)
  assert(cancelled.x === 1 && cancelled.v === 0, 'cancelled close drag returns to open')
}

console.log(`spring: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
