import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(pathToFileURL(process.env.PR9_PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ headless: true, ...(process.env.ZT_BROWSER_CHANNEL ? { channel: process.env.ZT_BROWSER_CHANNEL } : {}) })
const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const route = view => page.waitForFunction(view => window.mobileFixture.snapshot().view === view, view)
const navigate = view => page.evaluate(view => window.mobileFixture.navigate(view), view)
const categories = ['外观', '播放与歌词', '音源管理', '通用', '数据与账号', '高级', '关于']
const entry = name => page.locator('.m-settings-home .m-settings-entry').filter({ hasText: name })
const back = () => page.getByRole('button', { name: '返回设置分类', exact: true })
const cdp = await context.newCDPSession(page)

async function swipe(from, to, cancel = false) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 }],
  })
  await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
}

try {
  await mkdir('browser-artifacts', { recursive: true })
  await page.goto(`${process.env.ZT_BROWSER_BASE || 'http://127.0.0.1:5190'}/scripts/browser/mobile-render.html`)
  await page.waitForFunction(() => window.mobileFixture)

  for (const viewport of [{ width: 375, height: 667 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport)
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
      await navigate('settings')
      await page.waitForSelector('.m-settings-home')
      assert.equal(await page.locator('.m-settings-home .m-settings-entry').count(), 7, 'non-Android runtimes share seven categories')
      assert.equal(await back().count(), 0)
      await page.waitForTimeout(600)
      await page.screenshot({ path: `browser-artifacts/settings-index-${viewport.width}-${theme}.png` })
      for (const name of categories) {
        await entry(name).click()
        await back().waitFor()
        const first = await page.locator('.m-settings button').first().textContent()
        assert.match(first, /返回设置分类/, 'the first child-page option returns to the category index')
        if (name === '播放与歌词') {
          const background = await page.locator('.m-switch.on').first().evaluate(node => getComputedStyle(node, '::before').backgroundColor)
          assert.notEqual(background, 'rgba(0, 0, 0, 0)', 'enabled switches need a visible track on both layouts')
        }
        await back().click()
        await route('settings')
        assert.deepEqual(await page.evaluate(() => window.mobileFixture.snapshot().routes), [], 'returning never leaves stale category entries in history')
      }
      console.log(`shared settings: ${viewport.width} ${theme} categories and return passed`)
    }
  }

  await navigate('settings-appearance')
  await navigate('settings-playback')
  await back().click()
  await route('settings')
  assert.deepEqual(await page.evaluate(() => window.mobileFixture.snapshot().routes), [], 'a return row skips nested category history')
  await navigate('explore')
  await navigate('settings-general')
  await back().click()
  await route('settings')
  assert.deepEqual(await page.evaluate(() => window.mobileFixture.snapshot().routes), [], 'direct child entry still returns to the category index')

  await entry('音源管理').click()
  await page.locator('.source-add-open').click()
  await page.locator('.source-add-dialog input[type="text"]').fill('分类设置回归源')
  await page.locator('.source-add-dialog input[type="url"]').fill('https://example.invalid/resolve')
  await page.locator('.source-add-dialog .source-plugin-add-footer button').click()
  await page.locator('.source-add-dialog').waitFor({ state: 'detached' })
  await back().click()
  await route('settings')
  assert.match(await entry('音源管理').textContent(), /1 个已启用/, 'the desktop category summary refreshes after editing its source list')

  await page.setViewportSize({ width: 375, height: 667 })
  await entry('播放与歌词').click()
  const restore = page.getByRole('button', { name: '记住上次播放', exact: true })
  const oldValue = await restore.getAttribute('aria-pressed')
  await restore.click()
  const expected = oldValue === 'true' ? 'false' : 'true'
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.waitForSelector('.desktop-page')
  await route('settings-playback')
  assert.equal(await restore.getAttribute('aria-pressed'), expected, 'settings values survive mobile-to-PC layout changes')
  await page.screenshot({ path: 'browser-artifacts/settings-desktop-child.png' })
  await page.setViewportSize({ width: 375, height: 667 })
  await page.waitForSelector('.mobile-app')
  await route('settings-playback')
  assert.equal(await restore.getAttribute('aria-pressed'), expected)

  await swipe({ x: 8, y: 240 }, { x: 170, y: 240 })
  await route('settings')
  await entry('外观').click()
  await back().waitFor()
  await swipe({ x: 8, y: 240 }, { x: 38, y: 240 })
  await route('settings-appearance')
  await swipe({ x: 8, y: 240 }, { x: 160, y: 240 }, true)
  await route('settings-appearance')
  await swipe({ x: 8, y: 340 }, { x: 12, y: 180 })
  await route('settings-appearance')

  await back().click()
  await route('settings')
  await entry('通用').click()
  await page.getByRole('button', { name: /^语言：/ }).click()
  await page.getByRole('dialog', { name: '语言', exact: true }).waitFor()
  await swipe({ x: 8, y: 240 }, { x: 170, y: 240 })
  await route('settings-general')
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: '语言', exact: true }).waitFor({ state: 'detached' })
  await back().click()
  await route('settings')
  await page.screenshot({ path: 'browser-artifacts/settings-mobile-index.png' })

  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 900 })
    await entry('播放与歌词').click()
    await page.locator('[data-setting-key="restore_session"]').waitFor()
    assert.equal(await page.locator('[data-setting-key]').count(), 4, 'the same playback definitions render on both layouts')
    for (const key of ['restore_session', 'lyrics_blur_effect', 'lyrics_text_blur_effect']) {
      const toggle = page.locator(`[data-setting-key="${key}"] .m-switch`)
      const before = await toggle.getAttribute('aria-pressed')
      await toggle.click()
      const after = before === 'true' ? 'false' : 'true'
      assert.equal(await toggle.getAttribute('aria-pressed'), after)
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), after, 'generic fields preserve the boolean storage contract')
      await toggle.click()
      assert.equal(await toggle.getAttribute('aria-pressed'), before)
    }
    await back().click()
    await route('settings')
  }

  await page.setViewportSize({ width: 375, height: 667 })
  await entry('通用').click()
  await page.getByRole('button', { name: /^语言：/ }).click()
  await page.getByRole('dialog', { name: '语言', exact: true }).getByRole('button', { name: 'English', exact: true }).click()
  await page.keyboard.press('Escape')
  assert.match(await page.locator('.m-settings-back').textContent(), /Back to settings categories/)
  await page.locator('.m-settings-back').click()
  await route('settings')
  assert.equal(await page.locator('.mobile-large-title').textContent(), 'Settings')
  await entry('Playback and lyrics').click()
  await page.getByRole('button', { name: /^Audio Quality/ }).waitFor()
  assert.match(await page.locator('[data-setting-key="preferred_quality"]').textContent(), /Standard/)
  await page.locator('.m-settings-back').click()
  await route('settings')
  await entry('General').click()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh')
  await page.getByRole('combobox', { name: '语言', exact: true }).waitFor()
  assert.match(await page.locator('.m-settings-back').textContent(), /返回设置分类/)
  await back().click()
  await route('settings')
  const startupContext = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true })
  try {
    await startupContext.addInitScript(() => localStorage.setItem('default_page', 'library'))
    const startupPage = await startupContext.newPage()
    await startupPage.route('**/ncm-api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: [], playlist: [], songs: [] }) }))
    await startupPage.goto(process.env.ZT_BROWSER_BASE || 'http://127.0.0.1:5190')
    await startupPage.locator('.mobile-large-title').filter({ hasText: '资料库' }).waitFor()
  } finally {
    await startupContext.close()
  }
  assert.deepEqual(errors, [], 'shared settings has no browser runtime errors')
  const result = { categories: 7, layouts: ['mobile', 'desktop'], themes: ['light', 'dark'], navigation: 'passed', edgeSwipe: 'passed', layoutSwitch: 'passed', declarativeFields: 'passed', localeSwitch: 'passed', mobileStartup: 'passed', errors }
  await writeFile('browser-artifacts/shared-settings-results.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  await context.close()
  await browser.close()
}
