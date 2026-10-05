import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createSplashGate, MIN_SPLASH_MS, MAX_SPLASH_MS } from './startup-splash.ts'

function harness() {
  let now = 0
  let id = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  const outcomes: boolean[] = []
  const gate = createSplashGate(timedOut => outcomes.push(timedOut), {
    now: () => now,
    schedule(callback, delay) { timers.set(++id, { at: now + delay, callback }); return id as unknown as ReturnType<typeof setTimeout> },
    cancel(timer) { timers.delete(timer as unknown as number) },
  })
  function advance(time: number) {
    const until = now + time
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      timers.delete(next[0]); now = next[1].at; next[1].callback()
    }
    now = until
  }
  return { gate, outcomes, timers, advance }
}

{
  const h = harness()
  h.gate.ready(); h.advance(10000)
  assert.deepEqual(h.outcomes, [], 'hidden native WebView must not consume the visible minimum')
  h.gate.start(); h.gate.start(); h.gate.ready(); h.gate.ready()
  h.advance(MIN_SPLASH_MS - 1); assert.deepEqual(h.outcomes, [])
  h.advance(1); assert.deepEqual(h.outcomes, [false])
  h.advance(MAX_SPLASH_MS); assert.deepEqual(h.outcomes, [false])
  assert.equal(h.timers.size, 0)
}
{
  const h = harness()
  h.gate.start(); h.advance(3500)
  assert.deepEqual(h.outcomes, [], 'elapsed time alone is not app readiness')
  h.gate.ready(); assert.deepEqual(h.outcomes, [false], 'late readiness should not add another minimum')
}
{
  const h = harness()
  h.gate.start(); h.advance(MAX_SPLASH_MS - 1); assert.deepEqual(h.outcomes, [])
  h.advance(1); h.gate.ready(); h.gate.skip()
  assert.deepEqual(h.outcomes, [true], 'timeout exits once even if native state arrives late')
}
for (const beforeStart of [false, true]) {
  const h = harness()
  if (!beforeStart) h.gate.start()
  h.gate.skip(); h.gate.start(); h.gate.ready(); h.advance(MAX_SPLASH_MS)
  assert.deepEqual(h.outcomes, [true], 'explicit skip does not wait for readiness')
}
{
  const h = harness()
  h.gate.start(); h.gate.ready(); h.gate.destroy(); h.advance(MAX_SPLASH_MS)
  assert.deepEqual(h.outcomes, []); assert.equal(h.timers.size, 0, 'destroy removes both timers')
}

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8')
const app = await read('../../App.svelte')
const splash = await read('../components/StartupSplash.svelte')
const sheet = await read('../components/LyricsPageV2.svelte')
assert.match(app, /\{#if isMobile && startupActive\}/, 'desktop must not mount the branded overlay')
assert.match(app, /showLogin=\{showLogin && !startupActive\}/, 'expired login must not steal focus before splash completion')
assert.ok(!splash.includes('进入首页'), 'branded animation must not display a skip button')
assert.match(splash, /ztmusic:android-state-restored/, 'Android readiness uses native metadata hydration, not audio loading')
assert.match(splash, /setTimeout\(complete, 1400\)/, 'animation completion has an independent deadline')
assert.match(splash, /prefers-reduced-motion/)
assert.ok(!app.includes('startupPlayer'), 'startup must not automatically expand the player')
assert.match(splash, /\.mobile-mini-player \[data-startup-cover\]/, 'the continuous cover lands on the mini player')
assert.match(app, /<main class="app-shell" inert=\{isMobile && \(startupActive \|\|/, 'startup blocks the application shell while the splash owns input')
assert.match(app, /player-bar-wrap" inert=\{isMobile && startupActive\}/, 'startup blocks mini-player input until cover handoff completes')
assert.doesNotMatch(sheet, /inert=\{startupPending\}/, 'startup input gating must not replace the normal player-sheet enter lifecycle')
assert.ok(!/iframe|window\.ZTSplash/.test(splash))
console.log('startup splash: visible minimum, real readiness, timeout, skip, cancellation and integration boundaries passed')
