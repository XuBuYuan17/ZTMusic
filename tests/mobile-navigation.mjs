import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_BROWSER || 'msedge' })
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const page = await context.newPage()
  const errors = []
  const requests = []
  page.on('pageerror', error => errors.push(error.message))
  const cover = `${base}/navigation-cover.svg`
  const tracks = Array.from({ length: 80 }, (_, i) => ({ id: 91000 + i, name: `测试歌曲 ${i}`, ar: [{ id: 1, name: '测试歌手' }], al: { id: 1, name: '测试专辑', picUrl: cover }, dt: 240000 }))
  await page.route('**/navigation-cover.svg*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#985963"/></svg>' }))
  await page.route('**/ncm-api/**', route => {
    const url = new URL(route.request().url())
    requests.push(url.pathname)
    const id = Number(url.searchParams.get('id')) || 1
    const response = url.pathname.includes('playlist/detail') ? { code: 200, playlist: { id, name: `测试歌单 ${id}`, coverImgUrl: cover, tracks, trackIds: tracks.map(({ id }) => ({ id })), trackCount: tracks.length } }
      : url.pathname.includes('song/detail') ? { code: 200, songs: tracks }
      : url.pathname.includes('artist/detail') ? { code: 200, data: { artist: { id, name: '测试歌手', cover, albumSize: 1, musicSize: 80 } } }
      : url.pathname.includes('artist/songs') ? { code: 200, songs: tracks }
      : url.pathname.includes('artist/album') ? { code: 200, hotAlbums: [] }
      : url.pathname.includes('lyric') ? { code: 200, lrc: { lyric: '[00:00.00]测试歌词' } }
      : { code: 200, data: [], result: [], songs: [], playlist: [], profile: null }
    return route.fulfill({ json: response })
  })
  await context.addInitScript(({ cover, tracks }) => {
    for (const [key, value] of Object.entries({ layout_mode: 'mobile', default_page: 'explore', restore_session: 'false', player_id: '91000', player_title: '测试歌曲', player_artist: '测试歌手', player_cover: cover, player_duration: '240', player_time: '45', player_queue: JSON.stringify(tracks) })) localStorage.setItem(key, value)
  }, { cover, tracks })
  await page.goto(`${base}/?mobile`)
  await page.locator('.mobile-mini-player').waitFor()
  const navigate = (view, id = null) => page.evaluate(async ({ view, id }) => {
    const { router } = await import('/src/lib/stores/router.svelte.ts')
    router.handleNav(view, id, true)
  }, { view, id })
  const settled = async () => {
    await page.waitForFunction(() => !document.querySelector('.mobile-route-outgoing'))
    await page.locator('.mobile-route-page:not([inert])').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))) })
  }
  await navigate('home')
  await settled()
  await navigate('playlist', 1)
  await page.locator('.playlist-track-row').first().waitFor()
  await settled()
  await page.locator('.playlist-search input').fill('测试歌曲')
  await page.locator('.mobile-page-content').dispatchEvent('touchstart')
  await page.locator('.mobile-page-content').evaluate(el => { el.scrollTop = 1100 })
  const scroll = await page.locator('.mobile-page-content').evaluate(el => el.scrollTop)
  await page.locator('[data-route-key="playlist:1:2"]').evaluate(el => { el.navigationMarker = true })
  const countBefore = requests.filter(path => path.includes('playlist/detail')).length
  await navigate('artist', 1)
  await page.locator('.artist-page').waitFor()
  await settled()
  await page.getByRole('button', { name: '返回上一页', exact: true }).click()
  await page.locator('.playlist-search input:visible').waitFor()
  await settled()
  assert.equal(await page.locator('.playlist-search input:visible').inputValue(), '测试歌曲')
  assert.ok(await page.locator('[data-route-key="playlist:1:2"]').evaluate(el => el.navigationMarker), 'return reuses the same page DOM')
  assert.ok(Math.abs(await page.locator('.mobile-page-content').evaluate(el => el.scrollTop) - scroll) < 2, 'deep scroll restores')
  assert.equal(requests.filter(path => path.includes('playlist/detail')).length, countBefore, 'return uses cached detail data')
  await page.getByRole('button', { name: '返回上一页', exact: true }).click()
  await settled()
  await navigate('search')
  const input = page.locator('.search-page input:visible').first()
  await input.fill('保留搜索词')
  await page.locator('.mobile-tab[data-view="library"]').click()
  await settled()
  await navigate('search')
  await settled()
  assert.equal(await input.inputValue(), '保留搜索词')
  await page.evaluate(async () => {
    const { router } = await import('/src/lib/stores/router.svelte.ts')
    for (const view of ['home', 'library', 'explore', 'home', 'search']) { router.handleNav(view); await new Promise(resolve => requestAnimationFrame(resolve)) }
  })
  await settled()
  assert.equal(await page.locator('.mobile-route-page:not([inert])').count(), 1, 'rapid navigation leaves one active page')
  for (let id = 2; id <= 9; id++) { await navigate('playlist', id); await page.locator('.mobile-detail-page:not([inert]) .playlist-track-row').first().waitFor() }
  await settled()
  assert.equal(await page.locator('.mobile-detail-page').count(), 6, 'detail cache stays bounded')
  await page.locator('.mini-player-open').click()
  await page.locator('.ly-fullscreen').waitFor()
  const start = await page.evaluate(() => {
    const root = document.querySelector('.ly-fullscreen')
    const cover = root.querySelector('.am-flying-cover')
    const animations = [...root.getAnimations(), ...cover.getAnimations()]
    for (const animation of animations) { animation.pause(); animation.currentTime = 0 }
    const a = cover.getBoundingClientRect(), b = document.querySelector('.mini-player-artwork').getBoundingClientRect()
    return { error: Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width)), a: a.toJSON(), b: b.toJSON(), durations: animations.map(a => a.effect.getTiming().duration) }
  })
  assert.ok(start.error < 2, JSON.stringify(start))
  assert.ok(start.durations.every(duration => duration === 300))
  await page.evaluate(() => { for (const node of document.querySelectorAll('.ly-fullscreen, .ly-fullscreen .am-flying-cover')) for (const animation of node.getAnimations()) animation.finish() })
  await page.getByRole('button', { name: '收起播放器', exact: true }).click()
  const endError = await page.evaluate(() => {
    const root = document.querySelector('.ly-fullscreen'), cover = root.querySelector('.am-flying-cover')
    for (const node of [root, cover]) for (const animation of node.getAnimations()) { animation.pause(); animation.currentTime = 299.9 }
    const a = cover.getBoundingClientRect(), b = document.querySelector('.mini-player-artwork').getBoundingClientRect()
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width))
  })
  assert.ok(endError < 2, `reverse cover lands on the Mini artwork: ${endError}`)
  await page.evaluate(() => { for (const node of document.querySelectorAll('.ly-fullscreen, .ly-fullscreen .am-flying-cover')) for (const animation of node.getAnimations()) animation.play() })
  await page.locator('.ly-fullscreen').waitFor({ state: 'detached' })
  assert.deepEqual(errors, [])
  console.log('Mobile navigation browser: home/detail/back, filter + scroll + DOM retention, search/tab, rapid navigation, cache bound and player FLIP passed')
} finally { await browser.close() }
