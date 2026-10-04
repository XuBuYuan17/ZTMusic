import assert from 'node:assert/strict'
import { reviewLibraryAppearance } from './library-appearance.mjs'
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
  console.log('SCREENSHOT_' + name + '_BASE64:' + png.toString('base64'))
}
const sample = async (selector, ticks = 18) => page.evaluate(async ({ selector, ticks }) => {
  const frames = []
  for (let i = 0; i < ticks; i++) {
    await new Promise(requestAnimationFrame)
    const nodes = [...document.querySelectorAll(selector)]
    frames.push(nodes.map(node => {
      const box = node.getBoundingClientRect(), style = getComputedStyle(node)
      const pointerEvents = node.style.pointerEvents
      node.style.pointerEvents = 'auto'
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      node.style.pointerEvents = pointerEvents
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
const box = async selector => page.locator(selector).first().boundingBox()
const near = (a, b, name) => {
  assert.ok(a && b, name + ': missing geometry')
  for (const k of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(a[k] - b[k]) < 1.5, name + ': ' + k + ' jumps ' + Math.abs(a[k] - b[k]))
}
const probeFlight = async (selector, name) => {
  await page.waitForSelector(selector, { timeout: 3000 })
  const result = await page.evaluate(async selector => {
    const node = document.querySelector(selector)
    const animations = document.getAnimations().filter(a => a.playState === 'running')
    const times = animations.map(a => a.currentTime)
    animations.forEach(a => a.pause())
    const flight = node.getAnimations()[0]
    const duration = Number(flight.effect.getTiming().duration)
    const frames = []
    for (const progress of [0, .25, .5, .999]) {
      animations.forEach(a => { a.currentTime = duration * progress })
      await new Promise(requestAnimationFrame)
      const r = node.getBoundingClientRect()
      const pointer = node.style.pointerEvents
      node.style.pointerEvents = 'auto'
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      node.style.pointerEvents = pointer
      frames.push({ progress, x:r.left, y:r.top, width:r.width, height:r.height,
        image:node.tagName === 'IMG' ? node.naturalWidth : node.querySelector('.am-flying-cover-img')?.naturalWidth, onTop:hit===node || node.contains(hit), opacity:getComputedStyle(node).opacity })
    }
    animations.forEach(a => { a.currentTime = duration * .5 })
    window.__resumeMotion = () => animations.forEach((a,i) => { a.currentTime = times[i]; a.play() })
    return frames
  }, selector)
  await capture(name + '_mid')
  await page.evaluate(() => { window.__resumeMotion(); delete window.__resumeMotion })
  assert.equal(result.length, 4)
  assert.ok(result.every(f => f.onTop && f.image > 0 && f.opacity === '1'), name + ': flight is blank or covered')
  assert.ok(Math.abs(result[1].width - result[0].width) > 3, name + ': no visible intermediate size')
  if (name.startsWith('playlist')) {
    const progress = (result[1].width - result[0].width) / (result.at(-1).width - result[0].width)
    assert.ok(progress > .1 && progress < .65, name + ': flight should ease in rather than snap through its first quarter')
  }
  return result
}
try {
  await page.goto('http://127.0.0.1:5173/scripts/browser/mobile-render.html')
  await page.waitForFunction(() => !!window.mobileFixture, { timeout: 30000 })
  await page.locator('.mobile-cover-item img').first().waitFor()
  await page.waitForFunction(() => document.querySelector('.mobile-cover-item img')?.naturalWidth > 0)
  await page.waitForTimeout(600)
  metrics.cardBefore = await box('.mobile-cover-item img')
  await page.locator('.mobile-cover-item').first().click()
  metrics.playlistEnterProbe = await probeFlight('.shared-cover-flight', 'playlist_enter')
  metrics.playlistEnter = await sample('.shared-cover-flight, .playlist-cover')
  await page.waitForTimeout(700)
  metrics.heroAfter = await box('.mobile-route-page:not([inert]) .playlist-cover')
  near(metrics.playlistEnterProbe.at(-1), metrics.heroAfter, 'playlist enter landing')
  await capture('playlist')
  await page.evaluate(() => window.mobileFixture.back())
  metrics.playlistReturnProbe = await probeFlight('.shared-cover-flight', 'playlist_return')
  near(metrics.playlistReturnProbe[0], metrics.heroAfter, 'playlist return launch')
  metrics.outgoingHero = await box('.mobile-route-outgoing .playlist-cover')
  assert.ok(Math.abs(metrics.outgoingHero.y - metrics.heroAfter.y) <= 13, 'outgoing playlist jumps after source restoration')
  metrics.playlistReturn = await sample('.shared-cover-flight, img[data-shared-cover-return]')
  await page.waitForTimeout(600)
  metrics.cardAfter = await box('.mobile-cover-item img')
  near(metrics.playlistReturnProbe.at(-1), metrics.cardAfter, 'playlist return landing')
  await page.evaluate(() => window.mobileFixture.openPlayer())
  await page.waitForSelector('.apple-music-player.entered')
  await page.waitForTimeout(600)
  metrics.controlsCover = await box('.apple-music-player > .am-flying-cover')
  await page.locator('.apple-music-player > .am-flying-cover').click()
  metrics.playerLyricsProbe = await probeFlight('.apple-music-player > .am-flying-cover', 'player_lyrics')
  assert.equal(await page.locator('.mobile-player-cover-flight').count(), 0, 'restored player animates its original cover')
  metrics.playerToLyrics = await sample('.apple-music-player > .am-flying-cover')
  await page.waitForTimeout(450)
  metrics.lyricsCover = await box('.apple-music-player > .am-flying-cover')
  near(metrics.playerLyricsProbe.at(-1), metrics.lyricsCover, 'lyrics landing')
  await page.locator('.apple-music-player > .am-flying-cover').click()
  metrics.playerControlsProbe = await probeFlight('.apple-music-player > .am-flying-cover', 'player_controls')
  metrics.playerToControls = await sample('.apple-music-player > .am-flying-cover')
  await page.waitForTimeout(500)
  near(metrics.playerControlsProbe.at(-1), await box('.apple-music-player > .am-flying-cover'), 'controls landing')
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
  assert.ok(!['INPUT','TEXTAREA'].includes(metrics.comments.activeTag), 'comments must not focus editor')
  assert.ok(metrics.comments.rows.length >= 6)
  for (const [i,r] of metrics.comments.rows.entries()) {
    assert.ok(r.content.bottom <= r.row.bottom + 1, 'comment ' + i + ': content overflows row')
    assert.ok(r.avatar.bottom <= r.row.bottom + 1, 'comment ' + i + ': avatar overflows row')
    assert.ok(r.meta.right <= r.content.right + 1, 'comment ' + i + ': nickname exceeds text column')
    if (i) assert.ok(metrics.comments.rows[i-1].row.bottom <= r.row.top + 1, 'comment rows overlap')
  }
  assert.ok(metrics.comments.list.scrollHeight > metrics.comments.list.height, 'comments must scroll')
  await capture('comments')
  await page.locator('.ly-context-comment-list').evaluate(n => { n.scrollTop = n.scrollHeight })
  await capture('comments_scrolled')
  for (const width of [360, 412]) {
    await page.setViewportSize({ width, height:844 })
    const rows = await page.locator('.ly-context-comment-row').evaluateAll(nodes => nodes.map(n => {
      const r=n.getBoundingClientRect(), p=n.querySelector('p').getBoundingClientRect()
      return { top:r.top, bottom:r.bottom, contentBottom:p.bottom, right:r.right, contentRight:p.right }
    }))
    assert.ok(rows.every(r => r.contentBottom <= r.bottom + 1 && r.contentRight <= r.right + 1), 'comments overflow at width ' + width)
  }
  await page.setViewportSize({ width:390, height:844 })
  await page.locator('.am-secondary-close').click()
  await page.waitForTimeout(350)
  await page.evaluate(() => window.mobileFixture.closePlayer())
  await page.waitForTimeout(350)
  await page.locator('.mobile-cover-item').first().click()
  metrics.cachedEnterProbe = await probeFlight('.shared-cover-flight', 'playlist_cached')
  await page.waitForTimeout(700)
  near(metrics.cachedEnterProbe.at(-1), await box('.mobile-route-page:not([inert]) .playlist-cover'), 'cached playlist landing')
  await page.evaluate(() => window.mobileFixture.back())
  await page.waitForTimeout(600)
  assert.equal(await page.locator('.shared-cover-flight,.mobile-player-cover-flight').count(), 0, 'flight cleanup')
  await reviewLibraryAppearance(page, capture, metrics)
  assert.equal(errors.length, 0, 'browser runtime errors')
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
