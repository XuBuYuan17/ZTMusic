import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(pathToFileURL(process.env.PR9_PLAYWRIGHT_MODULE).href)
const appId = 'com.zheting.music.androidtest'
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim()
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
    for (const savedTheme of [null, systemTheme === 'dark' ? 'light' : 'dark']) {
      adb('shell', 'am', 'force-stop', appId)
      adb('logcat', '-c')
      adb('shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1')
      let pid
      for (let attempt = 0; attempt < 75; attempt++) {
        pid = adb('shell', 'pidof', appId)
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
      const name = systemTheme + '-' + expectedTheme
      await page.screenshot({ path: 'startup-artifacts/' + name + '.png' })
      results.push({ systemTheme, savedTheme, ...state, nativeLog })
      if (!savedTheme) {
        // Persist an app preference opposite to the device theme, then cold launch again.
        await page.evaluate(theme => localStorage.setItem('zheting-theme', theme), systemTheme === 'dark' ? 'light' : 'dark')
        await page.reload()
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme && document.querySelector('.mobile-app'),
          systemTheme === 'dark' ? 'light' : 'dark')
        await page.waitForTimeout(500)
      }
      await browser.close()
      browser = null
    }
  }
  await writeFile('startup-artifacts/metrics.json', JSON.stringify(results, null, 2))
  console.log('ANDROID_STARTUP_METRICS:' + JSON.stringify(results))
} finally {
  await browser?.close()
}
