/**
 * Fallback controller self-check.
 * Run: node src/lib/player/fallback.test.js
 * Status code: 0 = pass, 1 = fail.
 */

import { createFallbackController } from './fallback.js'

let passed = 0
let failed = 0

function assert(cond, msg) {
  if (cond) { passed++ } else { console.error('FAIL:', msg); failed++ }
}

function assertEqual(a, b, msg) {
  if (a === b) { passed++ } else { console.error(`FAIL: ${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); failed++ }
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
  assertEqual(r1.url, 'https://a', 'single url: correct url')
  const r2 = c.next()
  assertEqual(r2.status, 'exhausted', 'single url: exhausted after play')
}

// ── fallback chain ──
{
  const c = createFallbackController(['https://a', 'https://b', 'https://c'])
  assertEqual(c.next().url, 'https://a', 'chain 1')
  assertEqual(c.next().url, 'https://b', 'chain 2')
  assertEqual(c.next().url, 'https://c', 'chain 3')
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
  assertEqual(c.next().url, 'https://x', 'updateUrls first')
  assertEqual(c.next().url, 'https://y', 'updateUrls second')
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
  assertEqual(c.next().url, 'https://c', 'removeUrl from middle: skip to c')
  assertEqual(c.next().status, 'exhausted', 'removeUrl from middle: exhausted')
}

// ── removeUrl current failed index adjusts ──
{
  const c = createFallbackController(['https://a', 'https://b'])
  c.next() // a: index=0
  c.removeUrl('https://a') // index was 0, becomes -1
  const r = c.next()
  assertEqual(r.url, 'https://b', 'removeUrl current: next plays remaining')
}

// ── removeUrl nonexistent ──
{
  const c = createFallbackController(['https://a'])
  c.removeUrl('https://nope')
  assertEqual(c.next().url, 'https://a', 'removeUrl nonexistent: safe')
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
process.exit(failed ? 1 : 0)
