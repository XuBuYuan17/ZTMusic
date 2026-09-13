/**
 * Fallback controller self-check.
 * Run: node --experimental-strip-types src/lib/player/fallback.test.ts
 * Status code: 0 = pass, 1 = fail.
 */

import { createFallbackController, type FallbackNextResult } from './fallback.ts'

let passed = 0
let failed = 0

function assert(cond: unknown, msg: string) {
  if (cond) { passed++ } else { console.error('FAIL:', msg); failed++ }
}

function assertEqual(a: unknown, b: unknown, msg: string) {
  if (a === b) { passed++ } else { console.error(`FAIL: ${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); failed++ }
}

function urlOf(r: FallbackNextResult): string {
  return r.status === 'playing' ? r.url : '<not-playing>'
}

// ── empty list → exhausted ──
{
  const c = createFallbackController([])
  const r = c.next()
  assertEqual(r.status, 'exhausted', 'empty list exhausted')
}

// ── single url play then exhausted ──
{
  const c = createFallbackController(['https://a'])
  const r1 = c.next()
  assertEqual(r1.status, 'playing', 'single url: first playing')
  assertEqual(urlOf(r1), 'https://a', 'single url: correct url')
  const r2 = c.next()
  assertEqual(r2.status, 'exhausted', 'single url: exhausted after play')
}

// ── fallback chain ──
{
  const c = createFallbackController(['https://a', 'https://b', 'https://c'])
  assertEqual(urlOf(c.next()), 'https://a', 'chain 1')
  assertEqual(urlOf(c.next()), 'https://b', 'chain 2')
  assertEqual(urlOf(c.next()), 'https://c', 'chain 3')
  assertEqual(c.next().status, 'exhausted', 'chain exhausted')
}

// ── waiting when fillPending ──
{
  const c = createFallbackController(['https://a'])
  c.setFillPending(true)
  c.next() // consume a
  const r = c.next()
  assertEqual(r.status, 'waiting', 'waiting when fillPending after exhaustion')
  c.setFillPending(false)
  assertEqual(c.next().status, 'exhausted', 'exhausted after cancel fill')
}

// ── updateUrls resets ──
{
  const c = createFallbackController(['https://a'])
  c.next()
  c.updateUrls(['https://x', 'https://y'])
  assertEqual(urlOf(c.next()), 'https://x', 'updateUrls first')
  assertEqual(urlOf(c.next()), 'https://y', 'updateUrls second')
  assertEqual(c.next().status, 'exhausted', 'updateUrls exhausted')
}

// ── updateUrls cancels fillPending ──
{
  const c = createFallbackController(['https://a'])
  c.setFillPending(true)
  c.updateUrls(['https://b'])
  assertEqual(c.next().status, 'playing', 'updateUrls cancels fillPending')
}

// ── removeUrl from middle ──
{
  const c = createFallbackController(['https://a', 'https://b', 'https://c'])
  c.next() // a
  c.removeUrl('https://b')
  assertEqual(urlOf(c.next()), 'https://c', 'removeUrl from middle: skip to c')
  assertEqual(c.next().status, 'exhausted', 'removeUrl from middle: exhausted')
}

// ── removeUrl current failed index adjusts ──
{
  const c = createFallbackController(['https://a', 'https://b'])
  c.next() // a: index=0
  c.removeUrl('https://a') // index was 0, becomes -1
  const r = c.next()
  assertEqual(urlOf(r), 'https://b', 'removeUrl current: next plays remaining')
}

// ── removeUrl nonexistent ──
{
  const c = createFallbackController(['https://a'])
  c.removeUrl('https://nope')
  assertEqual(urlOf(c.next()), 'https://a', 'removeUrl nonexistent: safe')
}

// ── getUrls returns copy ──
{
  const c = createFallbackController(['https://a', 'https://b'])
  const copy = c.getUrls()
  copy.push('https://c')
  assertEqual(c.getUrls().length, 2, 'getUrls returns copy not reference')
}

// ── getState snapshot ──
{
  const c = createFallbackController(['https://a', 'https://b'])
  c.next()
  const s = c.getState()
  assertEqual(s.index, 0, 'getState.index after first next')
  assertEqual(s.total, 2, 'getState.total')
  assertEqual(s.fillPending, false, 'getState.fillPending')
}

// ── invalid input: null ──
{
  const c = createFallbackController(null)
  assertEqual(c.next().status, 'exhausted', 'null input safe')
}

// ── invalid input: not array ──
{
  const c = createFallbackController('oops')
  assertEqual(c.next().status, 'exhausted', 'non-array input safe')
}

// ── multiple fillPending cycles ──
{
  const c = createFallbackController(['https://a'])
  c.next()
  c.setFillPending(true)
  assertEqual(c.next().status, 'waiting', 'fill pending cycle: waiting')
  c.setFillPending(false)
  c.setFillPending(true)
  assertEqual(c.next().status, 'waiting', 'fill pending cycle: still waiting')
  c.cancelFill()
  assertEqual(c.next().status, 'exhausted', 'fill pending cycle: cancelled')
}

console.log(`\n${passed} passed, ${failed} failed${failed ? ' — FAIL' : ' — all good'}`)
// 用 exitCode 而非 process.exit()：Windows + Node 类型擦除 loader 下强退会撞上 libuv 句柄断言
process.exitCode = failed ? 1 : 0
