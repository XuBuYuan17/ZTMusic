import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(pathToFileURL(process.env.PR9_PLAYWRIGHT_MODULE).href)
const appId = 'com.zheting.music.androidtest'
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', timeout: 10000 }).trim()
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
await mkdir('startup-artifacts', { recursive: true })
const results = []
let browser
try {
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
      adb('shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1')
      let pid
      for (let attempt = 0; attempt < 75; attempt++) {
        try { pid = adb('shell', 'pidof', appId) }
        catch (error) { if (error.status !== 1) throw error; pid = '' }
        if (pid) {
          adb('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid.split(' ')[0])
          try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); break } catch {}
        }
        await pause(200)
      }
      assert.ok(browser, 'Android WebView did not initialize')
      const page = browser.contexts()[0].pages()[0]
      assert.ok(page)
      const errors = []
      page.on('pageerror', error => errors.push(String(error)))
      await page.waitForFunction(() => document.querySelector('.mobile-app') &&
        performance.getEntriesByName('ztmusic:system-splash-exit').length > 0, { timeout: 15000 })
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
      if (scenario === 'reduced') assert.equal(state.contentAnimations, 0)
      const name = systemTheme + '-' + expectedTheme + '-' + scenario
      await page.screenshot({ path: 'startup-artifacts/' + name + '.png' })
      results.push({ systemTheme, savedTheme, scenario, ...state, nativeLog })
      if (!savedTheme) {
        // Persist an app preference opposite to the device theme, then cold launch again.
        await page.evaluate(theme => localStorage.setItem('zheting-theme', theme), systemTheme === 'dark' ? 'light' : 'dark')
        await page.reload()
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme && document.querySelector('.mobile-app') && !document.documentElement.classList.contains('android-startup-pending'),
          systemTheme === 'dark' ? 'light' : 'dark')
        await page.waitForTimeout(500)
      }
      await browser.close()
      browser = null
    }
  }
  await writeFile('startup-artifacts/metrics.json', JSON.stringify(results, null, 2))
  console.log('ANDROID_STARTUP_METRICS:' + JSON.stringify(results))
} catch (error) {
  try {
    const current = browser?.contexts()[0]?.pages()[0]
    if (current) console.log('STARTUP_FAILED_DOCUMENT:' + JSON.stringify(await current.evaluate(() => ({
      url: location.href, title: document.title,
      frame: performance.getEntriesByName('ztmusic:first-shell-frame'),
      exit: performance.getEntriesByName('ztmusic:system-splash-exit'),
      html: document.body.innerText.slice(0, 2000),
      pending: document.documentElement.classList.contains('android-startup-pending'),
    }))))
    const nativeLog = adb('logcat', '-d')
    await writeFile('startup-artifacts/logcat.txt', nativeLog)
    console.log('STARTUP_NATIVE_FAILURE:' + nativeLog.split('\n').filter(line => /ZTStartup|FATAL EXCEPTION|AndroidRuntime|chromium|client:error/.test(line)).slice(-80).join('\n'))
  } catch (diagnostic) { console.log('STARTUP_DIAGNOSTIC_ERROR:' + diagnostic) }
  throw error
} finally {
  await browser?.close()
}
