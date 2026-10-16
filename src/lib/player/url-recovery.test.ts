import assert from 'node:assert/strict'
import type { MusicProvider } from '../music/provider.ts'
import type { PlayStream } from '../types/music.ts'

const storage = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, String(value)) },
  removeItem: (key: string) => { storage.delete(key) },
} as unknown as Storage

const { dbCache, getUrlCacheContext } = await import('../db/cache.ts')
const { apiSession } = await import('../api/session.ts')
const { musicProviders } = await import('../music/service.ts')
const { createNeteaseProvider } = await import('../music/providers/netease.ts')
const { fillFallbackUrls, getPlayableUrls, invalidatePlayableUrl } = await import('./url-resolver.ts')

function setStream(getStream: MusicProvider['getStream']): void {
  musicProviders.register({
    ...createNeteaseProvider(), getStream,
    getMatchedStream: async () => ({ url: '' }),
    getLegacyStream: async () => ({ url: '' }),
  }, { replace: true })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

{
  const badUrl = 'https://cdn.example/cached-before-fill.mp3'
  let calls = 0
  const notifications: string[][] = []
  setStream(async () => { calls++; return { url: 'https://cdn.example/refreshed-by-fill.mp3', level: 'standard', cacheable: true } })
  await dbCache.urlSetEntry(928, [{ url: badUrl, level: 'standard' }])
  const initial = await getPlayableUrls(928, 'standard', new Map(), 1)
  await settle()
  assert.deepEqual(initial.urls, [badUrl])
  assert.equal(calls, 0, 'cache hit must not launch a separate untracked refresh')
  await fillFallbackUrls(928, 1, {
    currentUrls: initial.urls, preferredLevel: 'standard', onUrls: urls => notifications.push(urls), isUrlFailed: url => url === badUrl,
  })
  await settle()
  assert.equal(notifications.flat().includes('https://cdn.example/refreshed-by-fill.mp3'), true, 'incremental fill supplies the fresh candidate for cached playback')
}

{
  const slow = deferred<PlayStream>()
  const slowStarted = deferred<void>()
  const notifications: string[][] = []
  let calls = 0
  setStream(async () => {
    if (++calls === 1) return { url: 'https://cdn.example/fresh-standard.mp3', level: 'standard', cacheable: true }
    if (calls === 2) { slowStarted.resolve(); return slow.promise }
    return { url: '' }
  })
  const task = fillFallbackUrls(930, 1, {
    currentUrls: ['https://cdn.example/dead-cached.mp3'], firstUrlLevel: 'standard', preferredLevel: 'standard', isPlaying: false,
    onUrls: urls => notifications.push(urls),
  })
  await slowStarted.promise
  assert.deepEqual(notifications, [['https://cdn.example/fresh-standard.mp3']], 'new URL must be delivered before the next slow request completes')
  slow.resolve({ url: '' })
  await task
  assert.equal(notifications.some(urls => urls.includes('https://cdn.example/dead-cached.mp3')), false, 'incremental notifications exclude input URLs')
}

{
  await dbCache.urlSetEntry(932, [
    { url: 'https://cdn.example/dead-lossless.mp3', level: 'lossless', source: 'official' },
    { url: 'https://cdn.example/working-higher.mp3', level: 'higher', source: 'official' },
  ])
  const before = await dbCache.urlGetEntry(932)
  await invalidatePlayableUrl(932, 'https://cdn.example/dead-lossless.mp3')
  const after = await dbCache.urlGetEntry(932)
  assert.deepEqual(after?.urls, ['https://cdn.example/working-higher.mp3'])
  assert.equal(after?.expiresAt, before?.expiresAt, 'invalidating one URL must preserve the other candidates and expiry')
}

{
  setStream(async () => ({ url: 'https://cdn.example/new-standard.mp3', level: 'standard', cacheable: true }))
  await dbCache.urlSetEntry(934, [{ url: 'https://cdn.example/dead-lossless.mp3', level: 'lossless', source: 'official' }])
  assert.deepEqual((await getPlayableUrls(934, 'lossless', new Map(), 1)).urls, ['https://cdn.example/dead-lossless.mp3'])
  await settle()
  await invalidatePlayableUrl(934, 'https://cdn.example/dead-lossless.mp3')
  const recovered = await getPlayableUrls(934, 'lossless', new Map(), 2)
  await settle()
  assert.deepEqual(recovered.urls, ['https://cdn.example/new-standard.mp3'], 'invalidated cache must resolve a fresh URL')
  assert.equal((await dbCache.urlGetEntry(934))?.candidates[0]?.level, 'standard', 'dead lossless record must not block fresh lower-quality caching')
}

{
  await dbCache.urlSetEntry(936, [{ url: 'https://cdn.example/other-backend.mp3', level: 'standard' }])
  const originalBase = apiSession.getBase()
  apiSession.setBase('https://other-backend.example')
  await invalidatePlayableUrl(936, 'https://cdn.example/other-backend.mp3')
  apiSession.setBase(originalBase)
  assert.deepEqual(await dbCache.urlGet(936), ['https://cdn.example/other-backend.mp3'], 'invalidation must not change another namespace')
}

{
  const controller = new AbortController()
  const pending = deferred<PlayStream>()
  const started = deferred<void>()
  let notifications = 0
  setStream(async () => { started.resolve(); return pending.promise })
  const task = fillFallbackUrls(938, 1, { signal: controller.signal, onUrls: () => { notifications++ } })
  await started.promise
  controller.abort()
  pending.resolve({ url: 'https://cdn.example/cancelled.mp3', level: 'standard', cacheable: true })
  await task
  await settle()
  assert.equal(notifications, 0, 'cancelled late response must not publish candidates')
  assert.equal(await dbCache.urlGet(938), null, 'cancelled late response must not write cache')
}

{
  const controller = new AbortController()
  let notifications = 0
  let calls = 0
  setStream(async () => { calls++; return { url: 'https://cdn.example/one-then-cancel.mp3', level: 'standard', cacheable: true } })
  await fillFallbackUrls(940, 1, { signal: controller.signal, onUrls: () => { notifications++; controller.abort() } })
  await settle()
  assert.equal(notifications, 1, 'cancellation after first delivery prevents later notifications')
  assert.equal(calls, 1, 'cancellation after first delivery stops subsequent resolution')
  assert.equal(await dbCache.urlGet(940), null, 'cancellation from an incremental callback prevents cache writes')
}

{
  const badUrl = 'https://cdn.example/late-dead-lossless.mp3'
  const failedUrls = new Set<string>()
  const pending = deferred<PlayStream>()
  const started = deferred<void>()
  const notifications: string[][] = []
  let calls = 0
  setStream(async () => {
    if (++calls === 1) { started.resolve(); return pending.promise }
    return { url: 'https://cdn.example/fresh-after-failure.mp3', level: 'standard', cacheable: true }
  })
  await dbCache.urlSetEntry(942, [{ url: badUrl, level: 'lossless', cacheable: true }])
  const task = fillFallbackUrls(942, 1, {
    preferredLevel: 'standard', onUrls: urls => notifications.push(urls), isUrlFailed: url => failedUrls.has(url),
  })
  await started.promise
  failedUrls.add(badUrl)
  await invalidatePlayableUrl(942, badUrl)
  pending.resolve({ url: badUrl, level: 'lossless', cacheable: true })
  const filled = await task
  await settle()
  assert.equal(notifications.flat().includes(badUrl), false, 'late failed URL must not be published after invalidation')
  assert.equal(filled.includes(badUrl), false, 'late failed URL must not return in the completed chain')
  assert.equal((await dbCache.urlGet(942))?.includes(badUrl), false, 'late fill must not resurrect an invalidated URL')
  assert.equal((await getPlayableUrls(942, 'standard', new Map(), 2)).urls.includes(badUrl), false, 'next playback must not reuse the invalidated URL')
  await settle()
}

{
  const originalUrlGetEntry = dbCache.urlGetEntry
  const context = await getUrlCacheContext()
  const readStarted = deferred<void>()
  const releaseRead = deferred<void>()
  const failedUrls = new Set<string>()
  const badUrl = 'https://cdn.example/failed-while-waiting.mp3'
  let active = true
  dbCache.urlGetEntry = async (id, readContext) => {
    if (id === 944) { readStarted.resolve(); await releaseRead.promise }
    return originalUrlGetEntry(id, readContext)
  }
  try {
    const first = dbCache.urlSetEntry(944, [{ url: 'https://cdn.example/keep-working.mp3', level: 'standard' }], { context, preserveHigherQuality: true })
    await readStarted.promise
    const failedWrite = dbCache.urlSetEntry(944, [{ url: badUrl, level: 'lossless' }], { context, isUrlFailed: url => failedUrls.has(url) })
    const cancelledWrite = dbCache.urlSetEntry(944, [{ url: 'https://cdn.example/cancelled-while-waiting.mp3' }], { context, isActive: () => active })
    failedUrls.add(badUrl)
    active = false
    releaseRead.resolve()
    await Promise.all([first, failedWrite, cancelledWrite])
  } finally {
    dbCache.urlGetEntry = originalUrlGetEntry
  }
  assert.deepEqual(await dbCache.urlGet(944), ['https://cdn.example/keep-working.mp3'], 'queued writes must recheck failure and cancellation predicates inside the write lock')
}

console.log('URL recovery: bad-cache invalidation, incremental candidates, cancellation and late write protection passed')
