import assert from 'node:assert/strict'
import type { MusicProvider } from '../music/provider.ts'
import type { PlayStream, SongId, StreamOptions } from '../types/music.ts'
import type { SongUrlCacheEntry } from '../db/cache.ts'

const storage = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, String(value)) },
  removeItem: (key: string) => { storage.delete(key) },
} as unknown as Storage
Object.defineProperty(globalThis, '$state', { configurable: true, value: <T>(value: T) => value })

const { dbCache, getUrlCacheContext, attachUrlCacheMetadata } = await import('../db/cache.ts')
const { apiSession } = await import('../api/session.ts')
const { musicProviders, setActiveMusicProvider } = await import('../music/service.ts')
const { createNeteaseProvider } = await import('../music/providers/netease.ts')
const { getPlayableUrls, refreshSongUrlsBg } = await import('./url-resolver.ts')
const { createPrefetchManager } = await import('./prefetch.ts')
const { PLAYBACK } = await import('../utils/constants.ts')

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function setStream(getStream: MusicProvider['getStream']): void {
  musicProviders.register({
    ...createNeteaseProvider(), getStream,
    getMatchedStream: async () => ({ url: '' }),
    getLegacyStream: async () => ({ url: '' }),
  }, { replace: true })
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

apiSession.setCookie('MUSIC_U=account-a-secret')
await dbCache.urlSet(801, ['https://cdn.example/account-a.mp3'])
apiSession.setCookie('MUSIC_U=account-b-secret')
assert.equal(await dbCache.urlGet(801), null, 'URL from another account must not be reused')

apiSession.setBase('https://backend-a.example')
await dbCache.urlSet(802, ['https://cdn.example/backend-a.mp3'])
apiSession.setBase('https://backend-b.example')
assert.equal(await dbCache.urlGet(802), null, 'URL from another backend must not be reused')
await dbCache.urlSet(803, ['https://cdn.example/netease.mp3'])
musicProviders.register({ id: 'other', name: 'Other', search: async () => ({}) })
setActiveMusicProvider('other')
assert.equal(await dbCache.urlGet(803), null, 'same song ID in another provider must not share URLs')
setActiveMusicProvider('netease')
assert.deepEqual(await dbCache.urlGet(803), ['https://cdn.example/netease.mp3'], 'matching context may reuse its record')
assert.equal([...storage.values()].filter(value => value.includes('namespace')).some(value => value.includes('account-b-secret')), false, 'URL cache must not contain the raw credential')

storage.set('db_fallback_url_804', JSON.stringify(['https://cdn.example/legacy.mp3']))
storage.set('db_fallback_url_805', JSON.stringify({ urls: ['https://cdn.example/legacy.mp3'], expiresAt: Date.now() + 10000 }))
assert.equal(await dbCache.urlGet(804), null, 'legacy array has no trustworthy context')
assert.equal(await dbCache.urlGet(805), null, 'legacy URL record has no trustworthy context')
assert.equal(storage.has('db_fallback_url_804'), true, 'ignore legacy records without clearing existing data')

const staleContext = await getUrlCacheContext()
apiSession.setCookie('MUSIC_U=account-b-secret')
assert.equal(staleContext.isCurrent(), false, 'explicit relogin invalidates in-flight context even for the same credential')
assert.equal(await dbCache.urlSetEntry(806, [{ url: 'https://cdn.example/stale.mp3' }], { context: staleContext }), null)

{
  const levels: string[] = []
  setStream(async (_id, { level = 'standard' } = {}) => {
    levels.push(level)
    return { url: `https://cdn.example/${level}.mp3`, level, source: 'official', cacheable: true }
  })
  await dbCache.urlSetEntry(810, [{ url: 'https://cdn.example/lossless.mp3', level: 'lossless', source: 'official' }])
  await refreshSongUrlsBg(810, 'lossless')
  await settle()
  assert.deepEqual(levels, ['lossless'], 'background refresh requests the preferred quality first')
  const cached = await dbCache.urlGetEntry(810)
  assert.equal(cached?.candidates[0]?.level, 'lossless')
  assert.equal(cached?.candidates[0]?.source, 'official')
  assert.ok(cached!.expiresAt > Date.now())
  const result = await getPlayableUrls(810, 'lossless', new Map(), 1)
  assert.equal(result.firstUrlLevel, 'lossless', 'cache hit must preserve the actual quality')
  await settle()
}

{
  setStream(async () => ({ url: 'https://cdn.example/downgraded.mp3', level: 'standard', cacheable: true }))
  await dbCache.urlSetEntry(812, [{ url: 'https://cdn.example/existing-lossless.mp3', level: 'lossless', source: 'official' }])
  await refreshSongUrlsBg(812, 'lossless')
  await settle()
  assert.deepEqual(await dbCache.urlGet(812), ['https://cdn.example/existing-lossless.mp3'], 'refresh downgrade must retain a valid higher-quality entry')
}

{
  const context = await getUrlCacheContext()
  await Promise.all([
    dbCache.urlSetEntry(813, [{ url: 'https://cdn.example/concurrent-lossless.mp3', level: 'lossless' }], { context, preserveHigherQuality: true }),
    dbCache.urlSetEntry(813, [{ url: 'https://cdn.example/concurrent-standard.mp3', level: 'standard' }], { context, preserveHigherQuality: true }),
  ])
  assert.equal((await dbCache.urlGetEntry(813))?.candidates[0]?.level, 'lossless', 'concurrent background writes must not downgrade the cache')
}

{
  const levels: string[] = []
  setStream(async (_id, { level = 'standard' } = {}) => {
    levels.push(level)
    return { url: `https://cdn.example/fresh-${level}.mp3`, level, cacheable: true }
  })
  const normal = await getPlayableUrls(814, 'lossless', new Map(), 1)
  assert.deepEqual(levels, ['standard'], 'uncached normal playback retains fast-start strategy')
  assert.equal(normal.firstUrlLevel, 'standard')
  const forced = await getPlayableUrls(814, 'lossless', new Map(), 2, {}, undefined, true)
  await settle()
  assert.equal(forced.firstUrlLevel, 'lossless', 'manual quality change requests target quality')
  assert.equal((await dbCache.urlGetEntry(814))?.candidates[0]?.level, 'lossless')
}

{
  const pending = deferred<PlayStream>()
  const started = deferred<void>()
  setStream(async () => { started.resolve(); return pending.promise })
  const task = getPlayableUrls(816, 'standard', new Map(), 1)
  await started.promise
  apiSession.setCookie('MUSIC_U=account-c-secret')
  pending.resolve({ url: 'https://cdn.example/old-account.mp3', level: 'standard', cacheable: true })
  assert.deepEqual((await task).urls, [], 'old account resolution must not publish URLs')
  assert.equal(await dbCache.urlGet(816), null, 'old account response must not cache into the new account')
}

{
  setStream(async () => {
    apiSession.saveCookieFromResponse({ cookie: 'MUSIC_U=automatically-rotated-secret' })
    return { url: 'https://cdn.example/rotated-session.mp3', level: 'standard', cacheable: true }
  })
  const result = await getPlayableUrls(817, 'standard', new Map(), 1)
  assert.deepEqual(result.urls, ['https://cdn.example/rotated-session.mp3'], 'legitimate automatic token rotation must permit its playback response')
  await settle()
  assert.equal(await dbCache.urlGet(817), null, 'response may only cache under its original credential namespace')
}

for (const kind of ['stream', 'match', 'legacy']) {
  const controller = new AbortController()
  const started = deferred<void>()
  let observedSignal: AbortSignal | undefined
  const pending = (signal?: AbortSignal): Promise<PlayStream> => {
    observedSignal = signal
    started.resolve()
    return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
  }
  musicProviders.register({
    ...createNeteaseProvider(),
    getStream: async (_id: SongId, options?: StreamOptions) => kind === 'stream' ? pending(options?.signal) : { url: '' },
    getMatchedStream: async (_id: SongId, signal?: AbortSignal) => kind === 'match' ? pending(signal) : { url: '' },
    getLegacyStream: async (_id: SongId, _bitrate?: number, signal?: AbortSignal) => kind === 'legacy' ? pending(signal) : { url: '' },
  }, { replace: true })
  const task = getPlayableUrls(820, 'standard', new Map(), 1, {}, controller.signal)
  await started.promise
  controller.abort()
  assert.deepEqual((await task).urls, [])
  assert.equal(observedSignal?.aborted, true, `${kind} transport must receive the actual cancellation`)
}

{
  const originalTimeout = PLAYBACK.FAST_TIMEOUT
  const signals: AbortSignal[] = []
  PLAYBACK.FAST_TIMEOUT = 5
  try {
    setStream(async (_id, { signal } = {}) => new Promise((_, reject) => {
      signals.push(signal!)
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    await getPlayableUrls(821, 'standard', new Map(), 1)
    assert.ok(signals.length > 0)
    assert.equal(signals.every(signal => signal.aborted), true, 'URL timeouts must abort outstanding transport requests')
  } finally {
    PLAYBACK.FAST_TIMEOUT = originalTimeout
  }
}

{
  const manager = createPrefetchManager()
  const queue = [{ id: 829 }, { id: 830 }]
  const loaded: string[] = []
  setStream(async (_id, { level } = {}) => ({ url: `${apiSession.getBase()}/song.mp3`, level, cacheable: true }))
  await manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
  apiSession.setBase('https://backend-c.example')
  await manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
  assert.deepEqual(loaded, ['https://backend-b.example/song.mp3', 'https://backend-c.example/song.mp3'], 'memory prefetch must reject an older backend namespace')
  const resolved = await getPlayableUrls(830, 'standard', manager.cache, 1)
  assert.equal(resolved.firstUrlLevel, 'standard', 'prefetch hit must report actual quality')
  assert.deepEqual(resolved.urls, ['https://backend-c.example/song.mp3'])
}

{
  const manager = createPrefetchManager()
  const queue = [{ id: 839 }, { id: 840 }]
  const started = deferred<void>()
  let oldSignal: AbortSignal | undefined
  let calls = 0
  const loaded: string[] = []
  setStream(async (_id, { signal } = {}) => {
    if (++calls === 1) {
      oldSignal = signal
      started.resolve()
      return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
    }
    return { url: 'https://cdn.example/new-prefetch.mp3', level: 'higher', cacheable: true }
  })
  const oldTask = manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
  await started.promise
  await manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
  await oldTask
  assert.equal(oldSignal?.aborted, true, 'superseding prefetch must abort its old stream request')
  assert.deepEqual(loaded, ['https://cdn.example/new-prefetch.mp3'])
}

for (const cancellation of ['stale', 'abort', 'superseded']) {
  const manager = createPrefetchManager()
  const controller = new AbortController()
  const started = deferred<void>()
  const pending = deferred<SongUrlCacheEntry | null>()
  const originalUrlGetEntry = dbCache.urlGetEntry
  const id = 860 + ['stale', 'abort', 'superseded'].indexOf(cancellation)
  const loaded: string[] = []
  let stale = false
  let reads = 0
  dbCache.urlGetEntry = async (songId, context) => {
    if (songId === id && ++reads === 2) {
      started.resolve()
      return pending.promise
    }
    return originalUrlGetEntry(songId, context)
  }
  setStream(async () => ({ url: `https://cdn.example/${cancellation}.mp3`, level: 'standard', cacheable: true }))
  try {
    const task = manager.prefetchNextTrackUrl({
      queue: [{ id: id - 1 }, { id }], queueIndex: 0,
      signal: controller.signal, isStale: () => stale, preload: url => loaded.push(url),
    })
    await started.promise
    if (cancellation === 'stale') stale = true
    else if (cancellation === 'abort') controller.abort()
    else await manager.prefetchNextTrackUrl({ queue: [], queueIndex: -1 })
    pending.resolve(null)
    await task
    assert.equal(await originalUrlGetEntry(id), null, `${cancellation} prefetch must not persist after waiting for the existing cache`)
    assert.equal(storage.has(`db_fallback_url_${id}`), false)
    assert.equal(manager.cache.size, 0)
    assert.deepEqual(loaded, [])
  } finally {
    pending.resolve(null)
    dbCache.urlGetEntry = originalUrlGetEntry
  }
}

for (const cryptoValue of [undefined, { subtle: { digest: async () => { throw new Error('crypto unavailable') } } }]) {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: cryptoValue })
  try {
    let calls = 0
    setStream(async () => { calls++; return { url: 'https://cdn.example/without-web-crypto.mp3', level: 'standard', cacheable: true } })
    const manager = createPrefetchManager()
    await manager.prefetchNextTrackUrl({ queue: [{ id: 849 }, { id: 850 }], queueIndex: 0 })
    assert.equal(calls, 0, 'missing namespace disables prefetch rather than creating shared anonymous entries')
    assert.equal(manager.cache.size, 0)
    const oldUrls = ['https://cdn.example/old-account-without-crypto.mp3']
    attachUrlCacheMetadata(oldUrls, { namespace: '', urls: oldUrls, candidates: [{ url: oldUrls[0]! }], expiresAt: Date.now() + 10000 })
    apiSession.setCookie('MUSIC_U=without-crypto-next-account')
    const result = await getPlayableUrls(850, 'standard', new Map([[850, oldUrls]]), 1)
    assert.deepEqual(result.urls, ['https://cdn.example/without-web-crypto.mp3'], 'missing Web Crypto disables cache but permits playback')
    assert.equal(calls, 1, 'empty namespace memory entry must never be reused across accounts')
    assert.equal(await dbCache.urlGet(850), null)
    assert.equal(storage.has('db_fallback_url_850'), false, 'missing Web Crypto must not persist identity in plaintext')
  } finally {
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto)
  }
}

console.log('URL cache context, quality metadata, refresh and transport cancellation: passed')
