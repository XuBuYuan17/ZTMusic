import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.ok(process.env.PR9_PLAYWRIGHT_MODULE, 'Set PR9_PLAYWRIGHT_MODULE to an existing Playwright module')
const { chromium } = await import(pathToFileURL(process.env.PR9_PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ headless: true, ...(process.env.ZT_BROWSER_CHANNEL ? { channel: process.env.ZT_BROWSER_CHANNEL } : {}) })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const svg = await readFile(new URL('./cover.svg', import.meta.url), 'utf8')
const output = resolve(process.env.ZT_DISCOVERY_ARTIFACTS || 'browser-artifacts/discovery-preload')
await mkdir(output, { recursive: true })
const errors = [], calls = []
let owner = 1
let delayFm = false
let releaseFm
page.on('pageerror', error => errors.push(String(error)))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
const base = process.env.ZT_DISCOVERY_URL || 'http://127.0.0.1:5173/'
const pic = (uid, key) => new URL(`covers/${uid}/${key}.svg`, base).href
const song = (uid, key) => ({ id: uid * 1000 + 1, name: '预加载歌曲', ar: [{ id: 7, name: '测试歌手' }], al: { id: 8, name: '测试专辑', picUrl: pic(uid, key) }, dt: 180000 })
await page.route('**/covers/**', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }))
await page.route('**/109951172051500248.jpg*', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }))
await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }))
await page.route('**/ncm-api/**', async route => {
  const url = new URL(route.request().url())
  const path = url.pathname.replace('/ncm-api', '')
  const uid = owner
  calls.push({ uid, path, id: url.searchParams.get('id'), limit: url.searchParams.get('limit') })
  let body = { code: 200 }
  if (path === '/login/status') body.account = { id: uid, anonimousUser: false }
  else if (path === '/personalized' || path === '/top/playlist') {
    const playlists = Array.from({ length: 12 }, (_, index) => ({ id: uid * 100 + index + 10, name: '推荐歌单 ' + index, picUrl: pic(uid, 'normal'), trackCount: 1 }))
    body[path === '/personalized' ? 'result' : 'playlists'] = playlists
  } else if (path === '/recommend/songs') body.data = { dailySongs: [song(uid, 'daily')] }
  else if (path === '/user/playlist') body.playlist = [{ id: uid * 100 + 90, specialType: 5, creator: { userId: uid }, coverImgUrl: pic(uid, 'liked') }]
  else if (path === '/playlist/track/all') body.songs = [song(uid, 'liked')]
  else if (path === '/playmode/intelligence/list') body.data = [{ songInfo: song(uid, 'heart') }]
  else if (path === '/personal_fm') {
    if (delayFm) { delayFm = false; await new Promise(resolve => { releaseFm = resolve }) }
    body.data = [song(uid, 'roaming')]
  } else if (path === '/playlist/detail') {
    const id = Number(url.searchParams.get('id'))
    body.playlist = { id, name: '预取歌单', coverImgUrl: pic(uid, id === 3136952023 ? 'radar' : 'normal'), trackCount: 1, tracks: [song(uid, 'normal')] }
  } else if (path === '/song/detail') body.songs = [song(uid, 'normal')]
  else if (path === '/banner') body.banners = []
  else if (path === '/homepage/block/page') body.data = { blocks: [] }
  else if (path === '/personalized/newsong') body.result = []
  else if (path === '/album/newest') body.albums = []
  await route.fulfill({ json: body })
})
await page.addInitScript(() => {
  localStorage.setItem('auth_user', JSON.stringify({ userId: 1, nickname: '预加载用户' }))
  localStorage.setItem('auth_mode', 'account')
  localStorage.setItem('api_cookie', 'MUSIC_U=fake-account-1')
})

const waitCovers = uid => page.waitForFunction(uid => ['daily', 'heart', 'roaming', 'radar'].every(key => {
  const img = document.querySelector(`[data-discovery="${key}"] img`)
  return img?.src.includes(`/covers/${uid}/`) && img.naturalWidth > 0
}), uid)
try {
  await page.goto(base + '?mobile', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-startup-splash]')
  assert.equal(await page.getByRole('button', { name: '进入首页', exact: true }).count(), 0)
  await waitCovers(1)
  await page.waitForSelector('[data-startup-splash]', { state: 'detached' })
  assert.equal(calls.filter(call => call.path === '/personalized' && call.uid === 1).length, 1, 'startup and discovery must share homepage fetch')
  assert.ok(calls.some(call => call.path === '/playlist/detail' && call.id !== '3136952023'), 'normal playlist details preload before clicking a card')
  const timing = await page.evaluate(() => ({ finish: performance.getEntriesByName('ztmusic:splash-finished')[0].startTime, resources: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/ncm-api/')).map(entry => ({ name: entry.name, at: entry.startTime })) }))
  for (const path of ['/personalized', '/personal_fm', '/user/playlist']) assert.ok(timing.resources.some(resource => resource.name.includes(path) && resource.at < timing.finish), path + ' must begin during the splash')
  assert.equal(await page.locator('.ly-fullscreen').count(), 0, 'startup enters discovery without opening a player dialog')
  await page.locator('.discovery-playlists').scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(output, 'logged-in-covers.png') })
  const before = calls.filter(call => call.path === '/recommend/songs').length
  await page.locator('[data-discovery="daily"]').click()
  await page.waitForSelector('.mobile-route-page:not([inert]) .track-table tbody tr[role="button"]')
  assert.equal(calls.filter(call => call.path === '/recommend/songs').length, before, 'opening daily uses its prefetched songs')
  assert.ok(await page.locator('.mobile-route-page:not([inert]) .playlist-cover').evaluate(img => img.src.includes('/covers/1/daily.svg')))
  await page.getByRole('button', { name: '返回上一页', exact: true }).click()
  await page.waitForSelector('[data-route-key="explore"]:not([inert])')
  const heartBefore = calls.filter(call => call.path === '/playmode/intelligence/list').length
  await page.evaluate(async () => { const { player } = await import('/src/lib/stores/player.svelte.ts'); player.id = 1001 })
  await page.locator('[data-discovery="heart"]').click()
  await page.waitForSelector('.mobile-route-page:not([inert]) .track-table tbody tr[role="button"]')
  assert.equal(calls.filter(call => call.path === '/playmode/intelligence/list').length, heartBefore + 1, 'a changed current song invalidates the prefetched heart seed')
  await page.getByRole('button', { name: '返回上一页', exact: true }).click()
  await page.waitForSelector('[data-route-key="explore"]:not([inert])')

  owner = 2; delayFm = true
  await page.evaluate(async () => { const { auth } = await import('/src/lib/stores/auth.svelte.ts'); const { apiSession } = await import('/src/lib/api/session.ts'); apiSession.setCookie('MUSIC_U=fake-account-2'); auth.setUser({ userId: 2, nickname: '第二个用户' }, 'account') })
  await page.waitForFunction(() => document.querySelector('[data-discovery="daily"] img')?.src.includes('/covers/2/'))
  owner = 3
  await page.evaluate(async () => { const { auth } = await import('/src/lib/stores/auth.svelte.ts'); const { apiSession } = await import('/src/lib/api/session.ts'); apiSession.setCookie('MUSIC_U=fake-account-3'); auth.setUser({ userId: 3, nickname: '第三个用户' }, 'account') })
  await waitCovers(3)
  assert.ok(releaseFm, 'second-account request is actually held in flight')
  releaseFm()
  await page.waitForTimeout(150)
  await waitCovers(3)
  owner = 0
  await page.evaluate(async () => { const { auth } = await import('/src/lib/stores/auth.svelte.ts'); const { apiSession } = await import('/src/lib/api/session.ts'); apiSession.clearCookie(); auth.clear() })
  await page.waitForFunction(() => [...document.querySelectorAll('[data-discovery] img')].every(img => !img.src.includes('/covers/')))
  assert.deepEqual(errors, [], 'preloading must not produce browser errors')
  console.log('Discovery preload: no splash button, early/shared homepage and playlist requests, authenticated real covers, cache reuse, late-account isolation and logout passed')
} catch (error) {
  console.error(JSON.stringify({ errors, calls, covers: await page.locator('[data-discovery] img').evaluateAll(images => images.map(image => image.src)) }))
  await page.screenshot({ path: join(output, 'failure.png') })
  throw error
} finally { releaseFm?.(); await browser.close() }
