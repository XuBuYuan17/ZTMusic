/**
 * URL resolver self-check.
 * Run: node --experimental-strip-types src/lib/player/url-resolver.test.ts
 */

import { musicProviders } from '../music/service.ts'
import { createNeteaseProvider } from '../music/providers/netease.ts'
import type { MusicProvider } from '../music/provider.ts'
import { SOURCE_PLUGIN_STORAGE_KEY, createSourcePlugin } from './source-plugins.ts'
import { ncm } from '../api/client.ts'
import { dbCache, attachUrlCacheMetadata, getUrlCacheContext } from '../db/cache.ts'
import { FALLBACK_URL_TEMPLATE } from '../utils/constants.ts'
import { fillFallbackUrls, getPlayableUrls, refreshSongUrlsBg, type QualityUpgradeEvent } from './url-resolver.ts'

let passed = 0
let failed = 0

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual === expected) {
    passed++
  } else {
    console.error(`FAIL: ${message} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson === expectedJson) {
    passed++
  } else {
    console.error(`FAIL: ${message} - expected ${expectedJson}, got ${actualJson}`)
    failed++
  }
}

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) } })

const original = {
  fetch: globalThis.fetch,
  songUrl: ncm.songUrl,
  songUrlOld: ncm.songUrlOld,
  songUrlMatch: ncm.songUrlMatch,
  urlGetEntry: dbCache.urlGetEntry,
  urlSetEntry: dbCache.urlSetEntry,
}

function restore() {
  memory.delete(SOURCE_PLUGIN_STORAGE_KEY)
  globalThis.fetch = original.fetch
  musicProviders.register(createNeteaseProvider(), { replace: true })
  ncm.songUrl = original.songUrl
  ncm.songUrlOld = original.songUrlOld
  ncm.songUrlMatch = original.songUrlMatch
  dbCache.urlGetEntry = original.urlGetEntry
  dbCache.urlSetEntry = original.urlSetEntry
}

async function runTest(fn: () => Promise<void>) {
  restore()
  dbCache.urlSetEntry = async () => null
  await fn()
  restore()
}

await runTest(async () => {
  const calls: unknown[] = []
  dbCache.urlGetEntry = async () => null
  dbCache.urlSetEntry = async () => null
  ncm.songUrl = async (id, level, unblock) => {
    calls.push({ id, level, unblock })
    return { data: [{ url: level === 'standard' ? 'http://m10.music.126.net/song.mp3' : '', gain: -9, peak: 1 }] }
  }

  const result = await getPlayableUrls(42, 'lossless', new Map(), 1)

  assertDeepEqual(result.urls, ['https://m10.music.126.net/song.mp3'], 'normalizes first official playable URL to https')
  assertEqual(result.firstUrlLevel, 'standard', 'records first successful fast level')
  assertEqual(result.loudnessAttenuationDb, -9, 'network result keeps gain for the selected URL')
  assertEqual(calls.length, 1, 'stops fast tier loop after first non-trial URL')
})

await runTest(async () => {
  dbCache.urlGetEntry = async () => null
  dbCache.urlSetEntry = async () => { throw new Error('should not cache fallback') }
  ncm.songUrl = async () => ({ data: [{ url: '' }] })
  ncm.songUrlMatch = async () => ({ data: [{ url: '' }] })
  ncm.songUrlOld = async () => ({ data: [{ url: '' }] })

  const result = await getPlayableUrls(77, 'lossless', new Map(), 1)

  assertDeepEqual(result.urls, [FALLBACK_URL_TEMPLATE(77)], 'uses official fallback when API returns no URL')
  assertEqual(result.firstUrlLevel, '', 'leaves firstUrlLevel empty for official fallback')
})

await runTest(async () => {
  let networkCalls = 0
  const prefetchCache = new Map([[91, ['https://cdn.example/prefetched-91.mp3']]])
  const context = await getUrlCacheContext()
  attachUrlCacheMetadata(prefetchCache.get(91)!, {
    namespace: context.namespace, urls: prefetchCache.get(91)!, candidates: [{ url: prefetchCache.get(91)![0]!, level: 'standard', loudnessAttenuationDb: -7 }], expiresAt: Date.now() + 10000,
  })
  dbCache.urlGetEntry = async () => { throw new Error('prefetch hit should not read persistent cache') }
  dbCache.urlSetEntry = async () => null
  ncm.songUrl = async () => { networkCalls++; return { data: [{ url: '' }] } }

  const result = await getPlayableUrls(91, 'standard', prefetchCache, 1)

  assertDeepEqual(result.urls, ['https://cdn.example/prefetched-91.mp3'], 'uses and removes same-id prefetch cache only')
  assertEqual(result.loudnessAttenuationDb, -7, 'prefetched source retains its matching gain')
  assertEqual(prefetchCache.has(91), false, 'removes consumed prefetch cache entry')
  assertEqual(networkCalls, 0, 'does not fetch network when prefetch cache matches id')
})

await runTest(async () => {
  let matchCalls = 0
  let cachedUrls: string[] | null = null
  dbCache.urlGetEntry = async () => null
  dbCache.urlSetEntry = async (_id, urls) => { cachedUrls = urls.map(stream => stream.url); return null }
  ncm.songUrl = async () => ({ data: [{ url: '' }] })
  ncm.songUrlMatch = async () => {
    matchCalls++
    return { data: [{ url: 'http://m11.music.126.net/matched.mp3' }] }
  }
  ncm.songUrlOld = async () => { throw new Error('should not use old API when match succeeds') }

  const result = await getPlayableUrls(78, 'lossless', new Map(), 1)

  assertDeepEqual(result.urls, ['https://m11.music.126.net/matched.mp3'], 'uses song/url/match before old API and template fallback')
  assertEqual(result.firstUrlLevel, 'match', 'records match as first URL source')
  assertEqual(matchCalls, 1, 'calls song/url/match once after official attempts fail')
  assertDeepEqual(cachedUrls, ['https://m11.music.126.net/matched.mp3'], 'persists matched URLs in song URL cache')
})

await runTest(async () => {
  dbCache.urlGetEntry = async () => null
  dbCache.urlSetEntry = async () => null
  ncm.songUrl = async () => ({ data: [{ url: 'https://cdn.example/trial.mp3', freeTrialInfo: { start: 0, end: 30 } }] })
  ncm.songUrlMatch = async () => ({ data: [{ url: 'https://cdn.example/matched-full.mp3' }] })
  ncm.songUrlOld = async () => { throw new Error('should not use old API when match succeeds') }

  const result = await getPlayableUrls(79, 'lossless', new Map(), 1)

  assertDeepEqual(result.urls, ['https://cdn.example/matched-full.mp3'], 'prefers match fallback over trial clip')
  assertEqual(result.isTrial, false, 'does not mark matched fallback as trial')
})

await runTest(async () => {
  let cachedUrls: string[] | null = null
  dbCache.urlGetEntry = async () => null
  dbCache.urlSetEntry = async (_id, urls) => { cachedUrls = urls.map(stream => stream.url); return null }
  ncm.songUrl = async () => ({ data: [{ url: '' }] })
  ncm.songUrlMatch = async () => ({ data: [{ url: '' }] })
  ncm.songUrlOld = async () => ({ data: [{ url: 'https://cdn.example/old-only.mp3' }] })

  const result = await getPlayableUrls(80, 'lossless', new Map(), 1)

  assertDeepEqual(result.urls, ['https://cdn.example/old-only.mp3'], 'uses old API when match is empty')
  assertEqual(cachedUrls, null, 'does not persist old API fallback URLs')
})

await runTest(async () => {
  let cachedUrls: string[] | null = null
  dbCache.urlGetEntry = async () => null
  dbCache.urlSetEntry = async (_id, urls) => { cachedUrls = urls.map(stream => stream.url); return null }
  ncm.songUrl = async () => ({ data: [{ url: 'https://cdn.example/trial-only.mp3', freeTrialInfo: { start: 0, end: 30 } }] })
  ncm.songUrlMatch = async () => ({ data: [{ url: '' }] })
  ncm.songUrlOld = async () => ({ data: [{ url: '' }] })

  const result = await getPlayableUrls(81, 'lossless', new Map(), 1)

  assertDeepEqual(result.urls, ['https://cdn.example/trial-only.mp3'], 'uses trial clip only after match and old API fail')
  assertEqual(result.isTrial, true, 'marks trial-only result as trial')
  assertEqual(cachedUrls, null, 'does not persist trial-only URLs')
})

await runTest(async () => {
  dbCache.urlGetEntry = async () => null
  dbCache.urlSetEntry = async () => null
  ncm.songUrl = async (_id, level, unblock) => ({
    data: [{ url: unblock ? `https://cdn.example/${level}-unblock.mp3` : '' }],
  })

  const result = await getPlayableUrls(88, 'higher', new Map(), 1)

  assertDeepEqual(result.urls, ['https://cdn.example/standard-unblock.mp3'], 'tries unblock fast tiers after official fast tiers fail')
  assertEqual(result.firstUrlLevel, 'standard+unblock', 'marks unblock first level')
})

await runTest(async () => {
  let cacheReads = 0
  const prefetchCache = new Map([[93, ['https://cdn.example/prefetched-93.mp3']]])
  dbCache.urlGetEntry = async () => { cacheReads++; return null }
  dbCache.urlSetEntry = async () => null
  ncm.songUrl = async (_id, level) => ({ data: [{ url: level === 'lossless' ? 'https://cdn.example/lossless-93.mp3' : '' }] })

  const result = await getPlayableUrls(93, 'lossless', prefetchCache, 1, {}, undefined, true)

  assertDeepEqual(result.urls, ['https://cdn.example/lossless-93.mp3'], 'forceRefresh re-resolves at the requested level instead of serving cached URLs')
  assertEqual(cacheReads, 0, 'forceRefresh skips the persistent URL cache')
})

await runTest(async () => {
  const levels: string[] = []
  dbCache.urlSetEntry = async () => null
  ncm.songUrl = async (_id, level = 'standard') => {
    levels.push(level)
    return { data: [{ url: `https://cdn.example/${level}-94.mp3`, level }] }
  }

  const result = await getPlayableUrls(94, 'lossless', new Map(), 1, {}, undefined, true)

  assertDeepEqual(levels, ['lossless'], 'manual quality change requests preferred quality before an available standard stream')
  assertEqual(result.firstUrlLevel, 'lossless', 'manual quality change reports actual quality')
})

await runTest(async () => {
  const levels: string[] = []
  dbCache.urlSetEntry = async () => null
  ncm.songUrl = async (_id, level = 'standard') => {
    levels.push(level)
    return { data: [{ url: level === 'higher' ? 'https://cdn.example/higher-95.mp3' : '', level }] }
  }

  const result = await getPlayableUrls(95, 'exhigh', new Map(), 1, {}, undefined, true)

  assertDeepEqual(levels, ['exhigh', 'higher'], 'manual quality change falls back in descending quality without requesting a higher tier')
  assertEqual(result.firstUrlLevel, 'higher', 'quality downgrade reports the successful fallback tier')
})

await runTest(async () => {
  dbCache.urlSetEntry = async () => null
  ncm.songUrl = async () => ({ data: [{ url: 'https://cdn.example/downgraded-96.mp3', level: 'exhigh' }] })

  const result = await getPlayableUrls(96, 'lossless', new Map(), 1, {}, undefined, true)

  assertEqual(result.firstUrlLevel, 'exhigh', 'server downgrade is not mislabeled as requested lossless quality')
})

await runTest(async () => {
  const upgradeEvents: QualityUpgradeEvent[] = []
  ncm.songUrl = async (_id, level, unblock) => {
    if (unblock) return { data: [{ url: '' }] }
    if (level === 'lossless') return { data: [{ url: 'https://cdn.example/lossless.mp3' }] }
    if (level === 'higher') return { data: [{ url: 'https://cdn.example/higher.mp3' }] }
    return { data: [{ url: '' }] }
  }
  ncm.songUrlOld = async () => ({ data: [{ url: 'https://cdn.example/old.mp3' }] })
  ncm.songUrlMatch = async () => ({ data: [{ url: 'https://cdn.example/match.mp3' }] })

  const urls = await fillFallbackUrls(99, 1, {
    currentUrls: ['https://cdn.example/standard.mp3'],
    firstUrlLevel: 'standard',
    preferredLevel: 'higher',
    isPlaying: true,
    currentTime: 12,
    onQualityUpgrade: event => upgradeEvents.push(event),
  })

  assertDeepEqual(urls.slice(0, 3), [
    'https://cdn.example/higher.mp3',
    'https://cdn.example/standard.mp3',
    'https://cdn.example/lossless.mp3',
  ], 'prepends preferred better quality URL and keeps higher alternatives')
  assertEqual(upgradeEvents.length, 1, 'emits one quality upgrade event')
  assertEqual(upgradeEvents[0]!.currentTime, 12, 'passes current playback position to upgrade event')
})

await runTest(async () => {
  ncm.songUrl = async () => ({ data: [{ url: '' }] })
  ncm.songUrlMatch = async () => ({ data: [{ url: 'https://cdn.example/match-fill.mp3' }] })
  ncm.songUrlOld = async () => ({ data: [{ url: 'https://cdn.example/old-fill.mp3' }] })

  const urls = await fillFallbackUrls(100, 1, {
    currentUrls: [],
    firstUrlLevel: '',
    preferredLevel: 'standard',
  })

  assertDeepEqual(urls, [
    'https://cdn.example/match-fill.mp3',
    'https://cdn.example/old-fill.mp3',
    FALLBACK_URL_TEMPLATE(100),
  ], 'fills matched and old URLs before template fallback')
})


function setStream(getStream: MusicProvider['getStream']) {
  musicProviders.register({ ...createNeteaseProvider(), getStream }, { replace: true })
}

function enablePlugin() {
  createSourcePlugin({ name: 'Resolver', endpoint: 'https://resolver.example.test/resolve' })
}
function emptyOfficial() {
  ncm.songUrl = async () => ({ data: [{ url: '' }] })
  ncm.songUrlMatch = async () => ({ data: [{ url: '' }] })
  ncm.songUrlOld = async () => ({ data: [{ url: '' }] })
  dbCache.urlGetEntry = async () => null
}
await runTest(async () => {
  enablePlugin()
  let calls = 0
  globalThis.fetch = (async () => { calls++; return Response.json({ url: 'https://external.example/song' }) }) as typeof fetch
  dbCache.urlGetEntry = async () => null
  ncm.songUrl = async () => ({ data: [{ url: 'https://official.example/song' }] })
  await getPlayableUrls(200, 'standard', new Map(), 1)
  assertEqual(calls, 0, 'official foreground success never calls plugin')
})
await runTest(async () => {
  emptyOfficial()
  enablePlugin()
  let cached = 0
  dbCache.urlSetEntry = async () => { cached++; return null }
  ncm.songUrl = async () => ({ data: [{ url: 'https://official.example/trial', freeTrialInfo: { start: 0, end: 30 } }] })
  globalThis.fetch = (async () => Response.json({ url: 'https://external.example/full' })) as typeof fetch
  const result = await getPlayableUrls(201, 'standard', new Map(), 1)
  assertDeepEqual(result.urls, ['https://external.example/full'], 'plugin wins over trial and template URL')
  assertEqual(result.isTrial, false, 'plugin result is not a trial')
  assertEqual(cached, 0, 'foreground plugin URL is not cached')
  globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch
  const trial = await getPlayableUrls(201, 'standard', new Map(), 1)
  assertEqual(trial.isTrial, true, 'failed plugin falls through to trial')
  emptyOfficial()
  const fallback = await getPlayableUrls(201, 'standard', new Map(), 1)
  assertDeepEqual(fallback.urls, [FALLBACK_URL_TEMPLATE(201)], 'failed plugin falls through to template when no trial exists')
})
await runTest(async () => {
  emptyOfficial()
  enablePlugin()
  let cached: string[] = []
  dbCache.urlSetEntry = async (_id, urls) => { cached = urls.map(stream => stream.url); return null }
  setStream(async (_id, { unblock } = {}) => ({ url: unblock ? '' : 'https://official.example/full', level: 'standard', source: 'official', cacheable: true }))
  globalThis.fetch = (async () => Response.json({ urls: ['https://external.example/full', 'https://external.example/backup'] })) as typeof fetch
  const urls = await fillFallbackUrls(202, 1, { currentUrls: ['https://external.example/old'] })
  assertEqual(urls.includes('https://external.example/full'), true, 'two background candidates permit plugin supplementation')
  assertDeepEqual(cached, ['https://official.example/full'], 'background cache contains only fresh cacheable official URL')
})
await runTest(async () => {
  emptyOfficial()
  enablePlugin()
  let calls = 0
  let cached = 0
  globalThis.fetch = (async () => { calls++; return Response.json({ url: 'https://external.example/full' }) }) as typeof fetch
  dbCache.urlSetEntry = async () => { cached++; return null }
  await fillFallbackUrls(203, 1, { currentUrls: ['https://old.example/1', 'https://old.example/2', 'https://old.example/3'] })
  assertEqual(calls, 0, 'more than two background candidates skip plugins')
  assertEqual(cached, 0, 'incoming URLs with unknown provenance are never re-cached')
})
await runTest(async () => {
  emptyOfficial()
  let cached = 0
  dbCache.urlSetEntry = async () => { cached++; return null }
  setStream(async () => ({ url: 'https://official.example/uncacheable', source: 'official', level: 'standard', cacheable: false }))
  await fillFallbackUrls(204, 1)
  await refreshSongUrlsBg(204, 'standard')
  assertEqual(cached, 0, 'background fill and refresh respect cacheable false')
})
await runTest(async () => {
  emptyOfficial()
  let stale = false
  let cached = 0
  let calls = 0
  dbCache.urlSetEntry = async () => { cached++; return null }
  setStream(async () => { calls++; stale = true; return { url: 'https://official.example/stale', source: 'official', cacheable: true } })
  const urls = await fillFallbackUrls(205, 1, { currentUrls: ['https://old.example/song'], isStale: () => stale })
  assertDeepEqual(urls, ['https://old.example/song'], 'stale official result is not added to background candidates')
  assertEqual(cached, 0, 'stale background result does not write cache')
  assertEqual(calls, 1, 'stale background request stops further resolution')
})
await runTest(async () => {
  emptyOfficial()
  enablePlugin()
  let stale = false
  let cached = 0
  dbCache.urlSetEntry = async () => { cached++; return null }
  globalThis.fetch = (async () => { stale = true; return Response.json({ url: 'https://external.example/stale' }) }) as typeof fetch
  const urls = await fillFallbackUrls(206, 1, { isStale: () => stale })
  assertDeepEqual(urls, [], 'stale plugin result is discarded by background fill')
  assertEqual(cached, 0, 'stale plugin response does not write cache')
})
await runTest(async () => {
  emptyOfficial()
  const controller = new AbortController()
  let calls = 0
  let cached = 0
  dbCache.urlSetEntry = async () => { cached++; return null }
  setStream(async () => { calls++; controller.abort(); return { url: 'https://official.example/cancelled', source: 'official', cacheable: true } })
  const result = await getPlayableUrls(207, 'standard', new Map(), 1, {}, controller.signal)
  assertDeepEqual(result.urls, [], 'cancelled foreground result is discarded')
  assertEqual(calls, 1, 'cancelled foreground stops resolution')
  assertEqual(cached, 0, 'cancelled foreground does not cache')
  calls = 0
  await refreshSongUrlsBg(207, 'standard', controller.signal)
  assertEqual(calls, 0, 'already cancelled refresh never starts a request')
})
await runTest(async () => {
  emptyOfficial()
  const controller = new AbortController()
  let cached = 0
  dbCache.urlSetEntry = async () => { cached++; return null }
  setStream(async () => { controller.abort(); return { url: 'https://official.example/cancelled', source: 'official', cacheable: true } })
  await refreshSongUrlsBg(208, 'standard', controller.signal)
  assertEqual(cached, 0, 'cancelled refresh does not cache returned URL')
})

console.log(`\n${passed} passed, ${failed} failed${failed ? ' - FAIL' : ' - all good'}`)
process.exitCode = failed ? 1 : 0
