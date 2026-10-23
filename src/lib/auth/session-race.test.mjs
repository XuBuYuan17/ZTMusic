import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { classifyLoginStatus } from './login-status.ts'
import { fetchVipInfo, normalizeVipInfo } from './vip.ts'

const source = readFileSync(new URL('../stores/auth.svelte.ts', import.meta.url), 'utf8')
const script = stripTypeScriptTypes(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, ''))

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function createAuth(stored = {}) {
  const storage = new Map(Object.entries(stored).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]))
  let cookieClears = 0
  const ncm = {
    loginStatus: async () => ({ code: 200 }),
    vipInfoV2: async () => ({ code: 200, data: { vipType: 0 } }),
    vipInfo: async () => { throw new Error('unexpected VIP fallback') },
    logout: async () => {},
    setCookie() {},
    clearCookie() { cookieClears++ },
  }
  const context = {
    $state: value => value,
    ncm,
    classifyLoginStatus,
    fetchVipInfo,
    normalizeVipInfo,
    getStorage: (key, fallback) => storage.get(key) ?? fallback,
    getStorageJson: (key, fallback) => storage.has(key) ? JSON.parse(storage.get(key)) : fallback,
    setStorage: (key, value) => storage.set(key, typeof value === 'string' ? value : JSON.stringify(value)),
    removeStorage: key => storage.delete(key),
  }
  runInNewContext(script + '\nglobalThis.auth = auth', context)
  return { auth: context.auth, ncm, storage, get cookieClears() { return cookieClears } }
}

const accountA = { userId: 1, nickname: 'A' }
const accountB = { userId: 2, nickname: 'B' }
let passed = 0

async function test(name, run) {
  await run()
  passed++
  console.log(`PASS: ${name}`)
}

await test('late expiry cannot invalidate a new account using the same login mode', async () => {
  const { auth, ncm, storage } = createAuth()
  auth.setUser(accountA, 'account')
  const oldStatus = deferred()
  ncm.loginStatus = () => oldStatus.promise
  const check = auth.checkLoginStatus()
  auth.setUser(accountB, 'account')
  oldStatus.resolve({ code: 301 })
  assert.equal(await check, true)
  assert.equal(auth.cookieOk, true)
  assert.equal(auth.user.userId, 2)
  assert.equal(JSON.parse(storage.get('auth_user')).userId, 2)
})

await test('late valid status cannot revive a new account whose cookie has expired', async () => {
  const { auth, ncm } = createAuth()
  auth.setUser(accountA, 'account')
  const oldStatus = deferred()
  ncm.loginStatus = () => oldStatus.promise
  const check = auth.checkLoginStatus()
  auth.setUser(accountB, 'account')
  ncm.loginStatus = async () => ({ code: 301 })
  assert.equal(await auth.checkLoginStatus(), false)
  oldStatus.resolve({ code: 200 })
  assert.equal(await check, false)
  assert.equal(auth.cookieOk, false)
})

await test('new login clears the previous VIP and late VIP results cannot replace it', async () => {
  const { auth, ncm, storage } = createAuth()
  auth.setUser(accountA, 'account')
  ncm.vipInfoV2 = async () => ({ code: 200, data: { vipType: 1, vipLevel: 7 } })
  await auth.refreshVipInfo()
  const oldVip = deferred()
  ncm.vipInfoV2 = () => oldVip.promise
  const refresh = auth.refreshVipInfo()
  auth.setUser(accountB, 'account')
  assert.equal(auth.vipInfo, null)
  assert.equal(storage.has('auth_vip'), false)
  ncm.vipInfoV2 = async () => ({ code: 200, data: { vipType: 1, vipLevel: 3 } })
  await auth.refreshVipInfo()
  oldVip.resolve({ code: 200, data: { vipType: 1, vipLevel: 9 } })
  await refresh
  assert.equal(auth.vipInfo.vipLevel, 3)
  assert.equal(JSON.parse(storage.get('auth_vip')).vipLevel, 3)
})

await test('clear invalidates pending VIP and login status results', async () => {
  const { auth, ncm, storage } = createAuth()
  auth.setUser(accountA, 'account')
  const oldVip = deferred()
  const oldStatus = deferred()
  ncm.vipInfoV2 = () => oldVip.promise
  ncm.loginStatus = () => oldStatus.promise
  const refresh = auth.refreshVipInfo()
  const check = auth.checkLoginStatus()
  auth.clear()
  oldVip.resolve({ code: 200, data: { vipType: 1, vipLevel: 9 } })
  oldStatus.resolve({ code: 301 })
  await Promise.all([refresh, check])
  assert.equal(auth.user, null)
  assert.equal(auth.vipInfo, null)
  assert.equal(auth.cookieOk, true)
  assert.equal(storage.has('auth_vip'), false)
  assert.equal(storage.has('auth_user'), false)
})

await test('an old initialization cannot trigger VIP refresh for a new login', async () => {
  const { auth, ncm } = createAuth({ auth_user: accountA, auth_mode: 'account' })
  const oldStatus = deferred()
  let vipCalls = 0
  ncm.loginStatus = () => oldStatus.promise
  ncm.vipInfoV2 = async () => { vipCalls++; return { code: 200 } }
  auth.init()
  auth.setUser(accountB, 'account')
  oldStatus.resolve({ code: 200 })
  await oldStatus.promise
  await Promise.resolve()
  assert.equal(auth.user.userId, 2)
  assert.equal(vipCalls, 0)
})

await test('initialization versions distinguish repeated restoration of the same account', async () => {
  const { auth, ncm } = createAuth({ auth_user: accountA, auth_mode: 'account' })
  const firstStatus = deferred()
  const secondStatus = deferred()
  let calls = 0
  ncm.loginStatus = () => ++calls === 1 ? firstStatus.promise : secondStatus.promise
  auth.init()
  auth.init()
  firstStatus.resolve({ code: 301 })
  await firstStatus.promise
  await Promise.resolve()
  assert.equal(auth.cookieOk, true)
  secondStatus.resolve({ code: 301 })
  await secondStatus.promise
  await Promise.resolve()
  assert.equal(auth.cookieOk, false)
})

await test('late logout cannot clear a newer login or its cookie', async () => {
  const runtime = createAuth()
  const { auth, ncm, storage } = runtime
  auth.setUser(accountA, 'account')
  const oldLogout = deferred()
  ncm.logout = () => oldLogout.promise
  const logout = auth.logout()
  auth.setUser(accountB, 'account')
  await auth.refreshVipInfo()
  oldLogout.resolve()
  await logout
  assert.equal(auth.user.userId, 2)
  assert.equal(storage.has('auth_user'), true)
  assert.equal(storage.has('auth_vip'), true)
  assert.equal(runtime.cookieClears, 0)
})

await test('logout still clears the active session when its request fails', async () => {
  const runtime = createAuth()
  const { auth, ncm, storage } = runtime
  auth.setUser(accountA, 'account')
  await auth.refreshVipInfo()
  ncm.logout = async () => { throw new Error('offline') }
  await auth.logout()
  assert.equal(auth.isLoggedIn, false)
  assert.equal(auth.vipInfo, null)
  assert.equal(storage.has('auth_user'), false)
  assert.equal(storage.has('auth_vip'), false)
  assert.equal(runtime.cookieClears, 1)
})

await test('current session valid, expired, unknown and failed checks preserve their behavior', async () => {
  const { auth, ncm } = createAuth()
  auth.setUser(accountA, 'account')
  ncm.loginStatus = async () => ({ code: 301 })
  assert.equal(await auth.checkLoginStatus(), false)
  ncm.loginStatus = async () => ({ code: 502 })
  assert.equal(await auth.checkLoginStatus(), false)
  ncm.loginStatus = async () => { throw new Error('offline') }
  assert.equal(await auth.checkLoginStatus(), false)
  ncm.loginStatus = async () => ({ code: 200 })
  assert.equal(await auth.checkLoginStatus(), true)
  assert.equal(auth.cookieOk, true)
})

await test('startup QR login preserves an in-flight first song and only replaces the cookie after authorization', async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const originalState = Object.getOwnPropertyDescriptor(globalThis, '$state')
  const originalFetch = globalThis.fetch
  const storage = new Map([
    ['api_cookie', 'MUSIC_U=saved-account'], ['auth_mode', 'account'],
    ['auth_user', JSON.stringify(accountA)],
  ])
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  } })
  Object.defineProperty(globalThis, '$state', { configurable: true, value: value => value })
  const { apiSession } = await import('../api/session.ts')
  const { auth: realAuth } = await import('../stores/auth.svelte.ts')
  const { getPlayableUrls } = await import('../player/url-resolver.ts')
  const { dbCache } = await import('../db/cache.ts')
  const originalUrlSet = dbCache.urlSetEntry
  dbCache.urlSetEntry = async () => null
  const status = deferred(), audio = deferred(), audioStarted = deferred()
  const qrRequests = []
  let loginChecks = 0
  try {
    globalThis.fetch = async (url, options) => {
      const endpoint = new URL(url).pathname
      let data
      if (endpoint === '/login/status') data = ++loginChecks === 1 ? await status.promise : { code: 200, profile: accountB, account: { id: 2 } }
      else if (endpoint === '/song/url/v1') { audioStarted.resolve(); data = await audio.promise }
      else if (endpoint === '/login/qr/key') data = { code: 200, cookie: 'MUSIC_U=ignore-qr-response', data: { unikey: 'key' } }
      else if (endpoint === '/login/qr/create') data = { code: 200, data: { qrurl: 'https://example.invalid/qr' } }
      else if (endpoint === '/login/qr/check') data = { code: 803, cookie: 'MUSIC_U=authorized-account; Path=/; HttpOnly' }
      else if (endpoint === '/vip/info/v2') data = { code: 200, data: { vipType: 0 } }
      else throw new Error(`Unexpected test endpoint: ${endpoint}`)
      if (endpoint.startsWith('/login/qr/')) qrRequests.push({ url: new URL(url), credentials: options.credentials })
      return { ok: true, status: 200, json: async () => data }
    }
    realAuth.init()
    const originalCookie = apiSession.getCookie()
    const originalVersion = apiSession.getVersion()
    const resolution = getPlayableUrls(9001, 'standard', new Map(), 1, {}, undefined, true)
    await audioStarted.promise
    status.resolve({ code: 301 })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(realAuth.cookieOk, false)
    await realAuth.getQrCode()
    audio.resolve({ code: 200, data: [{ url: 'https://audio.invalid/first-song.mp3', level: 'standard' }] })
    const result = await resolution
    assert.equal(apiSession.getCookie(), originalCookie, 'opening QR must preserve the existing cookie')
    assert.equal(apiSession.getVersion(), originalVersion, 'opening QR must not invalidate current playback requests')
    assert.deepEqual(result.urls, ['https://audio.invalid/first-song.mp3'])

    const cookie = await realAuth.startQrPolling('key').promise
    assert.equal(cookie, 'MUSIC_U=authorized-account')
    assert.equal(apiSession.getCookie(), 'MUSIC_U=authorized-account; os=pc')
    assert.ok(apiSession.getVersion() > originalVersion, 'successful authorization must still change the API session')
    await realAuth.qrLogin(cookie)
    assert.equal(realAuth.user.userId, 2)
    assert.equal(realAuth.cookieOk, true)
    assert.equal(qrRequests.length, 3)
    for (const request of qrRequests) {
      assert.equal(request.url.searchParams.has('cookie'), false, 'QR endpoints must not receive the saved cookie')
      assert.equal(request.credentials, 'omit')
    }
  } finally {
    audio.resolve({ code: 200, data: [] })
    status.resolve({ code: 301 })
    dbCache.urlSetEntry = originalUrlSet
    globalThis.fetch = originalFetch
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else delete globalThis.localStorage
    if (originalState) Object.defineProperty(globalThis, '$state', originalState)
    else delete globalThis.$state
  }
})

console.log(`\n${passed} auth session race scenarios passed`)
