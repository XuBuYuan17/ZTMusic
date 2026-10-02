import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.MOBILE_PREVIEW_OUTPUT || join(process.env.TEMP, 'ztmusic-md3-preview')
await mkdir(output, { recursive: true })
const base = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:5173'
const title = '静静听见 · 很长的歌曲标题用于检查窄屏文字截断'
const cover = `${base}/preview-cover.svg`
const tracks = Array.from({ length: 16 }, (_, i) => ({ id: 91000 + i, name: i ? `测试歌曲 ${i} · 长标题截断检查` : title, ar: [{ id: 1, name: i === 1 ? '哲听预览 · 很长的歌手名称检查窄屏文字截断' : '哲听预览' }], al: { id: 1, name: '测试专辑', picUrl: cover }, dt: 240000 }))
tracks[tracks.length - 1] = { ...tracks[tracks.length - 1], al: { id: 1, name: '', picUrl: '' }, dt: 0 }
const playlists = [
  { id: 7000, userId: 1, specialType: 5, name: '我喜欢的音乐', trackCount: 16, coverImgUrl: cover, creator: { userId: 1, nickname: '哲听预览' } },
  ...Array.from({ length: 24 }, (_, i) => ({ id: i + 1, userId: 1, name: `预览歌单 ${i + 1} · 很长的歌单名称检查文字截断`, trackCount: 16, coverImgUrl: cover, creator: { userId: 1, nickname: '哲听预览' } })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: 8000 + i, userId: 2, name: `收藏歌单 ${i + 1}`, trackCount: 24, coverImgUrl: cover, creator: { userId: 2, nickname: '其他用户' } })),
]
const dayOf = value => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const fixtureNow = Date.now()
const dailyDates = Array.from({ length: 12 }, (_, i) => ({ date: dayOf(fixtureNow - i * 86400000), weekday: '历史推荐' }))
const listeningRows = tracks.map((track, i) => {
  const lastAt = fixtureNow - (i % 3 === 2 ? 40 * 86400000 : i % 3 * 86400000) - 3600000
  const milliseconds = (16 - i) * 180000
  return { key: `preview-${i}`, session: `preview-${i}`, day: dayOf(lastAt), track: { key: `online:${track.id}`, name: track.name, artists: track.ar.map(artist => artist.name), cover }, milliseconds, plays: i + 1, lastAt, hours: { '9': milliseconds / 2, '21': milliseconds / 2 } }
})
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_BROWSER || 'msedge' })
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, timezoneId: 'Asia/Shanghai' })
    const page = await context.newPage()
    const errors = []
    const apiPaths = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/preview-seed', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Isolated preview fixture</body></html>' }))
    await page.route('**/preview-cover.svg*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#9e667c"/><circle cx="200" cy="200" r="130" fill="#edc4bc"/><circle cx="200" cy="200" r="48" fill="#754456"/><path d="M186 128v130m0-110 80-20v110" fill="none" stroke="#fff5ef" stroke-width="12"/></svg>' }))
    await page.route('**/ncm-api/**', route => {
      const url = new URL(route.request().url())
      const path = url.pathname
      apiPaths.push(path)
      const response = path.includes('lyric') ? { code: 200, lrc: { lyric: '[00:00.00]让音乐慢慢流淌，长歌词也保持两行紧凑布局' } }
        : path.includes('login/status') ? { code: 200, data: { code: 200, profile: { userId: 1, nickname: '哲听预览', avatarUrl: cover } } }
        : path.includes('user/playlist') ? { code: 200, playlist: playlists }
        : path.includes('user/detail') ? { code: 200, profile: { userId: 1, nickname: '哲听预览 · 长昵称截断检查', avatarUrl: cover, backgroundUrl: cover, signature: '音乐，让安静的日子留下值得记住的足迹。长简介保持一行。', follows: 24, followeds: 128, playlistCount: 28 }, listenSongs: 1234, level: 8 }
        : path.includes('user/subcount') ? { code: 200, createdPlaylistCount: 25, subPlaylistCount: 3 }
        : path.includes('user/level') ? { code: 200, data: { level: 8, nowPlayCount: 1234 } }
        : path.includes('user/record') ? { code: 200, weekData: tracks.map((song, i) => ({ song, playCount: 16 - i })), allData: tracks.map((song, i) => ({ song, playCount: 32 - i })) }
        : path.includes('history/recommend/songs/detail') ? { code: 200, data: { songs: url.searchParams.get('date') === dailyDates[1].date ? tracks.map(track => ({ ...track, name: `昨日推荐 · ${track.name}` })) : tracks } }
        : path.includes('history/recommend/songs') ? { code: 200, data: { dates: dailyDates } }
        : path.includes('likelist') ? { code: 200, ids: tracks.map(track => track.id) }
        : path.includes('song/detail') ? { code: 200, songs: tracks }
        : path.includes('recommend/resource') ? { code: 200, recommend: playlists.slice(1, 7) }
        : path.endsWith('/banner') ? { code: 200, banners: [1,2,3].map(id => ({ targetId: id, targetType: 1000, typeTitle: '精选歌单 ' + id, imageUrl: cover })) }
        : path.includes('personalized/newsong') ? { code: 200, result: tracks }
        : path.includes('/personalized') ? { code: 200, result: playlists.slice(1,7) }
        : path.includes('top/playlist') ? { code: 200, playlists: playlists.slice(1,7) }
        : path.includes('album/newest') ? { code: 200, albums: [1,2,3].map(id => ({ id, name: '预览专辑 ' + id, picUrl: cover, artist: { name: '哲听预览' } })) }
        : path.endsWith('/toplist') ? { code: 200, list: playlists.slice(1,4) }
        : path.includes('cloudsearch') || path.includes('/search') ? { code: 200, result: { songs: tracks, songCount: tracks.length } }
        : path.includes('playlist/detail') ? { code: 200, playlist: { id: 1, name: '移动端预览歌单', description: '让歌曲陪伴日常。这里是一段较长的真实字段样例，用于检查简介两行截断与展开。更多的文字在展开以后出现，收起时不挤压歌曲列表。'.repeat(3), coverImgUrl: cover, creator: { nickname: '哲听预览' }, tracks, trackIds: tracks.map(({ id }) => ({ id })), trackCount: tracks.length } }
        : path.includes('playlist/track') ? { code: 200, songs: tracks }
        : { code: 200, data: [], result: [], playlist: [], songs: [], profile: null }
      return route.fulfill({ json: response })
    })
    await context.addInitScript(({ theme, title, cover, tracks }) => {
      const values = { 'zheting-theme': theme, layout_mode: 'auto', default_page: 'explore', restore_session: 'false', player_id: '91000', player_title: title, player_artist: '哲听预览', player_cover: cover, player_duration: '240', player_time: '45', player_qi: '0', player_queue: JSON.stringify(tracks) }
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value)
      localStorage.setItem('auth_user', JSON.stringify({ userId: 1, nickname: '哲听预览', avatarUrl: cover }))
      localStorage.setItem('auth_mode', 'account')
      localStorage.setItem('local_history', JSON.stringify(tracks.map((track, i) => ({ ...track, artists: track.ar, album: track.al, picUrl: track.al.picUrl, duration: track.dt, playedAt: Date.now() - i * 60000, playCount: i + 1 }))))
    }, { theme, title, cover, tracks })
    await page.goto(`${base}/preview-seed`)
    await page.evaluate(async ({ rows, startedAt }) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('zheting-listening', 1)
        request.onupgradeneeded = () => { request.result.createObjectStore('records', { keyPath: 'key' }); request.result.createObjectStore('metadata') }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise((resolve, reject) => {
        const tx = database.transaction(['records', 'metadata'], 'readwrite')
        for (const row of rows) tx.objectStore('records').put(row)
        tx.objectStore('metadata').put({ startedAt, legacy: { playCount: 12, totalDuration: 2880000 } }, 'archive')
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
      database.close()
    }, { rows: listeningRows, startedAt: fixtureNow - 45 * 86400000 })
    await page.goto(`${base}/?mobile`)
    await page.locator('.mobile-mini-player').waitFor()
    await page.waitForFunction(() => !document.querySelector('.mini-player-info small')?.textContent.includes('正在同步歌词'))
    assert.match(await page.locator('.mini-player-info small').textContent(), /让音乐慢慢流淌/, `lyric fixture requests: ${apiPaths.join(', ')}; errors: ${errors.join(', ')}`)
    assert.equal(await page.locator('.mobile-mini-player').evaluate(el => el.getBoundingClientRect().height), 56)
    await page.screenshot({ path: join(output, `mini-${theme}.png`) })
    await page.screenshot({ path: join(output, `dock-${theme}.png`), clip: { x: 0, y: 684, width: 390, height: 160 } })
    await page.locator('.mobile-tab[data-view="library"]').click()
    const owned = page.locator('.library-card-owned').first()
    await owned.waitFor()
    await page.locator('.library-page').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    assert.equal(await page.locator('.library-mobile-section').count(), 2)
    assert.equal(await page.locator('.library-card-owned .library-card-actions').count(), 0, 'mobile cards have no persistent edit/delete controls')
    const libraryGeometry = await owned.evaluate(el => ({ height: el.getBoundingClientRect().height, cover: el.querySelector('.library-card-cover').getBoundingClientRect().width }))
    assert.ok(libraryGeometry.height >= 71 && libraryGeometry.height <= 73 && libraryGeometry.cover === 52, JSON.stringify(libraryGeometry))
    await page.screenshot({ path: join(output, `library-${theme}.png`) })
    await page.locator('.mobile-page-content').evaluate(el => el.scrollTop = 140)
    const libraryScroll = await page.locator('.mobile-page-content').evaluate(el => el.scrollTop)
    await owned.locator('img').first().evaluate(img => img.decode())
    await owned.click()
    await page.locator('.mobile-detail-page:not([inert]) .playlist-track-row').first().waitFor()
    const flight = page.locator('.shared-cover-flight')
    await flight.waitFor()
    const landing = await flight.evaluate(img => ({ left: parseFloat(img.style.left), top: parseFloat(img.style.top), width: parseFloat(img.style.width) }))
    await page.locator('.mobile-detail-page:not([inert])').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)))
    const destination = await page.locator('.playlist-cover-open img').boundingBox()
    assert.ok(Math.abs(landing.left - destination.x) < 1 && Math.abs(landing.top - destination.y) < 1 && Math.abs(landing.width - destination.width) < 1, `shared cover lands without a jump: ${JSON.stringify({ landing, destination })}`)
    await flight.waitFor({ state: 'detached' })
    assert.equal(await page.locator('.playlist-cover-open img').evaluate(img => getComputedStyle(img).opacity), '1', 'real cover is restored after the flight')
    for (const width of [320, 375, 390, 430, 720]) {
      await page.setViewportSize({ width, height: width === 720 ? 1024 : 844 })
      const geometry = await page.locator('.mobile-detail-page:not([inert])').evaluate(el => ({
        width: el.clientWidth, scroll: el.scrollWidth,
        cover: el.querySelector('.playlist-cover-open').getBoundingClientRect().width,
        rows: [...el.querySelectorAll('.playlist-track-row')].slice(0,2).map(row => ({ height: row.getBoundingClientRect().height, bottom: row.getBoundingClientRect().bottom, opacity: getComputedStyle(row).opacity, shadow: getComputedStyle(row).boxShadow, album: getComputedStyle(row.querySelector('.col-album')).display, duration: getComputedStyle(row.querySelector('.col-dur')).display, more: row.querySelector('.m-track-more').getBoundingClientRect().width })),
        dock: document.querySelector('.mobile-mini-player').getBoundingClientRect().top,
      }))
      assert.ok(geometry.scroll <= geometry.width + 1, 'playlist fits ' + width + ': ' + JSON.stringify(geometry))
      assert.ok(Math.abs(geometry.cover - (width === 320 ? 96 : 112)) < 1)
      assert.ok(geometry.rows.every(row => row.height >= 79 && row.height <= 81 && row.more === 48 && row.opacity === '1' && row.shadow === 'none' && row.album !== 'none' && row.duration !== 'none'), JSON.stringify(geometry))
      if (width === 390) assert.ok(geometry.rows[1].bottom <= geometry.dock, 'two complete songs above dock: ' + JSON.stringify(geometry))
    }
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.locator('.mobile-detail-page:not([inert]) .col-dur[data-duration-missing="true"]').evaluate(el => getComputedStyle(el).visibility), 'hidden', 'missing duration is not fabricated')
    await page.screenshot({ path: join(output, 'playlist-' + theme + '.png') })
    const coverEntry = page.locator('.playlist-cover-open')
    await coverEntry.click()
    await page.getByRole('dialog', { name: '移动端预览歌单的封面', exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await page.locator('.cover-preview-overlay').waitFor({ state: 'detached' })
    assert.equal(await coverEntry.evaluate(el => document.activeElement === el), true, 'cover returns focus')
    await page.getByRole('button', { name: '展开简介', exact: true }).click()
    assert.equal(await page.locator('.playlist-desc-toggle').getAttribute('aria-expanded'), 'true')
    await page.getByRole('button', { name: '收起简介', exact: true }).click()
    await page.getByRole('button', { name: '选择歌曲排序', exact: true }).click()
    await page.locator('.sort-sheet').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)))
    for (const label of ['加入时间', '歌曲', '歌手', '时长']) {
      const choice = page.locator('.sort-sheet-options').getByRole('button', { name: label, exact: true })
      await choice.click()
      assert.equal(await choice.getAttribute('aria-pressed'), 'true')
      const direction = await page.locator('.sort-sheet-direction button.active').textContent()
      await choice.click()
      assert.equal(await page.locator('.sort-sheet-direction button.active').textContent(), direction, 'repeat condition preserves direction')
      for (const directionLabel of ['↑ 升序', '↓ 降序']) {
        const control = page.getByRole('button', { name: directionLabel, exact: true })
        await control.click()
        assert.equal(await control.getAttribute('aria-pressed'), 'true')
      }
    }
    await page.screenshot({ path: join(output, 'sort-' + theme + '.png') })
    await page.getByRole('button', { name: '完成', exact: true }).click()
    await page.locator('.sort-sheet').waitFor({ state: 'detached' })
    assert.equal(await page.locator('.playlist-sort-mobile').evaluate(el => document.activeElement === el), true)
    const songBeforeArtist = await page.locator('.mini-player-info strong').textContent()
    await page.locator('.mobile-detail-page:not([inert]) .artist-link').first().press('Enter')
    await page.locator('.artist-page').waitFor()
    assert.equal(await page.locator('.mini-player-info strong').textContent(), songBeforeArtist, 'artist keyboard entry does not play the row')
    await page.getByRole('button', { name: '返回上一页', exact: true }).click()
    await page.locator('.mobile-detail-page:not([inert]) .playlist-track-row').first().waitFor()
    await page.evaluate(async () => {
      const { router } = await import('/src/lib/stores/router.svelte.ts')
      const saved = { ...router.playlistDetail }
      Object.assign(router.playlistDetail, { coverImgUrl: '', picUrl: '' })
      await new Promise(resolve => requestAnimationFrame(resolve))
      window.previewSavedDetail = saved
    })
    await page.locator('.playlist-cover--empty').waitFor()
    assert.equal(await page.locator('.playlist-cover--empty').isVisible(), true, 'missing cover has a placeholder')
    assert.equal(await coverEntry.count(), 0, 'missing cover does not offer an empty preview')
    await page.evaluate(async () => {
      const { router } = await import('/src/lib/stores/router.svelte.ts')
      router.playlistDetail.tracks = []
    })
    await page.locator('.track-empty-row').waitFor()
    assert.equal(await page.locator('.playlist-play-btn').isDisabled(), true, 'empty playlists cannot play')
    await page.evaluate(async () => {
      const { router } = await import('/src/lib/stores/router.svelte.ts')
      Object.assign(router.playlistDetail, window.previewSavedDetail)
      delete window.previewSavedDetail
    })
    await coverEntry.locator('img').waitFor()
    await coverEntry.locator('img').evaluate(el => el.dispatchEvent(new Event('error')))
    assert.equal(await page.locator('.playlist-cover--empty').isVisible(), true, 'broken hero has a stable placeholder')
    await page.locator('.mobile-page-content').evaluate(el => el.scrollTop = 360)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.getByRole('button', { name: '返回上一页', exact: true }).click()
    const ghost = page.locator('.mobile-detail-outro')
    if (await ghost.count()) {
      assert.equal(await ghost.getAttribute('aria-hidden'), 'true')
      assert.equal(await ghost.evaluate(el => el.inert && getComputedStyle(el).pointerEvents === 'none'), true)
    }
    await ghost.waitFor({ state: 'detached' })
    assert.equal(await page.locator('.mobile-page-content').evaluate(el => el.scrollTop), libraryScroll, 'return restores the library scroll position')
    await owned.click()
    await page.locator('.mobile-detail-page:not([inert]) .playlist-track-row').first().waitFor()
    assert.ok(await page.locator('.mobile-page-content').evaluate(el => el.scrollTop >= 359), 'back into detail restores scroll')
    await page.getByRole('button', { name: '返回上一页', exact: true }).click()
    await owned.click()
    assert.ok(await page.locator('.mobile-detail-outro').count() <= 1, 'rapid navigation keeps one outgoing layer')
    await page.waitForTimeout(320)
    assert.equal(await page.locator('.mobile-detail-outro').count(), 0)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: '返回上一页', exact: true }).click()
    assert.equal(await page.locator('.mobile-detail-outro').count(), 0, 'reduced motion has no exit layer')
    await owned.click()
    assert.equal(await page.locator('.mobile-detail-page:not([inert])').evaluate(el => el.getAnimations().length), 0)
    await page.getByRole('button', { name: '返回上一页', exact: true }).click()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await owned.waitFor()
    const box = await owned.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 30)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + 55)
    await page.mouse.up()
    await page.waitForTimeout(550)
    assert.equal(await page.locator('.library-options-sheet, .playlist-detail-page:visible').count(), 0, 'scroll movement cancels long press and its release click')
    await page.mouse.move(box.x + box.width / 2, box.y + 30)
    await page.mouse.down()
    await page.getByRole('dialog', { name: '歌单管理', exact: true }).waitFor()
    await page.mouse.up()
    await page.locator('.library-options-sheet').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    assert.equal(await page.locator('.playlist-detail-page:visible').count(), 0, 'long press must not open the playlist on release')
    await page.screenshot({ path: join(output, `library-menu-${theme}.png`) })
    await page.getByRole('button', { name: '编辑歌单 名称与简介', exact: true }).click()
    await page.getByRole('dialog', { name: '编辑歌单', exact: true }).waitFor()
    assert.equal(await page.locator('.library-options-sheet').count(), 0, 'edit starts after the action sheet exits')
    assert.match(await page.locator('.library-modal-input').inputValue(), /预览歌单 1/)
    await page.getByRole('dialog', { name: '编辑歌单', exact: true }).getByRole('button', { name: '取消', exact: true }).click()
    await page.locator('.library-modal').waitFor({ state: 'detached' })
    assert.equal(await owned.evaluate(el => document.activeElement === el), true, 'edit returns focus to the held card')
    await owned.press('Shift+F10')
    await page.getByRole('button', { name: '删除歌单', exact: true }).click()
    await page.getByRole('dialog', { name: '删除歌单', exact: true }).getByRole('button', { name: '取消', exact: true }).click()
    await page.locator('.confirm-card').waitFor({ state: 'detached' })
    const saved = page.locator('.library-card-managed').first()
    await saved.locator('.library-card-more').click()
    assert.equal(await page.getByRole('button', { name: '编辑歌单 名称与简介', exact: true }).count(), 0, 'saved playlists cannot be edited')
    await page.getByRole('button', { name: '取消收藏', exact: true }).click()
    await page.getByRole('dialog', { name: '取消收藏', exact: true }).getByRole('button', { name: '取消', exact: true }).click()
    await page.locator('.confirm-card').waitFor({ state: 'detached' })
    await page.locator('.library-mobile-favorite .library-card-more').click()
    assert.equal(await page.getByRole('button', { name: '删除歌单', exact: true }).count(), 0, 'liked playlist cannot be deleted')
    assert.equal(await page.getByRole('button', { name: '取消收藏', exact: true }).count(), 0, 'liked playlist cannot be unsubscribed')
    await page.setViewportSize({ width: 320, height: 480 })
    await page.waitForFunction(() => {
      const rect = document.querySelector('.library-options-sheet').getBoundingClientRect()
      return rect.width === 320 && rect.top >= 24 && rect.bottom <= 481
    })
    const libraryHandle = await page.locator('.library-options-sheet .m-sheet-handle').boundingBox()
    await page.mouse.move(libraryHandle.x + libraryHandle.width / 2, libraryHandle.y + 24)
    await page.mouse.down()
    await page.mouse.move(libraryHandle.x + libraryHandle.width / 2, libraryHandle.y + 144, { steps: 8 })
    await page.mouse.up()
    await page.locator('.library-options-sheet').waitFor({ state: 'detached' })
    assert.equal(await page.locator('.library-mobile-favorite .library-card').evaluate(el => document.activeElement === el), true, 'drag close returns to its card')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForFunction(() => !document.documentElement.classList.contains('mobile-runtime') && document.querySelectorAll('.library-card-actions').length === 24)
    assert.equal(await page.locator('.library-card-more').count(), 0, 'PC keeps its existing controls')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.mobile-tab[data-view="explore"]').click()
    assert.equal(apiPaths.some(path => /playlist\/(delete|subscribe|name\/update|desc\/update)/.test(path)), false, 'preview never applies playlist mutations')
    await page.getByRole('button', { name: '播放列表', exact: true }).click()
    await page.getByRole('dialog', { name: '播放队列' }).waitFor()
    await page.locator('.queue-panel').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    assert.equal(await page.locator('.queue-item-open').count(), tracks.length)
    await page.screenshot({ path: join(output, `queue-${theme}.png`) })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('dialog', { name: '播放队列' }).waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('mini-player-queue')), true, 'queue returns focus to its entry')
    await page.getByRole('button', { name: '打开导航菜单', exact: true }).click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    assert.equal(await page.locator('.settings-page select').count(), 0, 'mobile settings have no native selects')
    await page.locator('.settings-page').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: join(output, `settings-${theme}.png`) })
    await page.setViewportSize({ width: 320, height: 568 })
    const settingsTargets = await page.locator('.settings-page :is(.switch-control, .accent-picker button, .settings-secondary-btn, .mobile-setting-select):visible').evaluateAll(elements => elements.map(el => ({ className: el.className, height: el.getBoundingClientRect().height })))
    assert.ok(settingsTargets.every(({ height }) => height >= 47.99), `settings touch targets: ${JSON.stringify(settingsTargets)}`)
    const settingsFit = await page.locator('.settings-panel').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, overflow: [...el.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).map(child => ({ class: child.className, width: child.getBoundingClientRect().width, text: child.textContent.slice(0,60) })).slice(0,12) }))
    assert.ok(settingsFit.scroll <= settingsFit.width, JSON.stringify(settingsFit))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForFunction(() => Math.abs(document.querySelector('.app-shell').getBoundingClientRect().height - innerHeight) < 1)
    await page.locator('.mobile-setting-select').first().evaluate(el => el.closest('.settings-row').scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: join(output, `settings-controls-${theme}.png`) })
    await page.locator('.mobile-page-content').evaluate(el => el.scrollTop = 0)
    const quality = page.locator('.mobile-setting-select').nth(1)
    await quality.click()
    await page.getByRole('dialog', { name: '默认音质', exact: true }).waitFor()
    await page.locator('.mobile-choice-sheet').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    await page.getByRole('button', { name: '极高', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '极高', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.screenshot({ path: join(output, `choice-${theme}.png`) })
    await page.getByRole('button', { name: '完成', exact: true }).click()
    await page.locator('.mobile-choice-sheet').waitFor({ state: 'detached' })
    assert.equal(await quality.evaluate(el => document.activeElement === el), true, 'selection returns focus to its entry')
    await page.locator('.mini-player-open').click()
    await page.getByRole('dialog', { name: '正在播放', exact: true }).waitFor()
    await page.locator('.ly-fullscreen').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: join(output, 'player-' + theme + '.png') })
    await page.locator('.am-flying-cover').click()
    await page.waitForFunction(() => document.querySelector('.apple-music-player').classList.contains('lyrics-mode'))
    await page.locator('.apple-music-player').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)))
    assert.equal((await page.locator('.am-flying-cover').boundingBox()).width, 48, 'lyrics mode keeps the compact cover')
    assert.equal(await page.locator('.am-lyrics-area').evaluate(el => getComputedStyle(el).opacity), '1', 'lyrics remain visible after the transition')
    await page.screenshot({ path: join(output, 'lyrics-' + theme + '.png') })
    await page.locator('.am-flying-cover').click()
    await page.locator('.apple-music-player').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)))
    for (const viewport of [{ width: 320, height: 480 }, { width: 375, height: 667 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport)
      await page.locator('.am-flying-cover').click()
      await page.locator('.apple-music-player').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)))
      const controls = await page.locator('.am-play-row').boundingBox()
      assert.ok(controls.y >= 0 && controls.y + controls.height <= viewport.height, `player controls fit ${JSON.stringify(viewport)}`)
      assert.equal((await page.locator('.am-flying-cover').boundingBox()).width, 48)
      await page.locator('.am-flying-cover').click()
      await page.locator('.apple-music-player').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)))
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.am-flying-cover').evaluate(el => { el.click(); el.click(); el.click() })
    await page.locator('.apple-music-player').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)))
    assert.equal(await page.locator('.apple-music-player').evaluate(el => el.classList.contains('lyrics-mode')), true, 'rapid toggles keep the final mode')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.locator('.am-flying-cover').click()
    assert.equal(await page.locator('.apple-music-player').evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0, 'reduced mode switch has no running animations')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.getByRole('button', { name: '更多操作', exact: true }).click()
    await page.getByRole('dialog', { name: '更多操作菜单', exact: true }).waitFor()
    await page.locator('.am-more-menu').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: join(output, `more-${theme}.png`) })
    await page.getByRole('button', { name: '音质：极高', exact: true }).click()
    await page.getByRole('dialog', { name: '音质', exact: true }).waitFor()
    await page.locator('.am-more-menu').waitFor({ state: 'detached' })
    await page.locator('.am-secondary-sheet').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    assert.equal(await page.locator('[data-bottom-panel]:visible').count(), 1, 'menu switches directly to one secondary panel')
    await page.screenshot({ path: join(output, `quality-${theme}.png`) })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.locator('.am-secondary-sheet').waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '收起播放器', exact: true }).click()
    await page.locator('.ly-fullscreen').waitFor({ state: 'detached' })
    await page.setViewportSize({ width: 320, height: 480 })
    await quality.click()
    await page.locator('.mobile-choice-sheet').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    const sheet = await page.locator('.mobile-choice-sheet').boundingBox()
    assert.ok(sheet.y >= 24 && sheet.y + sheet.height <= 480, 'short-screen choice panel fits')
    const handle = await page.locator('.mobile-choice-sheet .m-sheet-handle').boundingBox()
    const hx = handle.x + handle.width / 2, hy = handle.y + handle.height / 2
    await page.mouse.move(hx, hy)
    await page.mouse.down()
    await page.mouse.move(hx, hy + 35, { steps: 5 })
    await page.mouse.up()
    await page.locator('.mobile-choice-sheet').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    assert.equal(await page.locator('.mobile-choice-sheet').count(), 1, 'short drag cancels dismissal')
    await page.mouse.move(hx, hy)
    await page.mouse.down()
    await page.mouse.move(hx, hy + 120, { steps: 8 })
    await page.mouse.up()
    await page.locator('.mobile-choice-sheet').waitFor({ state: 'detached' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await quality.click()
    assert.equal(await page.locator('.mobile-choice-sheet').evaluate(el => el.getAnimations().length), 0)
    await page.keyboard.press('Escape')
    await page.locator('.mobile-choice-sheet').waitFor({ state: 'detached' })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForFunction(() => !document.documentElement.classList.contains('mobile-runtime') && document.querySelectorAll('.settings-page select').length === 4)
    assert.equal(await page.locator('.mobile-mini-player').count(), 0, 'landscape/desktop retains the PC player')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '返回上一页', exact: true }).click()
    await page.locator('.music-feature-card.primary').waitFor()
    assert.equal(await page.locator('.music-feature-stack').isVisible(), false, 'one mobile focus')
    const discovery = await page.locator('.music-discovery').evaluate(el => ({
      width: el.clientWidth, scroll: el.scrollWidth,
      focus: el.querySelector('.music-feature-card.primary').getBoundingClientRect().width,
      rail: getComputedStyle(el.querySelector('.music-card-rail')).gridAutoFlow,
      cards: [...el.querySelectorAll('.music-discovery-section')].filter(section => !section.classList.contains('music-extra-playlists')).flatMap(section => [...section.querySelectorAll('.music-cover-card')].map(card => ({ right: card.getBoundingClientRect().right, pageRight: el.getBoundingClientRect().right }))),
    }))
    assert.ok(discovery.scroll <= discovery.width + 1 && discovery.focus >= 350 && discovery.rail === 'row' && discovery.cards.every(card => card.right <= card.pageRight + 1), JSON.stringify(discovery))
    await page.screenshot({ path: join(output, 'explore-' + theme + '.png') })
    await page.getByRole('button', { name: '搜索音乐', exact: true }).click()
    await page.locator('.search-input').fill('预览')
    await page.locator('.search-input').press('Enter')
    await page.locator('.m-track-more').first().click()
    await page.locator('.song-menu').waitFor()
    await page.screenshot({ path: join(output, `song-menu-${theme}.png`) })
    await page.getByRole('button', { name: '添加到歌单', exact: true }).click()
    await page.getByRole('button', { name: '返回', exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.song-menu__playlist').length === 24)
    const playlistPanelWidth = (await page.locator('.song-menu.panel').boundingBox()).width
    assert.ok(Math.abs(playlistPanelWidth - 390) < 1, 'playlist selection must use a full-width mobile sheet')
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '返回', 'secondary menu receives focus')
    await page.screenshot({ path: join(output, `add-playlist-${theme}.png`) })
    await page.setViewportSize({ width: 320, height: 480 })
    await page.waitForFunction(() => {
      const sheet = document.querySelector('.song-menu.panel').getBoundingClientRect()
      return sheet.top >= 24 && sheet.height <= 480 * .85 + 1 && sheet.bottom <= 481
    })
    const returnY = (await page.locator('.song-menu__panel-head').boundingBox()).y
    await page.locator('.song-menu__playlists').evaluate(el => el.scrollTop = el.scrollHeight)
    assert.equal((await page.locator('.song-menu__panel-head').boundingBox()).y, returnY, 'return header stays visible over long playlist choices')
    assert.equal(await page.locator('.song-menu__body').evaluate(el => el.scrollTop), 0, 'playlist selection has no nested outer scrolling')
    assert.ok(await page.locator('.song-menu__playlists').evaluate(el => el.scrollTop > 0), 'playlist choices scroll on a short screen')
    await page.getByRole('button', { name: '返回', exact: true }).click()
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-playlist-action')), 'add', 'return restores the menu action focus')
    await page.getByRole('button', { name: '关闭歌曲操作', exact: true }).click()
    await page.locator('.song-menu').waitFor({ state: 'detached' })

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 390, height: 844 })
    const navigate = async (view, selector) => {
      await page.evaluate(async view => { const { router } = await import('/src/lib/stores/router.svelte.ts'); router.handleNav(view) }, view)
      await page.locator(`${selector}:visible`).waitFor()
      await page.locator('.mobile-page-content').evaluate(el => { el.scrollTop = 0 })
    }
    const checkPage = async (selector, targets, longText, screenshot) => {
      const root = page.locator(`${selector}:visible`)
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
        await page.waitForFunction(() => document.documentElement.classList.contains('mobile-runtime') && Math.abs(document.querySelector('.app-shell').getBoundingClientRect().height - innerHeight) < 1)
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        await page.waitForFunction(() => !document.querySelector('.mobile-route-outgoing'))
        const layout = await root.evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, client: el.clientWidth, scroll: el.scrollWidth }))
        assert.ok(layout.left >= -1 && layout.right <= width + 1 && layout.scroll <= layout.client + 1, `${selector} fits ${width}px: ${JSON.stringify(layout)}`)
        assert.equal(await page.locator('.mobile-page-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, `${selector} has no page overflow at ${width}px`)
        const sizes = await root.locator(`:is(${targets}):visible`).evaluateAll(elements => elements.map(el => ({ className: el.className, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })))
        assert.ok(sizes.length && sizes.every(size => size.height >= 47.99 && size.width >= 47.99), `${selector} touch targets at ${width}px: ${JSON.stringify(sizes)}`)
        const text = await root.locator(longText).first().evaluate(el => { const style = getComputedStyle(el); return { overflow: style.overflowX, nowrap: style.whiteSpace, clamp: style.webkitLineClamp, width: el.clientWidth, scroll: el.scrollWidth } })
        assert.ok(text.overflow === 'hidden' && (text.nowrap === 'nowrap' || Number(text.clamp) > 0), `${selector} constrains long text: ${JSON.stringify(text)}`)
        if (selector === '.profile-home') {
          assert.equal(await root.locator('.profile-home__dashboard').isVisible(), false, `mobile home hides recent/weekly modules at ${width}px`)
          assert.equal(await root.locator('.user-profile-hero__level').isVisible(), false, `mobile home hides the profile level at ${width}px`)
          assert.equal(await root.locator('.profile-home__quick > button').filter({ hasText: '最近播放' }).isVisible(), true, 'recent shortcut remains available')
        }
      }
      await page.locator('.mobile-page-content').evaluate(el => { el.scrollTop = 0 })
      await page.locator('.mobile-page-content').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {}))))
      if (selector === '.listening-report') {
        const heat = root.locator('.wall-figure:not(.wall-figure-strip)')
        const geometry = await heat.evaluate(el => ({ position: el.scrollLeft, width: el.clientWidth, content: el.scrollWidth }))
        assert.ok(geometry.content > geometry.width, 'year heatmap scrolls internally instead of widening the page')
        assert.ok(Math.abs(geometry.position - (geometry.content - geometry.width)) <= 1, `year heatmap automatically reveals latest weeks: ${JSON.stringify(geometry)}`)
        const activity = await heat.evaluate(el => {
          const frame = el.getBoundingClientRect()
          const cells = [...el.querySelectorAll('.wall-cell')].filter(cell => parseFloat(cell.style.getPropertyValue('--fill')) > 0)
          return { visible: cells.filter(cell => cell.getBoundingClientRect().right > frame.left && cell.getBoundingClientRect().left < frame.right).length, active: cells.length, frame: frame.width, grid: el.querySelector('.wall-grid').getBoundingClientRect().width, months: el.querySelector('.wall-months').getBoundingClientRect().width, position: el.scrollLeft }
        })
        assert.ok(Math.abs(activity.grid - activity.months) <= 1, `month labels align with day columns: ${JSON.stringify(activity)}`)
        assert.ok(activity.visible > 0, `latest visible weeks contain seeded listening activity: ${JSON.stringify(activity)}`)
      }
      await page.mouse.move(-10, -10)
      await page.screenshot({ path: join(output, `${screenshot}-${theme}.png`) })
    }
    const checkSongMenu = async selector => {
      const songBefore = await page.locator('.mini-player-info strong').textContent()
      await page.locator(`${selector} .m-track-more`).first().click()
      await page.locator('.song-menu').waitFor()
      assert.equal(await page.locator('.mini-player-info strong').textContent(), songBefore, 'more opens its menu without starting playback')
      await page.getByRole('button', { name: '关闭歌曲操作', exact: true }).click()
      await page.locator('.song-menu').waitFor({ state: 'detached' })
    }

    await navigate('home', '.profile-home')
    await page.locator('.profile-home__cover-grid > button').first().waitFor()
    await checkPage('.profile-home', '.profile-home__quick > button, header button, .profile-home__cover-grid > button', '.user-profile-hero h1', 'home')
    const homeGeometry = await page.locator('.profile-home').evaluate(el => ({ hero: el.querySelector('.user-profile-hero').getBoundingClientRect().height, quick: el.querySelector('.profile-home__quick').getBoundingClientRect().height, firstPlaylistBottom: el.querySelector('.profile-home__cover-grid > button').getBoundingClientRect().bottom }))
    assert.notEqual(await page.locator('.profile-home__quick > button').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'favorite entry has a tonal background')
    assert.ok(await page.locator('.profile-home__cover-grid').first().evaluate(el => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === 'auto'), 'home playlists form a horizontal carousel')
    await page.locator('.profile-home__cover-grid > button').last().focus()
    assert.ok(await page.locator('.profile-home__cover-grid').last().evaluate(el => el.scrollLeft > 0), 'keyboard focus reveals an offscreen playlist')
    await page.locator('.profile-home__cover-grid').evaluateAll(elements => elements.forEach(el => el.scrollLeft = 0))
    await page.locator('.mobile-page-content').evaluate(el => el.scrollTop = 0)
    assert.ok(homeGeometry.hero <= 170 && homeGeometry.quick >= 306 && homeGeometry.quick <= 320, `home keeps two rows of large cards: ${JSON.stringify(homeGeometry)}`)
    assert.equal(await page.locator('.profile-home__quick-label:visible').count(), 4, 'home cards retain their English labels')
    await page.locator('.profile-home__quick > button').filter({ hasText: '最近播放' }).click()
    await page.locator('.recent-page .track-table tbody tr').first().waitFor()
    await checkPage('.recent-page', '.play-all-btn, .m-track-more', '.col-title', 'recent')
    await checkSongMenu('.recent-page')

    await navigate('home', '.profile-home')
    await page.locator('.profile-home__quick > button').filter({ hasText: '历史日推' }).click()
    await page.locator('.daily-song-row:not(.skeleton-row)').first().waitFor()
    await checkPage('.daily-page', '.daily-hero-play, .daily-section-header button, .daily-date-chip, .m-track-more', '.daily-song-main strong', 'daily')
    await page.locator('.daily-date-chip').nth(1).click()
    await page.waitForFunction(date => document.querySelector('.daily-date-chip[aria-current="date"]')?.classList.contains('active') && document.querySelector('.daily-hero-stats')?.getAttribute('data-date') === date && document.querySelector('.daily-song-main strong')?.textContent.startsWith('昨日推荐'), dailyDates[1].date)
    await checkSongMenu('.daily-page')
    await page.locator('.daily-date-chip').first().click()
    await page.waitForFunction(() => !document.querySelector('.daily-song-main strong')?.textContent.startsWith('昨日推荐'))

    await navigate('liked', '.liked-page')
    await page.locator('.liked-song-row').first().waitFor()
    await checkPage('.liked-page', '.liked-hero-play, .m-track-more', '.liked-song-main strong', 'liked')
    await checkSongMenu('.liked-page')

    await navigate('home', '.profile-home')
    await page.locator('.profile-home__quick > button').filter({ hasText: '本地听歌统计' }).click()
    await page.locator('.report-hero').waitFor()
    assert.equal(await page.locator('.track-ranking li').count(), 10, 'seeded report shows actual ranked data')
    await checkPage('.listening-report', '.report-header nav button', '.rank-copy strong', 'report')
    const allPlays = Number(await page.locator('.report-numbers strong').first().textContent())
    await page.getByRole('button', { name: '本周', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '本周', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.ok(Number(await page.locator('.report-numbers strong').first().textContent()) < allPlays, 'week excludes older seeded listening')
    assert.match(await page.locator('.hero-copy .eyebrow').textContent(), /本周/)
    await page.waitForFunction(() => [...document.querySelectorAll('.listening-report .wall-figure')].every(el => el.scrollLeft === 0))
    await page.getByRole('button', { name: '本月', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '本月', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.match(await page.locator('.hero-copy .eyebrow').textContent(), /本月/)
    await page.waitForFunction(() => [...document.querySelectorAll('.listening-report .wall-figure')].every(el => el.scrollLeft === 0))
    await page.getByRole('button', { name: '累计', exact: true }).click()
    assert.equal(Number(await page.locator('.report-numbers strong').first().textContent()), allPlays)

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForFunction(() => !document.documentElement.classList.contains('mobile-runtime'))
    assert.equal(await page.locator('.report-header h1').isVisible(), true, 'PC report keeps its original heading')
    assert.equal(await page.locator('.report-hero').evaluate(el => getComputedStyle(el).minHeight), '290px', 'PC report keeps its original hero geometry')
    await page.evaluate(async () => { const { router } = await import('/src/lib/stores/router.svelte.ts'); router.handleNav('home') })
    await page.locator('.profile-home:visible .user-profile-hero').waitFor()
    assert.equal(await page.locator('.profile-home:visible .user-profile-hero').evaluate(el => getComputedStyle(el).minHeight), '316px', 'PC home retains its hero')
    assert.equal(await page.locator('.profile-home:visible .profile-home__quick-label').first().isVisible(), true, 'PC home keeps its labels')
    assert.equal(await page.locator('.profile-home:visible .profile-home__quick > button').first().evaluate(el => getComputedStyle(el).minHeight), '112px')
    assert.equal(await page.locator('.profile-home:visible .user-profile-hero__level').isVisible(), true, 'PC home keeps the profile level')
    assert.equal(await page.locator('.profile-home:visible .profile-home__panel').count(), 2, 'PC home keeps recent and weekly modules')
    assert.ok(await page.locator('.profile-home:visible .profile-home__panel').evaluateAll(elements => elements.every(el => el.getBoundingClientRect().height > 0)), 'PC home modules remain visible')
    for (const [view, hero] of [['dailyHistory', '.daily-hero'], ['liked', '.liked-hero']]) {
      await page.evaluate(async view => { const { router } = await import('/src/lib/stores/router.svelte.ts'); router.handleNav(view) }, view)
      await page.locator(hero).waitFor()
      assert.equal(await page.locator(hero).evaluate(el => getComputedStyle(el).minHeight), '230px', `PC ${view} keeps its hero`)
      assert.equal(await page.locator(`${hero} h1`).isVisible(), true)
      assert.equal(await page.locator('.m-track-more:visible').count(), 0, 'PC retains its existing context-menu access')
    }
    assert.equal(apiPaths.some(path => /song\/url|scrobble/.test(path)), false, 'preview never requests audio or records real listening')
    assert.deepEqual(errors, [], 'served frontend has no runtime errors')
    await context.close()
    console.log(`served preview: ${theme}, home/explore/library/playlist/player/recent/daily/liked/report, 320/375/390/430/720px, dates/periods, mini, library, queue, settings, secondary menus, focus, drag, reduced motion and PC passed`)
  }
} finally { await browser.close() }
console.log(`screenshots: ${output}`)
