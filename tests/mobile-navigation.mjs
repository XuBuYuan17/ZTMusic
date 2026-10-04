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
  await page.getByRole('button', { name: '更多歌单操作', exact: true }).click()
  await page.getByRole('button', { name: '搜索与排序', exact: true }).click()
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
    for (const view of ['library', 'settings', 'explore', 'library', 'search']) { router.handleNav(view); await new Promise(resolve => requestAnimationFrame(resolve)) }
  })
  await settled()
  assert.equal(await page.locator('.mobile-route-page:not([inert])').count(), 1, 'rapid navigation leaves one active page')
  for (let id = 2; id <= 9; id++) { await navigate('playlist', id); await page.locator('.mobile-detail-page:not([inert]) .playlist-track-row').first().waitFor() }
  await settled()
  assert.equal(await page.locator('.mobile-detail-page').count(), 6, 'detail cache stays bounded')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForFunction(() => !document.documentElement.classList.contains('mobile-runtime'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.mobile-app').waitFor()
  assert.equal(await page.locator('.mobile-tab.active').getAttribute('data-view'), 'search', 'remounted detail retains its source tab')
  await page.locator('.mini-player-open').click()
  await page.locator('.ly-fullscreen').waitFor()
  const start = await page.evaluate(() => {
    const root = document.querySelector('.ly-fullscreen')
    const cover = root.querySelector('.am-flying-cover')
    const animations = [...root.getAnimations({ subtree: true }), ...document.querySelector('.mobile-tab-bar').getAnimations()].filter(animation => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition))
    for (const animation of animations) { animation.pause(); animation.currentTime = 0 }
    const a = cover.getBoundingClientRect(), b = document.querySelector('.mini-player-artwork').getBoundingClientRect()
    return { error: Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width)), a: a.toJSON(), b: b.toJSON(), durations: animations.map(a => a.effect.getTiming().duration) }
  })
  assert.ok(start.error < 2, JSON.stringify(start))
  assert.ok(start.durations.every(duration => duration === 480))
  const midpoint = await page.evaluate(() => {
    const root = document.querySelector('.ly-fullscreen'), nav = document.querySelector('.mobile-tab-bar')
    for (const animation of [...root.getAnimations({ subtree: true }), ...nav.getAnimations()]) {
      if (animation instanceof CSSAnimation || animation instanceof CSSTransition) continue
      animation.pause(); animation.currentTime = 240
    }
    const inset = getComputedStyle(root.querySelector('.ly-container')).clipPath.split('round')[0].match(/[\d.]+px/g).map(parseFloat)
    return { navTop: nav.getBoundingClientRect().top, height: nav.getBoundingClientRect().height, bottom: innerHeight - (inset[2] ?? inset[0]), viewport: innerHeight }
  })
  assert.ok(midpoint.navTop > midpoint.viewport - midpoint.height && midpoint.navTop < midpoint.viewport, 'navigation is pushed partially offscreen during expansion')
  assert.ok(Math.abs(midpoint.bottom - midpoint.navTop) < 2, `player edge and navigation move together: ${JSON.stringify(midpoint)}`)
  await page.evaluate(() => { for (const animation of [...document.querySelector('.ly-fullscreen').getAnimations({ subtree: true }), ...document.querySelector('.mobile-tab-bar').getAnimations()]) animation.finish() })
  const coverBeforeMode = await page.locator('.am-flying-cover').boundingBox()
  await page.getByRole('button', { name: '显示歌词', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.apple-music-player').classList.contains('lyrics-mode'))
  for (const time of [0, 120, 240, 360, 479]) {
    const geometry = await page.evaluate(time => {
      const root = document.querySelector('.apple-music-player')
      for (const animation of root.getAnimations({ subtree: true })) {
        if (animation instanceof CSSAnimation || animation instanceof CSSTransition) continue
        animation.pause(); animation.currentTime = time
      }
      return { cover: root.querySelector('.am-flying-cover').getBoundingClientRect().toJSON(), title: root.querySelector('.am-corner-info').getBoundingClientRect().toJSON(), controls: getComputedStyle(root.querySelector('.am-bottom-controls')).display }
    }, time)
    if (time === 0) {
      assert.ok(Math.abs(geometry.cover.width - coverBeforeMode.width) < 2 && Math.abs(geometry.cover.y - coverBeforeMode.y) < 2, 'lyrics transition starts at the actual artwork position')
      assert.equal(geometry.controls, 'block', 'controls remain visible while sliding out')
    }
    assert.ok(geometry.title.left >= geometry.cover.right - 1 || geometry.title.top >= geometry.cover.bottom - 1, `title does not pass through artwork: ${JSON.stringify({ time, geometry })}`)
  }
  await page.evaluate(() => { for (const animation of document.querySelector('.apple-music-player').getAnimations({ subtree: true })) animation.finish() })
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.am-mobile-footer')).display === 'none')
  await page.locator('.am-flying-cover').click()
  await page.waitForFunction(() => !document.querySelector('.apple-music-player').classList.contains('lyrics-mode'))
  await page.locator('.apple-music-player').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)))
  await page.getByRole('button', { name: '收起播放器', exact: true }).click()
  const closingGeometry = await page.evaluate(() => {
    const root = document.querySelector('.ly-fullscreen'), sheet = root.querySelector('.ly-container'), cover = root.querySelector('.am-flying-cover'), mini = document.querySelector('.mini-player-artwork')
    for (const animation of root.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = Number(animation.effect.getTiming().duration) - .1 }
    const style = getComputedStyle(sheet)
    const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform)
    const a = cover.getBoundingClientRect(), b = mini.getBoundingClientRect()
    return { scaleX: matrix.a, scaleY: matrix.d, width: sheet.getBoundingClientRect().width, coverError: Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width)) }
  })
  assert.ok(closingGeometry.scaleX === 1 && closingGeometry.scaleY === 1 && closingGeometry.width === 390 && closingGeometry.coverError < 2, `surface stays full-size while its clip and cover return to mini: ${JSON.stringify(closingGeometry)}`)
  await page.evaluate(() => { for (const animation of document.querySelector('.ly-fullscreen').getAnimations({ subtree: true })) animation.play() })
  await page.locator('.ly-fullscreen').waitFor({ state: 'detached' })
  await page.locator('.mini-player-open').click()
  await page.locator('.ly-fullscreen').waitFor()
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition)).map(animation => animation.finished.catch(() => {}))))
  const handle = await page.getByRole('button', { name: '收起播放器', exact: true }).boundingBox()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 144, { steps: 8 })
  await page.mouse.up()
  const dragMidpoint = await page.evaluate(() => {
    const root = document.querySelector('.ly-fullscreen'), nav = document.querySelector('.mobile-tab-bar'), sheet = root.querySelector('.ly-container')
    for (const animation of [...root.getAnimations({ subtree: true }), ...nav.getAnimations()]) {
      if (animation instanceof CSSAnimation || animation instanceof CSSTransition) continue
      animation.pause(); animation.currentTime = 240
    }
    const style = getComputedStyle(sheet)
    const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform)
    const inset = style.clipPath.split('round')[0].match(/[\d.]+px/g).map(parseFloat)
    return { scaleX: matrix.a, scaleY: matrix.d, visibleBottom: sheet.getBoundingClientRect().bottom - (inset[2] ?? inset[0]), navTop: nav.getBoundingClientRect().top }
  })
  assert.ok(dragMidpoint.scaleX === 1 && dragMidpoint.scaleY === 1 && Math.abs(dragMidpoint.visibleBottom - dragMidpoint.navTop) < 2, `clip and navigation return together without scaling the surface: ${JSON.stringify(dragMidpoint)}`)
  await page.evaluate(() => { for (const animation of document.getAnimations()) if (!(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition)) animation.finish() })
  await page.locator('.ly-fullscreen').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.mobile-tab-bar').evaluate(el => getComputedStyle(el).transform), 'none', 'navigation returns after closing')
  assert.equal(await page.locator('.mobile-mini-player').isVisible(), true, 'mini player returns without a duplicate shell')
  const pullMini = async distance => {
    const bar = await page.locator('.mobile-mini-player').boundingBox()
    const hit = await page.locator('.mini-player-open').boundingBox()
    const x = hit.x + hit.width / 2, y = hit.y + hit.height / 2
    await page.mouse.move(x, y); await page.mouse.down()
    await page.mouse.move(x, y - 20, { steps: 2 })
    await page.getByRole('dialog', { name: '正在播放', exact: true }).waitFor()
    await page.mouse.move(x, y - distance, { steps: 5 })
    const top = await page.locator('.ly-container').evaluate(el => parseFloat(getComputedStyle(el).clipPath.match(/[\d.]+px/)[0]))
    assert.ok(Math.abs(top - (bar.y - distance)) < 3, 'player tracks the pull distance')
    await page.waitForTimeout(180)
    assert.ok(Math.abs(await page.locator('.ly-container').evaluate(el => parseFloat(getComputedStyle(el).clipPath.match(/[\d.]+px/)[0])) - top) < 1, 'holding the finger holds the player still')
    return { x, y, bar }
  }
  await pullMini(100)
  await page.mouse.up()
  await page.locator('.ly-fullscreen').waitFor({ state: 'detached' })
  const pull = await pullMini(280)
  await page.mouse.move(pull.x, pull.y - 180, { steps: 4 })
  const reverseTop = await page.locator('.ly-container').evaluate(el => parseFloat(getComputedStyle(el).clipPath.match(/[\d.]+px/)[0]))
  assert.ok(Math.abs(reverseTop - (pull.bar.y - 180)) < 3, 'reversing the drag reverses the panel')
  await page.mouse.move(pull.x, pull.y - 400, { steps: 5 })
  await page.mouse.up()
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ly-container')).clipPath === 'none')
  await page.getByRole('button', { name: '收起播放器', exact: true }).click()
  const exitScales = await page.evaluate(() => {
    for (const animation of document.querySelector('.ly-fullscreen').getAnimations({ subtree: true })) { if (animation instanceof CSSAnimation || animation instanceof CSSTransition) continue; animation.pause(); animation.currentTime = 240 }
    return ['.ly-fullscreen', '.ly-container'].map(selector => {
      const el = document.querySelector(selector), style = getComputedStyle(el)
      const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform)
      return { x: matrix.a, y: matrix.d, width: el.getBoundingClientRect().width }
    })
  })
  assert.ok(exitScales.every(value => value.x === 1 && value.y === 1 && value.width === 390), 'exit does not scale the page or the player surface')
  await page.evaluate(() => { for (const animation of document.getAnimations()) if (!(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition)) animation.finish() })
  await page.locator('.ly-fullscreen').waitFor({ state: 'detached' })
  const cancelPull = await pullMini(300)
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, clientX: x, clientY: y - 300 })), cancelPull)
  await page.mouse.up()
  await page.locator('.ly-fullscreen').waitFor({ state: 'detached' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await pullMini(300)
  await page.mouse.up()
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ly-container')).clipPath === 'none')
  await page.getByRole('button', { name: '收起播放器', exact: true }).click()
  await page.locator('.ly-fullscreen').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.mini-player-open').isVisible(), true)
  assert.deepEqual(errors, [])
  console.log('Mobile navigation browser: home/detail/back, filter + scroll + DOM retention, search/tab, rapid navigation, cache bound and player FLIP passed')
} finally { await browser.close() }
