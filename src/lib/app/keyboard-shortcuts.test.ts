/**
 * Keyboard shortcuts self-check.
 * Run: node src/lib/app/keyboard-shortcuts.test.ts
 * Status code: 0 = pass, 1 = fail.
 */

import { installKeyboardShortcuts } from './keyboard-shortcuts.ts'

let passed = 0
let failed = 0

function assert(cond: unknown, msg: string): void {
  if (cond) { passed++ } else { console.error('FAIL:', msg); failed++ }
}
function assertEqual(a: unknown, b: unknown, msg: string): void {
  if (a === b) { passed++ } else { console.error(`FAIL: ${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); failed++ }
}

// ── minimal window + player mock ──
let listener: ((e: KeyboardEvent) => void) | null = null
globalThis.window = {
  addEventListener: (type: string, fn: (e: KeyboardEvent) => void) => { if (type === 'keydown') listener = fn },
  removeEventListener: () => { listener = null },
} as unknown as Window & typeof globalThis

interface MockPlayer {
  id: number
  duration: number
  currentTime: number
  volume: number
  toggleCount: number
  nextCount: number
  prevCount: number
  paused: boolean
  seekedTo: number | null
  volumeSet: number | null
  togglePlay(): void
  next(): void
  prev(): void
  pause(): void
  seek(t: number): void
  setVolume(v: number): void
}

function makePlayer(): MockPlayer {
  return {
    id: 1,
    duration: 200000, // 200s in ms
    currentTime: 50,
    volume: 0.8,
    toggleCount: 0,
    nextCount: 0,
    prevCount: 0,
    paused: false,
    seekedTo: null,
    volumeSet: null,
    togglePlay() { this.toggleCount++ },
    next() { this.nextCount++ },
    prev() { this.prevCount++ },
    pause() { this.paused = true },
    seek(t) { this.seekedTo = t },
    setVolume(v) { this.volumeSet = v; this.volume = v },
  }
}

interface FireKeyOptions {
  ctrl?: boolean
  meta?: boolean
  alt?: boolean
  target?: unknown
}

function fireKey(key: string, opts: FireKeyOptions = {}): void {
  const e: Record<string, unknown> = {
    key,
    ctrlKey: opts.ctrl || false,
    metaKey: opts.meta || false,
    altKey: opts.alt || false,
    target: opts.target || { tagName: 'BODY', isContentEditable: false },
    preventDefault() { e.prevented = true },
  }
  listener?.(e as unknown as KeyboardEvent)
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
  assertEqual(Math.round((player.volumeSet ?? 0) * 100), 85, 'up = +5%')
  fireKey('ArrowDown')
  assertEqual(Math.round((player.volumeSet ?? 0) * 100), 80, 'down = -5%')
  uninstall()
}

// ── mute toggle ──
{
  const player = makePlayer()
  const uninstall = installKeyboardShortcuts({ player, isMobile: () => false })
  fireKey('m')
  assertEqual(player.volumeSet, 0, 'm mutes')
  fireKey('m')
  assert((player.volumeSet ?? 0) > 0, 'm unmutes')
  uninstall()
}

// ── Linux 媒体键兜底：DE 不转发 XF86Audio* 时 WebKitGTK 仍会触发这些 keydown ──
{
  const player = makePlayer()
  const uninstall = installKeyboardShortcuts({ player, isMobile: () => false })
  fireKey('MediaPlayPause')
  assertEqual(player.toggleCount, 1, 'MediaPlayPause toggles play')
  fireKey('MediaTrackNext')
  assertEqual(player.nextCount, 1, 'MediaTrackNext = next')
  fireKey('MediaTrackPrevious')
  assertEqual(player.prevCount, 1, 'MediaTrackPrevious = prev')
  fireKey('MediaStop')
  assertEqual(player.paused, true, 'MediaStop pauses')
  uninstall()
}

if (failed === 0) console.log(`${passed} passed, 0 failed - all good`)
else { console.error(`${passed} passed, ${failed} failed`); process.exitCode = 1 }
