/**
 * Morph geometry / gesture self-check.
 * Run: node --experimental-strip-types src/lib/app/morph-geometry.test.ts
 * Status code: 0 = pass, 1 = fail.
 */

import {
  lerp, rectLerp, panToProgress, sampleVelocity, decideSnap, travelRange,
  HARD_OPEN, HARD_CLOSE,
} from './morph-geometry.ts'
import type { Rect, Sample } from './morph-geometry.ts'

let passed = 0
let failed = 0

function assert(cond: unknown, msg: string) {
  if (cond) { passed++ } else { console.error('FAIL:', msg); failed++ }
}

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps
}

function rect(v: number, radius = 0): Rect {
  return { top: v, right: v, bottom: v, left: v, width: v, height: v, radius }
}

// ── lerp ──
assert(lerp(0, 10, 0) === 0, 'lerp t=0')
assert(lerp(0, 10, 1) === 10, 'lerp t=1')
assert(lerp(0, 10, 0.5) === 5, 'lerp midpoint')

// ── rectLerp：端点与中点逐字段 ──
{
  const a = rect(0, 0)
  const b = rect(10, 12)
  const at0 = rectLerp(a, b, 0)
  const at1 = rectLerp(a, b, 1)
  const mid = rectLerp(a, b, 0.5)
  assert(at0.left === 0 && at0.radius === 0, 'rectLerp t=0')
  assert(at1.left === 10 && at1.radius === 12, 'rectLerp t=1')
  assert(mid.width === 5 && mid.radius === 6, 'rectLerp midpoint')
}

// ── travelRange：夹在 300..440 ──
assert(travelRange(500) === 300, 'travel clamps to 300')
assert(travelRange(2000) === 440, 'travel clamps to 440')
assert(approx(travelRange(800), 360), 'travel = 45% of height')

// ── panToProgress：clamp 与方向 ──
assert(panToProgress(0, -360, 360) === 1, 'upward full travel → 1')
assert(panToProgress(0, 0, 360) === 0, 'no movement → p0')
assert(panToProgress(0, -9999, 360) === 1, 'clamp to 1')
assert(panToProgress(1, 360, 360) === 0, 'downward from open → 0')
assert(approx(panToProgress(0, -180, 360), 0.5), 'halfway up → .5')

// ── sampleVelocity ──
{
  assert(sampleVelocity([], 1000) === 0, 'empty samples → 0')
  assert(sampleVelocity([{ y: 100, t: 900 }], 1000) === 0, 'single sample → 0')
  // 100ms 内 y 从 100 → 50（上滑）：500 px/s
  const pts: Sample[] = [{ y: 100, t: 900 }, { y: 50, t: 1000 }]
  assert(approx(sampleVelocity(pts, 1000), 500), 'upward velocity 500px/s positive')
  // 窗口外的旧点丢弃
  const stale: Sample[] = [{ y: 500, t: 0 }, { y: 100, t: 900 }, { y: 50, t: 1000 }]
  assert(approx(sampleVelocity(stale, 1000), 500), 'samples outside window dropped')
  // 下滑为负
  const down: Sample[] = [{ y: 50, t: 900 }, { y: 100, t: 1000 }]
  assert(approx(sampleVelocity(down, 1000), -500), 'downward velocity negative')
}

// ── decideSnap ──
assert(decideSnap(HARD_OPEN, -100) === 1, 'at HARD_OPEN always opens')
assert(decideSnap(HARD_CLOSE, 0) === 0, 'at HARD_CLOSE low speed closes')
assert(decideSnap(HARD_CLOSE, 8) === 1, 'flick up from bottom opens')
assert(decideSnap(0.5, 0) === 1, 'zero velocity at midpoint opens (>=.5)')
assert(decideSnap(0.3, 8) === 1, 'flick from .3 projects past midpoint → open')
assert(decideSnap(0.55, -8) === 0, 'flick down from .55 → close')
assert(decideSnap(0.4, 0) === 0, 'slow drag below midpoint → close')

console.log(`morph-geometry: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
