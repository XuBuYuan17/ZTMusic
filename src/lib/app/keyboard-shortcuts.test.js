/**
 * Keyboard shortcuts self-check.
 * Run: node src/lib/app/keyboard-shortcuts.test.js
 * Status code: 0 = pass, 1 = fail.
 */

import { installKeyboardShortcuts } from './keyboard-shortcuts.js'

let passed = 0
let failed = 0

function assert(cond, msg) {
  if (cond) { passed++ } else { console.error('FAIL:', msg); failed++ }
}
function assertEqual(a, b, msg) {
  if (a === b) { passed++ } else { console.error(`FAIL: ${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); failed++ }
}

// ── minimal window + player mock ──
let listener = null
globalThis.window = {
  addEventListener: (type, fn) => { if (type === 'keydown') listener = fn },
  removeEventListener: () => { listener = null },
}

function makePlayer() {
  return {
    id: 1,
    duration: 200000, // 200s in ms
    currentTime: 50,
    volume: 0.8,
    toggleCount: 0,
    nextCount: 0,
    prevCount: 0,
    seekedTo: null,
    volumeSet: null,
    togglePlay() { this.toggleCount++ },
    next() { this.nextCount++ },
    prev() { this.prevCount++ },
    seek(t) { this.seekedTo = t },
    setVolume(v) { this.volumeSet = v; this.volume = v },
  }
}

function fireKey(key, opts = {}) {
  const e = {
    key,
    ctrlKey: opts.ctrl || false,
    metaKey: opts.meta || false,
    altKey: opts.alt || false,
    target: opts.target || { tagName: 'BODY', isContentEditable: false },
    preventDefault() { this.prevented = true },
  }
  listener?.(e)
  return e
}

// ── space toggles play ──
{
  const player = makePlayer()
  const uninstall = installKeyboardShortcuts({ player, isMobile: () => false })
  fireKey(' ')
  assertEqual(player.toggleCount, 1, 'space toggles play')
  uninstall()
}

// ── ignored while typing in input ──
{
  const player = makePlayer()
  const uninstall = installKeyboardShortcuts({ player, isMobile: () => false })
  fireKey(' ', { target: { tagName: 'INPUT', isContentEditable: false } })
  assertEqual(player.toggleCount, 0, 'ignored in input')
  uninstall()
}

// ── ignored on mobile ──
{
  const player = makePlayer()
  const uninstall = installKeyboardShortcuts({ player, isMobile: () => true })
  fireKey(' ')
  assertEqual(player.toggleCount, 0, 'ignored on mobile')
  uninstall()
}

// ── arrow seek ──
{
  const player = makePlayer()
  const uninstall = installKeyboardShortcuts({ player, isMobile: () => false })
  fireKey('ArrowRight')
  assertEqual(player.seekedTo, 55, 'right seeks +5')
  fireKey('ArrowLeft')
  assertEqual(player.seekedTo, 45, 'left seeks -5 from currentTime')
  uninstall()
}

// ── ctrl+arrow switches track ──
{
  const player = makePlayer()
  const uninstall = installKeyboardShortcuts({ player, isMobile: () => false })
  fireKey('ArrowRight', { ctrl: true })
  assertEqual(player.nextCount, 1, 'ctrl+right = next')
  fireKey('ArrowLeft', { meta: true })
  assertEqual(player.prevCount, 1, 'meta+left = prev')
  uninstall()
}

// ── volume up/down ──
{
  const player = makePlayer()
  const uninstall = installKeyboardShortcuts({ player, isMobile: () => false })
  fireKey('ArrowUp')
  assertEqual(Math.round(player.volumeSet * 100), 85, 'up = +5%')
  fireKey('ArrowDown')
  assertEqual(Math.round(player.volumeSet * 100), 80, 'down = -5%')
  uninstall()
}

// ── mute toggle ──
{
  const player = makePlayer()
  const uninstall = installKeyboardShortcuts({ player, isMobile: () => false })
  fireKey('m')
  assertEqual(player.volumeSet, 0, 'm mutes')
  fireKey('m')
  assert(player.volumeSet > 0, 'm unmutes')
  uninstall()
}

if (failed === 0) console.log(`${passed} passed, 0 failed - all good`)
else { console.error(`${passed} passed, ${failed} failed`); process.exit(1) }
