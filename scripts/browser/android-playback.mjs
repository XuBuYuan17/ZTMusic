import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { waitForProcess } from './android-process.mjs'

export async function verifyNativePlayback({ device, appId, adb, pause }) {
  let context
  const attach = async () => {
    const pid = await waitForProcess(() => adb('shell', 'pidof', appId))
    const view = await device.webView({ socketName: 'webview_devtools_remote_' + pid })
    const page = await view.page()
    context = page.context()
    await page.waitForFunction(() => document.querySelector('.mobile-app') && !document.documentElement.classList.contains('android-startup-pending'), null, { timeout: 15000 })
    return page
  }
  const command = (page, action, data = {}) => page.evaluate(({ action, data }) =>
    window.__TAURI_INTERNALS__.invoke('plugin:zt-player|execute', { payload: { action, data } }), { action, data })
  const waitState = async (page, check, label) => {
    for (let i = 0; i < 80; i++) {
      const state = await command(page, 'state')
      if (check(state)) return state
      await pause(150)
    }
    throw new Error('Media3 state timeout: ' + label)
  }
  const coldStart = async method => {
    await context?.close(); context = null
    if (method === 'force-stop') adb('shell', 'am', 'force-stop', appId)
    else {
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
      const pid = await waitForProcess(() => adb('shell', 'pidof', appId))
      // Debug app UID can kill itself; unlike force-stop, no stopped-package flag.
      adb('shell', 'run-as', appId, 'kill', '-9', String(pid))
    }
    adb('logcat', '-c')
    adb('shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1')
    const page = await attach()
    await pause(800)
    const state = await command(page, 'state')
    assert.equal(state.tracks.length, 2)
    assert.equal(state.index, 1)
    assert.equal(state.playing, false)
    assert.equal(state.loading, false)
    assert.ok(state.anchorPosition >= 5000, 'restore native playback position')
    assert.doesNotMatch(adb('logcat', '-d', '-s', 'ZTAudioStartup:D', '*:S'), /PlaybackService.onCreate/)
    await page.screenshot({ path: 'startup-artifacts/native-queue-' + method + '.png' })
    return page
  }
  try {
    adb('shell', 'settings', 'put', 'global', 'animator_duration_scale', '1')
    adb('shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1')
    let page = await attach()
    // A local PCM tone avoids network mocks: Media3 must open/decode the actual file.
    const rate = 16000, samples = rate * 30
    const wav = Buffer.alloc(44 + samples * 2)
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32)
    wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40)
    for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 1000), 44 + i * 2)
    const key = createHash('sha256').update(wav).digest('hex')
    await command(page, 'cacheChunk', { key, offset: 0, bytes: wav.toString('base64'), last: true })
    const tracks = [910001, 910002].map(id => ({ id, name: 'Native startup test ' + id,
      ar: [{ id: 0, name: 'CI' }], al: { id: 0, name: 'Local PCM', picUrl: '' },
      dt: 30000, source: 'local', nativeUri: 'ztmusic://local/' + key }))
    await command(page, 'queue', { tracks, index: 1, mode: 'list', position: 6000 })
    // Explicit user playback path after UI-only restoration.
    await page.locator('.mini-player-play[aria-label="播放"]').click()
    await waitState(page, state => state.playing, 'initial playback')
    assert.match(adb('shell', 'dumpsys', 'media_session'), /com\.zheting\.music\.androidtest/)
    await command(page, 'pause')
    await waitState(page, state => !state.playing, 'pause')
    await pause(500)
    page = await coldStart('force-stop')
    // Kill a UI-only restored process without ever activating its service.
    page = await coldStart('reclaimed')
    await page.locator('.mini-player-play[aria-label="播放"]').click()
    await waitState(page, state => state.playing && state.index === 1, 'play restored queue')
    adb('shell', 'input', 'keyevent', 'KEYCODE_SLEEP')
    adb('shell', 'input', 'keyevent', 'KEYCODE_MEDIA_PAUSE')
    await waitState(page, state => !state.playing, 'lockscreen pause')
    adb('shell', 'input', 'keyevent', 'KEYCODE_MEDIA_PLAY')
    await waitState(page, state => state.playing, 'lockscreen play')
    adb('shell', 'input', 'keyevent', 'KEYCODE_MEDIA_NEXT')
    await waitState(page, state => state.index === 0, 'lockscreen next')
    // Google APIs emulator runs adbd as root; dispatch the platform noisy broadcast.
    adb('shell', 'am', 'broadcast', '-a', 'android.media.AUDIO_BECOMING_NOISY', '--receiver-foreground')
    await waitState(page, state => !state.playing, 'audio becoming noisy pauses playback')
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
    adb('shell', 'wm', 'dismiss-keyguard')
    const log = adb('logcat', '-d', '-s', 'ZTAudioStartup:D', '*:S')
    await writeFile('startup-artifacts/native-playback-log.txt', log)
    await writeFile('startup-artifacts/native-playback-media-session.txt', adb('shell', 'dumpsys', 'media_session'))
    await writeFile('startup-artifacts/native-playback-audio.txt', adb('shell', 'dumpsys', 'audio'))
    console.log('ANDROID_NATIVE_PLAYBACK_PASSED: queue restore, process reclamation, MediaSession keys and noisy pause')
    return { nativePlayback: true, forceStopRestore: true, processReclamationRestore: true, mediaKeys: true, noisyPause: true }
  } finally { await context?.close() }
}
