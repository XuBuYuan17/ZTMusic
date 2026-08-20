import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectMediaBackend } from './native-media-platform.js'

assert.equal(selectMediaBackend(false, 'Win32'), 'web', 'browser build should use Media Session')
assert.equal(selectMediaBackend(true, 'Win32'), 'native', 'Tauri Windows should use native SMTC')
assert.equal(selectMediaBackend(true, 'Linux x86_64'), 'native', 'Tauri Linux should use MPRIS')
assert.equal(selectMediaBackend(true, 'MacIntel'), 'web', 'Tauri macOS should keep Media Session')
assert.equal(selectMediaBackend(true, 'Android'), 'web', 'Tauri Android should use the system Web Media Session notification')
assert.equal(selectMediaBackend(true, 'Linux armv8l Android'), 'web', 'Android WebView should not be mistaken for desktop Linux')

const root = new URL('../../../', import.meta.url)
const smtc = await readFile(new URL('src-tauri/src/windows_smtc.rs', root), 'utf8')
const tauriLib = await readFile(new URL('src-tauri/src/lib.rs', root), 'utf8')
const player = await readFile(new URL('src/lib/stores/player.svelte.js', root), 'utf8')
const config = JSON.parse(await readFile(new URL('src-tauri/tauri.conf.json', root), 'utf8'))

assert.ok(smtc.includes('GetForWindow'), 'Windows SMTC must bind to the Tauri HWND')
assert.ok(smtc.includes('SetCurrentProcessExplicitAppUserModelID'), 'Windows process must register an AUMID')
assert.ok(!smtc.includes('MediaPlayer::new()'), 'do not recreate the empty automatic MediaPlayer session')
assert.ok(
  tauriLib.indexOf('WindowsSmtcState::new') > tauriLib.indexOf('pub fn run()'),
  'Windows SMTC must initialize in the main app setup after the configured window exists',
)
assert.ok(player.includes('shouldUseWebMediaSession() &&'), 'player metadata must be gated away from WebView2 on Windows')
assert.ok(player.includes('navigator.mediaSession.metadata = new MediaMetadata'), 'web media session must publish metadata for Android system media notifications')
assert.ok(player.includes("this._setMediaActionHandler('nexttrack'"), 'web media session must expose Android media notification controls')
assert.match(
  config.app.windows[0].additionalBrowserArgs,
  /HardwareMediaKeyHandling/,
  'WebView2 hardware media handling must stay disabled',
)

console.log('native media backend self-check: 14 assertions passed')
