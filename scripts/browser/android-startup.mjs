import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { waitForProcess } from './android-process.mjs'

const { _android: android } = await import(pathToFileURL(process.env.PR9_PLAYWRIGHT_MODULE).href)
const appId = 'com.zheting.music.androidtest'
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', timeout: 10000 }).trim()
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
await mkdir('startup-artifacts', { recursive: true })
const results = []
let context, device
try {
  ;[device] = await android.devices()
  assert.ok(device, 'Android emulator is not connected')
  adb('shell', 'svc', 'wifi', 'disable')
  adb('shell', 'svc', 'data', 'disable')
  for (const systemTheme of ['light', 'dark']) {
    adb('shell', 'am', 'force-stop', appId)
    adb('shell', 'pm', 'clear', appId)
    adb('shell', 'cmd', 'uimode', 'night', systemTheme === 'dark' ? 'yes' : 'no')
    adb('shell', 'settings', 'put', 'global', 'animator_duration_scale', '1')
    for (const scenario of ['initial', 'saved', 'reduced']) {
      const savedTheme = scenario === 'initial' ? null : systemTheme === 'dark' ? 'light' : 'dark'
      if (scenario === 'reduced') adb('shell', 'settings', 'put', 'global', 'animator_duration_scale', '0')
      adb('shell', 'am', 'force-stop', appId)
      adb('logcat', '-c')
      console.log('STARTUP_SCENARIO:' + systemTheme + '-' + scenario)
      adb('shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1')
      // Android WebView lacks Chrome's browser-context/download-management APIs.
      // Playwright's Android connector uses the supported WebView defaults.
      const pid = await waitForProcess(() => adb('shell', 'pidof', appId))
      const webView = await device.webView({ socketName: 'webview_devtools_remote_' + pid })
      const page = await webView.page()
      context = page.context()
      assert.ok(page)
      const errors = []
      page.on('pageerror', error => errors.push(String(error)))
      await page.waitForFunction(() => document.querySelector('.mobile-app') &&
        performance.getEntriesByName('ztmusic:system-splash-exit').length > 0, null, { timeout: 15000 })
      await page.waitForTimeout(750)
      const state = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        root: getComputedStyle(document.documentElement).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
        home: getComputedStyle(document.querySelector('.main-area')).backgroundColor,
        firstFrame: performance.getEntriesByName('ztmusic:first-shell-frame')[0]?.startTime,
        exit: performance.getEntriesByName('ztmusic:system-splash-exit')[0]?.startTime,
        pending: document.documentElement.classList.contains('android-startup-pending'),
        online: navigator.onLine,
        skeletons: document.querySelectorAll('.skeleton-block').length,
        activities: document.querySelectorAll('.mobile-app').length,
        contentAnimations: performance.getEntriesByName('ztmusic:startup-content-animation').length,
      }))
      const expectedTheme = savedTheme || systemTheme
      assert.equal(state.theme, expectedTheme)
      const base = expectedTheme === 'dark' ? 'rgb(17, 17, 19)' : 'rgb(255, 255, 255)'
      for (const key of ['root', 'body', 'home']) assert.equal(state[key], base, key + ': startup color jump')
      assert.equal(state.pending, false)
      assert.equal(state.activities, 1)
      assert.ok(state.firstFrame >= 0 && state.exit >= state.firstFrame)
      assert.equal(errors.length, 0)
      const nativeLog = adb('logcat', '-d', '-s', 'ZTStartup:I', '*:S')
      assert.match(nativeLog, /first-frame-ready ms=\d+/)
      const audioLog = adb('logcat', '-d', '-s', 'ZTAudioStartup:D', '*:S')
      assert.match(audioLog, /state.restore silent=true service=false/)
      assert.doesNotMatch(audioLog, /PlaybackService.onCreate|ExoPlayer.build|MediaSession.build|service.command=(play|start|volume)/,
        'restoring the first screen must not activate native playback')
      const audioState = adb('shell', 'dumpsys', 'audio')
      const mediaState = adb('shell', 'dumpsys', 'media_session')
      assert.doesNotMatch(audioState.split('Audio Focus stack')[1]?.split('\n\n')[0] || '', /com\.zheting\.music\.androidtest/)
      await writeFile('startup-artifacts/' + systemTheme + '-' + scenario + '-audio.txt', audioState)
      await writeFile('startup-artifacts/' + systemTheme + '-' + scenario + '-media-session.txt', mediaState)
      await writeFile('startup-artifacts/' + systemTheme + '-' + scenario + '-audio-log.txt', audioLog)
      if (scenario === 'reduced') assert.equal(state.contentAnimations, 0)
      const name = systemTheme + '-' + expectedTheme + '-' + scenario
      await page.screenshot({ path: 'startup-artifacts/' + name + '.png' })
      results.push({ systemTheme, savedTheme, scenario, ...state, nativeLog, audioLog })
      console.log('STARTUP_CASE_METRICS:' + JSON.stringify(results.at(-1)))
      if (!savedTheme) {
        // Persist an app preference opposite to the device theme, then cold launch again.
        await page.evaluate(theme => localStorage.setItem('zheting-theme', theme), systemTheme === 'dark' ? 'light' : 'dark')
        await page.reload()
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme && document.querySelector('.mobile-app') && !document.documentElement.classList.contains('android-startup-pending'),
          systemTheme === 'dark' ? 'light' : 'dark')
        await page.waitForTimeout(500)
        console.log('STARTUP_RELOAD_PASSED:' + systemTheme)
      }
      await context.close()
      context = null
    }
  }
  // Keep the app data: this second phase tests real Media3 playback and authoritative
  // native queue restoration after both force-stop and simulated process reclamation.
  const { verifyNativePlayback } = await import('./android-playback.mjs')
  results.push(await verifyNativePlayback({ device, appId, adb, pause }))
  await writeFile('startup-artifacts/metrics.json', JSON.stringify(results, null, 2))
  console.log('ANDROID_STARTUP_METRICS:' + JSON.stringify(results))
} catch (error) {
  try {
    const current = context?.pages()[0]
    if (current) console.log('STARTUP_FAILED_DOCUMENT:' + JSON.stringify(await current.evaluate(() => ({
      url: location.href, title: document.title,
      frame: performance.getEntriesByName('ztmusic:first-shell-frame'),
      exit: performance.getEntriesByName('ztmusic:system-splash-exit'),
      html: document.body.innerText.slice(0, 2000),
      pending: document.documentElement.classList.contains('android-startup-pending'),
    }))))
    const nativePng = execFileSync('adb', ['exec-out', 'screencap', '-p'], { timeout: 10000, maxBuffer: 8 * 1024 * 1024 })
    await writeFile('startup-artifacts/failure.png', nativePng)
    console.log('ANDROID_FAILURE_SCREENSHOT_BASE64:' + nativePng.toString('base64'))
  } catch (diagnostic) { console.log('STARTUP_DIAGNOSTIC_ERROR:' + diagnostic) }
  // Collect each independently: a missing inspector or screenshot must not discard native evidence.
  for (const [name, args] of [
    ['logcat.txt', ['logcat', '-d']],
    ['activity.txt', ['shell', 'dumpsys', 'activity']],
    ['media-session.txt', ['shell', 'dumpsys', 'media_session']],
    ['audio.txt', ['shell', 'dumpsys', 'audio']],
  ]) {
    try { await writeFile('startup-artifacts/' + name, adb(...args)) }
    catch (diagnostic) { console.log('STARTUP_DIAGNOSTIC_ERROR:' + name + ':' + diagnostic) }
  }
  throw error
} finally {
  await context?.close()
  await device?.close()
}
