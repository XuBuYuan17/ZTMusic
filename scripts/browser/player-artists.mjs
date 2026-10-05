import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.ok(process.env.PR9_PLAYWRIGHT_MODULE, 'Set PR9_PLAYWRIGHT_MODULE to an existing Playwright module')
const { chromium } = await import(pathToFileURL(process.env.PR9_PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ headless: true, ...(process.env.ZT_BROWSER_CHANNEL ? { channel: process.env.ZT_BROWSER_CHANNEL } : {}) })
const output = resolve(process.env.ZT_ARTIST_ARTIFACTS || 'browser-artifacts/player-artists')
await mkdir(output, { recursive: true })
try {
  for (const width of [360, 390, 520]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.route('**/ncm-api/**', route => route.fulfill({ json: { code: 200, banners: [], result: [], playlists: [], albums: [], data: { blocks: [] } } }))
    await page.goto((process.env.ZT_ARTIST_URL || 'http://127.0.0.1:5173/') + '?mobile', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.mobile-mini-player')
    await page.waitForSelector('[data-startup-splash]', { state: 'detached' })
    await page.getByRole('button', { name: /^打开播放器：/ }).click()
    await page.waitForSelector('.ly-fullscreen')
    for (const fontSize of [18, 28]) {
      for (const names of [['ChiliChill', '乐正绫', '洛天依Official'], ['ChiliChill音乐制作组', '乐正绫', '洛天依Official', '第四位歌手'], ['单个歌手'], []]) {
        await page.evaluate(async ({ names, fontSize }) => {
          const { player } = await import('/src/lib/stores/player.svelte.ts')
          player.title = '我的悲伤是水做的'
          player.artist = '未知歌手'
          player.currentTrack = { id: 42, name: player.title, ar: names.map((name, index) => ({ id: index + 1, name })), al: { id: 1, name: '', picUrl: '' }, dt: 0 }
          for (const node of document.querySelectorAll('.am-track-artist, .am-corner-artist')) node.style.fontSize = `${fontSize}px`
          await new Promise(requestAnimationFrame)
        }, { names, fontSize })
        for (const mode of ['cover', 'lyrics']) {
          if (mode === 'lyrics') await page.getByRole('button', { name: '显示歌词', exact: true }).click()
          const selector = mode === 'lyrics' ? '.am-corner-artist' : '.am-track-artist'
          const layout = await page.locator(selector).evaluate(node => {
            const spans = [...node.querySelectorAll('.artist-link')]
            const boxes = spans.map(span => { const range = document.createRange(); range.selectNodeContents(span); return range.getBoundingClientRect().toJSON() })
            return { boxes, display: getComputedStyle(node.querySelector('.artist-links')).display, overflow: getComputedStyle(node).overflow, ellipsis: getComputedStyle(node).textOverflow, whiteSpace: getComputedStyle(node).whiteSpace, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }
          })
          assert.equal(layout.display, 'inline', 'player artist names must use continuous inline text instead of shrinking flex boxes')
          for (let index = 1; index < layout.boxes.length; index++) {
            assert.ok(layout.boxes[index - 1].right < layout.boxes[index].left, `${width}px ${fontSize}px ${mode}: adjacent artists overlap`)
            assert.equal(layout.boxes[index - 1].top, layout.boxes[index].top, 'artists stay on one line')
          }
          assert.equal(layout.overflow, 'hidden')
          assert.equal(layout.ellipsis, 'ellipsis')
          assert.equal(layout.whiteSpace, 'nowrap')
          if (names.length > 3) assert.ok(layout.scrollWidth > layout.clientWidth, 'long artist list exercises line truncation')
          if (names.length === 3 && fontSize === 28) await page.screenshot({ path: join(output, `${width}-${mode}.png`) })
          if (mode === 'lyrics') await page.locator('.am-flying-cover').click()
        }
      }
    }
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`${width}px: multi-artist, long names, single/empty artist, enlarged text and lyrics mode passed`)
  }
} finally { await browser.close() }
