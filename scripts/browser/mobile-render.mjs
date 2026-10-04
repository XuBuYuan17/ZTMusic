import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(pathToFileURL(process.env.PR9_PLAYWRIGHT_MODULE).href)
await mkdir('browser-artifacts', { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir: 'browser-artifacts' } })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const metrics = {}
const capture = async name => {
  const png = await page.screenshot({ path: 'browser-artifacts/' + name + '.png' })
  if (name === 'comments') console.log('SCREENSHOT_BASE64:' + png.toString('base64'))
}
const sample = async (selector, ticks = 18) => page.evaluate(async ({ selector, ticks }) => {
  const frames = []
  for (let i = 0; i < ticks; i++) {
    await new Promise(requestAnimationFrame)
    const nodes = [...document.querySelectorAll(selector)]
    frames.push(nodes.map(node => {
      const box = node.getBoundingClientRect(), style = getComputedStyle(node)
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return { classes: node.className, left: box.left, top: box.top, width: box.width, height: box.height,
        opacity: style.opacity, visibility: style.visibility, transform: style.transform,
        image: node.tagName === 'IMG' ? node.naturalWidth : node.querySelector('img')?.naturalWidth,
        onTop: !!hit && (hit === node || node.contains(hit)),
        animations: node.getAnimations().map(a => ({ playState: a.playState, currentTime: a.currentTime, keyframes: a.effect?.getKeyframes() })),
      }
    }))
  }
  return frames
}, { selector, ticks })
try {
  await page.goto('http://127.0.0.1:5173/scripts/browser/mobile-render.html')
  await page.waitForFunction(() => !!window.mobileFixture, { timeout: 30000 })
  await page.locator('.mobile-cover-item img').first().waitFor()
  await page.waitForFunction(() => document.querySelector('.mobile-cover-item img')?.naturalWidth > 0)
  await page.waitForTimeout(600)
  await page.locator('.mobile-cover-item').first().click()
  metrics.playlistEnter = await sample('.shared-cover-flight, .playlist-cover')
  await page.waitForTimeout(700)
  await capture('playlist')
  await page.evaluate(() => window.mobileFixture.back())
  metrics.playlistReturn = await sample('body > .playlist-cover, .shared-cover-flight, img[data-shared-cover-return]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.mobileFixture.openPlayer())
  await page.waitForSelector('.apple-music-player.entered')
  await page.waitForTimeout(600)
  await page.locator('.am-flying-cover').click()
  metrics.playerToLyrics = await sample('body > .am-flying-cover, .apple-music-player > .am-flying-cover')
  await page.waitForTimeout(450)
  await page.locator('.apple-music-player > .am-flying-cover').click()
  metrics.playerToControls = await sample('body > .am-flying-cover, .apple-music-player > .am-flying-cover')
  await page.waitForTimeout(500)
  await page.locator('.am-more-btn').click()
  await page.getByText('热评', { exact: true }).click()
  await page.locator('.ly-context-comment-row').first().waitFor()
  await page.waitForTimeout(550)
  metrics.comments = await page.evaluate(() => ({
    activeTag: document.activeElement?.tagName, activeClass: document.activeElement?.className,
    rows: [...document.querySelectorAll('.ly-context-comment-row')].map(row => {
      const box = n => { if (!n) return null; const r = n.getBoundingClientRect(); const s = getComputedStyle(n); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height, position:s.position, display:s.display, flexShrink:s.flexShrink } }
      return { row:box(row), avatar:box(row.querySelector('.ly-context-comment-avatar') || row.querySelector('img')),
        meta:box(row.querySelector('.ly-context-comment-meta') || row.querySelector('strong')), content:box(row.querySelector('p')) }
    }),
    list: (()=>{const l=document.querySelector('.ly-context-comment-list');return { height:l.clientHeight, scrollHeight:l.scrollHeight, overflow:getComputedStyle(l).overflowY }})(),
  }))
  await capture('comments')
} catch (e) {
  metrics.failure = String(e)
  await capture('failure')
  process.exitCode = 1
} finally {
  metrics.errors = errors
  await writeFile('browser-artifacts/metrics.json', JSON.stringify(metrics, null, 2))
  console.log('BROWSER_METRICS:' + JSON.stringify(metrics))
  await context.close()
  await browser.close()
}
