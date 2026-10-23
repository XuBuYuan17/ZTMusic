/**
 * Prefetch self-check. Run: node --experimental-strip-types src/lib/player/prefetch.test.ts
 */
import assert from 'node:assert/strict'
import type { MusicProvider } from '../music/provider.ts'
import type { PlayStream, SongId } from '../types/music.ts'
import type { SongUrlCacheEntry } from '../db/cache.ts'

Object.defineProperty(globalThis, '$state', { configurable: true, value: <T>(value: T) => value })

const { musicProviders } = await import('../music/service.ts')
const { createNeteaseProvider } = await import('../music/providers/netease.ts')
const { dbCache, getUrlCacheContext } = await import('../db/cache.ts')
const { createPrefetchManager } = await import('./prefetch.ts')
const { getPlayableUrls } = await import('./url-resolver.ts')

const originalUrlGet = dbCache.urlGetEntry
const originalUrlSet = dbCache.urlSetEntry
const queue = [{ id: 1 }, { id: 2 }]

function setStream(getStream: MusicProvider['getStream']): void {
  musicProviders.register({
    ...createNeteaseProvider(),
    getStream,
    getMatchedStream: async () => ({ url: '' }),
    getLegacyStream: async () => ({ url: '' }),
  }, { replace: true })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

async function cacheEntry(urls: string[]): Promise<SongUrlCacheEntry> {
  const context = await getUrlCacheContext()
  return { namespace: context.namespace, urls, candidates: urls.map(url => ({ url })), expiresAt: Date.now() + 10000 }
}

try {
  {
    const manager = createPrefetchManager()
    const levels: string[] = []
    const writes: string[][] = []
    const loaded: string[] = []
    dbCache.urlGetEntry = async () => null
    dbCache.urlSetEntry = async (_id, urls) => { writes.push(urls.map(stream => stream.url)); return null }
    setStream(async (_id, { level = 'standard' } = {}) => {
      levels.push(level)
      return level === 'standard'
        ? { url: 'https://cdn.example/trial.mp3', isTrial: true, cacheable: true }
        : { url: 'http://m10.music.126.net/full.mp3', cacheable: true }
    })

    await manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
    assert.deepEqual(levels, ['standard', 'higher'], 'trial candidate must not stop resolution')
    assert.deepEqual(manager.cache.get(2), ['https://m10.music.126.net/full.mp3'])
    assert.deepEqual(writes, [['https://m10.music.126.net/full.mp3']], 'only full stream may enter persistent cache')
    assert.deepEqual(loaded, ['https://m10.music.126.net/full.mp3'])
  }

  {
    const manager = createPrefetchManager()
    let writes = 0
    let loads = 0
    dbCache.urlGetEntry = async () => null
    dbCache.urlSetEntry = async () => { writes++; return null }
    setStream(async () => ({ url: 'https://cdn.example/trial.mp3', isTrial: true, cacheable: false }))

    await manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: () => { loads++ } })
    assert.equal(manager.cache.size, 0, 'trial-only prefetch must leave memory cache empty')
    assert.equal(writes, 0, 'trial-only prefetch must not write persistent cache')
    assert.equal(loads, 0, 'trial-only prefetch must not preload audio')
    const result = await getPlayableUrls(2, 'standard', manager.cache, 1)
    assert.equal(result.isTrial, true, 'foreground resolver must retain trial warning')
    assert.deepEqual(result.urls, ['https://cdn.example/trial.mp3'])
  }

  {
    const manager = createPrefetchManager()
    const levels: string[] = []
    const writes: string[][] = []
    const loaded: string[] = []
    dbCache.urlGetEntry = async () => null
    dbCache.urlSetEntry = async (_id, urls) => { writes.push(urls.map(stream => stream.url)); return null }
    setStream(async (_id, { level = 'standard' } = {}) => {
      levels.push(level)
      return { url: `https://cdn.example/${level}.mp3`, cacheable: level !== 'standard' }
    })

    await manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
    assert.deepEqual(levels, ['standard', 'higher'], 'uncacheable candidate must not stop resolution')
    assert.deepEqual(manager.cache.get(2), ['https://cdn.example/higher.mp3'])
    assert.deepEqual(writes, [['https://cdn.example/higher.mp3']])
    assert.deepEqual(loaded, ['https://cdn.example/higher.mp3'])
  }

  {
    const manager = createPrefetchManager()
    const pending = deferred<SongUrlCacheEntry | null>()
    const started = deferred<void>()
    let stale = false
    let loads = 0
    let streams = 0
    dbCache.urlGetEntry = () => { started.resolve(); return pending.promise }
    setStream(async () => { streams++; return { url: 'https://cdn.example/network.mp3' } })

    const task = manager.prefetchNextTrackUrl({ queue, queueIndex: 0, isStale: () => stale, preload: () => { loads++ } })
    await started.promise
    stale = true
    pending.resolve(await cacheEntry(['https://cdn.example/stale-cache.mp3']))
    await task
    assert.equal(manager.cache.size, 0, 'stale database result must not enter memory cache')
    assert.equal(loads, 0, 'stale database result must not preload audio')
    assert.equal(streams, 0, 'stale prefetch must not continue to network')
  }

  {
    const manager = createPrefetchManager()
    const oldCache = deferred<SongUrlCacheEntry | null>()
    const started = deferred<void>()
    const loaded: string[] = []
    let reads = 0
    dbCache.urlGetEntry = async () => {
      if (++reads === 1) { started.resolve(); return oldCache.promise }
      return cacheEntry(['https://cdn.example/new-cache.mp3'])
    }

    const oldTask = manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
    await started.promise
    await manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
    oldCache.resolve(await cacheEntry(['https://cdn.example/old-cache.mp3']))
    await oldTask
    assert.deepEqual(manager.cache.get(2), ['https://cdn.example/new-cache.mp3'], 'old cache read must not overwrite newer prefetch')
    assert.deepEqual(loaded, ['https://cdn.example/new-cache.mp3'])
  }

  {
    const manager = createPrefetchManager()
    let stale = false
    let writes = 0
    let loads = 0
    let streams = 0
    dbCache.urlGetEntry = async () => null
    dbCache.urlSetEntry = async () => { writes++; return null }
    setStream(async () => { streams++; stale = true; return { url: 'https://cdn.example/stale-network.mp3' } })

    await manager.prefetchNextTrackUrl({ queue, queueIndex: 0, isStale: () => stale, preload: () => { loads++ } })
    assert.equal(manager.cache.size, 0, 'stale network result must not enter memory cache')
    assert.equal(writes, 0, 'stale network result must not write persistent cache')
    assert.equal(loads, 0, 'stale network result must not preload audio')
    assert.equal(streams, 1, 'stale network response must stop remaining levels')
  }

  {
    const manager = createPrefetchManager()
    const oldStream = deferred<PlayStream>()
    const oldStarted = deferred<void>()
    const writes: { id: SongId; urls: string[] }[] = []
    const loaded: string[] = []
    let streams = 0
    dbCache.urlGetEntry = async () => null
    dbCache.urlSetEntry = async (id, urls) => { writes.push({ id, urls: urls.map(stream => stream.url) }); return null }
    setStream(async () => {
      if (++streams === 1) {
        oldStarted.resolve()
        return oldStream.promise
      }
      return { url: 'https://cdn.example/new-network.mp3', cacheable: true }
    })

    const oldTask = manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
    await oldStarted.promise
    await manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
    oldStream.resolve({ url: 'https://cdn.example/old-network.mp3', cacheable: true })
    await oldTask
    assert.deepEqual(manager.cache.get(2), ['https://cdn.example/new-network.mp3'], 'old stream response must not overwrite newer prefetch')
    assert.deepEqual(writes, [{ id: 2, urls: ['https://cdn.example/new-network.mp3'] }])
    assert.deepEqual(loaded, ['https://cdn.example/new-network.mp3'])
  }

  {
    const manager = createPrefetchManager()
    const loaded: string[] = []
    let reads = 0
    let streams = 0
    dbCache.urlGetEntry = async () => { reads++; return cacheEntry(['http://m10.music.126.net/cached.mp3']) }
    setStream(async () => { streams++; return { url: '' } })

    await manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
    await manager.prefetchNextTrackUrl({ queue, queueIndex: 0, preload: url => loaded.push(url) })
    assert.deepEqual(loaded, ['https://m10.music.126.net/cached.mp3', 'https://m10.music.126.net/cached.mp3'])
    assert.equal(reads, 1, 'memory hit must avoid repeated database lookup')
    assert.equal(streams, 0, 'cache hit must avoid network lookup')
  }
} finally {
  dbCache.urlGetEntry = originalUrlGet
  dbCache.urlSetEntry = originalUrlSet
  musicProviders.register(createNeteaseProvider(), { replace: true })
}

console.log('prefetch: trial/cache eligibility, stale responses, concurrent requests and cache hits passed')
