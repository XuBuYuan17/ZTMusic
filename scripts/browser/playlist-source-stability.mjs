import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

if (!process.env.PR9_PLAYWRIGHT_MODULE) throw new Error('Set PR9_PLAYWRIGHT_MODULE to an existing Playwright module')
const { chromium } = await import(pathToFileURL(process.env.PR9_PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ headless: true, ...(process.env.ZT_BROWSER_CHANNEL ? { channel: process.env.ZT_BROWSER_CHANNEL } : {}) })
const base = process.env.ZT_BROWSER_URL || 'http://127.0.0.1:5173'
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === base && !url.pathname.startsWith('/ncm-api')) return route.continue()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: [], songs: [], ids: [] }) })
  })
  await page.goto(`${base}/scripts/browser/mobile-render.html`)
  await page.waitForFunction(() => Boolean(window.mobileFixture))
  await page.evaluate(() => { window.mobileFixture.login(); window.mobileFixture.navigate('library') })
  await page.getByRole('button', { name: '展开我创建的分组' }).click()
  const source = page.locator('[data-route-key="library"]')
  const card = source.locator('.collection-item__open').first()
  await card.waitFor()
  await card.scrollIntoViewIfNeeded()
  const baseline = await source.boundingBox()
  assert.ok(baseline && baseline.width > 0)
  await card.click()
  await page.waitForFunction(() => document.querySelector('[data-route-key="library"].mobile-route-outgoing'))
  const during = await source.boundingBox()
  assert.ok(during && Math.abs(during.width - baseline.width) < 1, `source width changed: ${baseline.width} -> ${during?.width}`)
  assert.ok(Math.abs(during.x - baseline.x) < 1, `source position changed: ${baseline.x} -> ${during.x}`)
  assert.ok(Math.abs(during.y - baseline.y) < 1, `source vertical position changed: ${baseline.y} -> ${during.y}`)
  const computed = await source.evaluate(element => ({ position: getComputedStyle(element).position, transform: getComputedStyle(element).transform }))
  assert.equal(computed.position, 'fixed')
  assert.equal(computed.transform, 'none')
  await page.waitForTimeout(150)
  const later = await source.boundingBox()
  assert.ok(later && Math.abs(later.width - baseline.width) < 1 && Math.abs(later.x - baseline.x) < 1 && Math.abs(later.y - baseline.y) < 1, 'source geometry remains stable throughout entry')
  console.log('playlist source: original width, position and scale preserved during entry')
} finally {
  await browser.close()
}
