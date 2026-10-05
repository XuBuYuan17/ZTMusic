import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const modulePath = process.env.PR9_PLAYWRIGHT_MODULE
assert.ok(modulePath, 'Set PR9_PLAYWRIGHT_MODULE to an existing Playwright module; this check does not install browsers')
const { chromium } = await import(pathToFileURL(modulePath).href)
const browser = await chromium.launch({ headless: true, ...(process.env.ZT_BROWSER_CHANNEL ? { channel: process.env.ZT_BROWSER_CHANNEL } : {}) })
const output = resolve(process.env.ZT_SPLASH_ARTIFACTS || 'browser-artifacts/startup-splash')
await mkdir(output, { recursive: true })
const coverSvg = await readFile(new URL('./cover.svg', import.meta.url), 'utf8')
const api = { code: 200, banners: [], result: [], playlists: [], albums: [], data: { blocks: [], dailySongs: [] } }
const baseUrl = process.env.ZT_SPLASH_URL || 'http://127.0.0.1:5173/'
const results = []

async function scenario(name, options = {}) {
  if (process.env.ZT_SPLASH_CASE && !process.env.ZT_SPLASH_CASE.split(',').includes(name)) return
  const context = await browser.newContext({ viewport: options.viewport || { width: 390, height: 844 }, isMobile: !options.desktop, hasTouch: !options.desktop, reducedMotion: options.reduced ? 'reduce' : 'no-preference', ...(options.native ? { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' } : {}) })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/ncm-api/**', route => route.fulfill({ json: api }))
  await page.route('**/startup-cover.svg*', route => route.fulfill({ contentType: 'image/svg+xml', body: options.brokenCover ? '<svg invalid' : coverSvg }))
  await page.route('**/109951172051500248.jpg*', route => route.fulfill({ contentType: 'image/svg+xml', body: coverSvg }))
  await page.addInitScript(({ native, delay, revealDelay, stuck, theme, cover, systemReduced, expired, api }) => {
    localStorage.setItem('zheting-theme', theme || 'dark')
    window.__startupCommands = []
    if (expired) {
      localStorage.setItem('auth_user', JSON.stringify({ userId: 7, nickname: '过期会话' }))
      localStorage.setItem('auth_mode', 'account')
    }
    if (!native) return
    let callbackId = 0
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return ++callbackId }, unregisterCallback() {},
      async invoke(command, args) {
        if (command === 'api_request') return { data: expired && args.request.endpoint === '/login/status' ? { code: 200, account: { anonimousUser: true } } : api }
        if (command === 'plugin:zt-player|execute') {
          const action = args.payload.action
          window.__startupCommands.push(action)
          if (action === 'startupTheme') return { theme: theme || 'dark' }
          if (action === 'startupReady') {
            setTimeout(() => {
              window.__nativeRevealAt = performance.now()
              window.dispatchEvent(new CustomEvent('ztmusic:android-reveal', { detail: { animate: !systemReduced } }))
            }, revealDelay || 30)
          }
          if (action === 'start' || action === 'queue') {
            window.__startedQueue = args.payload.data.tracks
            window.__nativePlaying = action === 'start'
          }
          if (action === 'state' || action === 'start' || action === 'queue') {
            if (stuck && action === 'state') return new Promise(() => {})
            if (delay && action === 'state') await new Promise(resolve => setTimeout(resolve, delay))
            const tracks = window.__startedQueue || (cover ? [{ id: 42, name: '真实会话测试', ar: [{ id: 7, name: '测试艺人' }], al: { id: 9, name: '测试专辑', picUrl: location.origin + '/startup-cover.svg' }, picUrl: location.origin + '/startup-cover.svg', dt: 228000 }] : [])
            return {
              anchorPosition: cover && !window.__startedQueue ? 84000 : 0, anchorTimestamp: Date.now(), playbackSpeed: 1, duration: tracks[0]?.dt || 0,
              playing: !!window.__nativePlaying, loading: false, ended: false, index: tracks.length ? 0 : -1, volume: .8, mode: 'list', error: '', tracks,
            }
          }
          if (action === 'journal') return { cursor: 0, rows: [] }
        }
        return {}
      },
    }
  }, { native: options.native, delay: options.delay, revealDelay: options.revealDelay, stuck: options.stuck, theme: options.theme, cover: options.cover, systemReduced: options.systemReduced, expired: options.expired, api })

  try {
    await page.goto(baseUrl + (options.desktop ? '' : '?mobile'), { waitUntil: 'domcontentloaded' })
    if (options.desktop) {
      await page.waitForSelector('.main-area')
      assert.equal(await page.locator('[data-startup-splash]').count(), 0)
      assert.equal(await page.locator('.ly-fullscreen').count(), 0)
    } else {
      await page.waitForSelector('[data-startup-splash].visible')
      assert.equal(await page.getByRole('button', { name: '进入首页', exact: true }).count(), 0)
      {
        const elapsed = await page.evaluate(() => performance.now() - performance.getEntriesByName('ztmusic:splash-visible')[0].startTime)
        await page.waitForTimeout(Math.max(0, 1800 - elapsed))
        if (options.expired) {
          assert.equal(await page.locator('.login-overlay').count(), 0, 'login modal waits until splash completion')
          assert.equal(await page.locator('[data-startup-splash]').getAttribute('inert'), null)
        }
        if (options.reduced || options.systemReduced) {
          assert.equal(await page.evaluate(() => document.querySelector('[data-startup-splash]').getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0)
        }
        if (options.capture) await page.screenshot({ path: join(output, name + '-splash.png') })
      }
      if (options.rotate) await page.setViewportSize({ width: 844, height: 390 })
      const frames = await page.evaluate(async () => {
        const frames = []
        while (document.querySelector('[data-startup-splash]') && frames.length < 600) {
          await new Promise(requestAnimationFrame)
          const splash = document.querySelector('[data-startup-splash]')
          const cover = splash?.querySelector('.startup-cover')
          const target = document.querySelector('[data-startup-cover]')
          if (cover && splash.classList.contains('exiting')) frames.push({ at: performance.now(), from: cover.getBoundingClientRect().toJSON(), to: target?.getBoundingClientRect().toJSON(), hidden: target ? getComputedStyle(target).visibility : null })
        }
        return frames
      })
      await page.waitForSelector('[data-startup-splash]', { state: 'detached', timeout: 10000 })
      const home = options.stuck || options.rotate
      assert.equal(await page.locator('.ly-fullscreen').count(), 0, 'startup enters discovery, not the fullscreen player')
      if (!options.rotate) {
        if (options.expired) {
          await page.waitForSelector('.login-overlay')
          await page.locator('.login-card').getByRole('button', { name: '关闭', exact: true }).click()
          await page.waitForSelector('.login-overlay', { state: 'detached' })
        }
        const target = page.locator('[data-startup-cover]')
        assert.equal(await target.evaluate(node => getComputedStyle(node).visibility), 'visible')
        assert.equal(await page.locator('.app-shell').getAttribute('inert'), null)
        assert.equal(await page.locator('[data-route-key="explore"]:not([inert])').count(), 1)
        if (options.cover && !options.brokenCover) {
          assert.equal(await target.locator('img').evaluate(image => image.complete && image.naturalWidth > 0), true)
          assert.equal(await page.locator('.mini-player-info strong').textContent(), '真实会话测试')
        } else if (!options.cover) {
          assert.equal(await page.locator('.mini-player-info strong').textContent(), '下等马')
          assert.equal(await page.getByRole('button', { name: '播放', exact: true }).isEnabled(), true)
        }
        if (!home && !options.reduced && !options.systemReduced && frames.length > 1) {
          const last = frames.at(-1)
          for (const key of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(last.from[key] - last.to[key]) < 2, name + ': cover must land on the real slot')
          for (let i = 1; i < frames.length; i++) {
            // WAAPI continues while a busy JS thread skips rAF samples; compare speed, not pixels per sample.
            const elapsed = Math.max(1, frames[i].at - frames[i - 1].at)
            const distance = Math.abs(frames[0].from.top - last.to.top)
            assert.ok(Math.abs(frames[i].from.top - frames[i - 1].from.top) <= distance * 6 * elapsed / 820 + 2, name + ': cover cannot teleport faster than the easing permits')
          }
        }
      }
      const marks = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark').map(mark => [mark.name, mark.startTime])))
      const duration = marks['ztmusic:splash-finished'] - marks['ztmusic:splash-visible']
      if (!options.rotate) assert.ok(duration >= 2190, name + ': visible minimum')
      if (!options.rotate) assert.ok(marks['ztmusic:splash-exiting'] - marks['ztmusic:splash-visible'] >= 2190, name + ': morph cannot start before the minimum')
      if (options.stuck) assert.ok(duration >= 6000 && duration < 7800, name + ': stuck restoration must release the home')
      if (options.delay) assert.ok(marks['ztmusic:splash-finished'] >= marks['ztmusic:android-state-restored'], name + ': real native restoration precedes completion')
      if (options.native) {
        const revealedAt = await page.evaluate(() => window.__nativeRevealAt)
        assert.ok(marks['ztmusic:splash-visible'] >= revealedAt, name + ': minimum begins after native visibility, not a synthetic timer')
        const commands = await page.evaluate(() => window.__startupCommands)
        assert.ok(!commands.some(command => ['play', 'start', 'volume', 'next', 'previous'].includes(command)), name + ': splash cannot start playback or set volume')
      }
      results.push({ name, duration, frames: frames.length, errors })
      if (options.capture) await page.screenshot({ path: join(output, name + '-home.png') })
      if (options.playDefault) {
        await page.getByRole('button', { name: '播放', exact: true }).click()
        await page.waitForFunction(() => window.__startupCommands.includes('start'))
        const queue = await page.evaluate(() => window.__startedQueue)
        assert.equal(queue.length, 1)
        assert.equal(queue[0].id, 2709782550, 'explicit first play must enqueue the official Luo Tianyi track')
        assert.equal(queue[0].name, '下等马')
      }
      if (!home && !options.reduced && !options.systemReduced) {
        await page.getByRole('button', { name: /^打开播放器：/ }).click()
        await page.waitForSelector('.ly-fullscreen')
        await page.getByRole('button', { name: '收起播放器', exact: true }).click()
        await page.waitForSelector('.ly-fullscreen', { state: 'detached' })
        assert.equal(await page.locator('.app-shell').getAttribute('inert'), null)
      }
    }
    assert.deepEqual(errors, [], name + ': browser console / page errors')
    console.log(name + ': passed')
  } catch (error) {
    console.error(JSON.stringify({ name, errors, state: await page.evaluate(() => ({ classes: document.documentElement.className, text: document.body.innerText.slice(0, 1500), marks: performance.getEntriesByType('mark').map(mark => ({ name: mark.name, time: mark.startTime })) })) }))
    await page.screenshot({ path: join(output, name + '-failure.png') })
    throw error
  } finally { await context.close() }
}

try {
  await scenario('mobile-empty', { capture: true })
  await scenario('mobile-reduced', { reduced: true })
  await scenario('mobile-small-light', { viewport: { width: 360, height: 640 }, theme: 'light', capture: true })
  await scenario('native-session', { native: true, cover: true, capture: true })
  await scenario('native-first-song', { native: true, playDefault: true, capture: true })
  await scenario('native-late-ready', { native: true, cover: true, delay: 3200 })
  await scenario('native-late-reveal', { native: true, cover: true, revealDelay: 2700 })
  await scenario('native-broken-cover', { native: true, cover: true, brokenCover: true })
  await scenario('native-timeout', { native: true, stuck: true })
  await scenario('native-system-reduced', { native: true, systemReduced: true })
  await scenario('native-expired-login', { native: true, expired: true })
  await scenario('mobile-rotation', { rotate: true })
  await scenario('desktop', { desktop: true, viewport: { width: 1100, height: 720 } })
  await writeFile(join(output, 'metrics.json'), JSON.stringify(results, null, 2))
} finally { await browser.close() }
