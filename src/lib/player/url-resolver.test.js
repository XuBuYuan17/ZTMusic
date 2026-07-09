/**
 * URL resolver self-check.
 * Run: node src/lib/player/url-resolver.test.js
 */

import { ncm } from '../api/client.js'
import { dbCache } from '../db/cache.js'
import { FALLBACK_URL_TEMPLATE } from '../utils/constants.js'
import { fillFallbackUrls, getPlayableUrls } from './url-resolver.js'

let passed = 0
let failed = 0

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++
  } else {
    console.error(`FAIL: ${message} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson === expectedJson) {
    passed++
  } else {
    console.error(`FAIL: ${message} - expected ${expectedJson}, got ${actualJson}`)
    failed++
  }
}

const original = {
  songUrl: ncm.songUrl,
  songUrlOld: ncm.songUrlOld,
  songUrlMatch: ncm.songUrlMatch,
  urlGet: dbCache.urlGet,
  urlSet: dbCache.urlSet,
}

function restore() {
  ncm.songUrl = original.songUrl
  ncm.songUrlOld = original.songUrlOld
  ncm.songUrlMatch = original.songUrlMatch
  dbCache.urlGet = original.urlGet
  dbCache.urlSet = original.urlSet
}

async function runTest(fn) {
  restore()
  await fn()
  restore()
}

await runTest(async () => {
  const calls = []
  dbCache.urlGet = async () => null
  dbCache.urlSet = async () => {}
  ncm.songUrl = async (id, level, unblock) => {
    calls.push({ id, level, unblock })
    return { data: [{ url: level === 'standard' ? 'http://m10.music.126.net/song.mp3' : '' }] }
  }

  const result = await getPlayableUrls(42, 'lossless', new Map(), 1)

  assertDeepEqual(result.urls, ['https://m10.music.126.net/song.mp3'], 'normalizes first official playable URL to https')
  assertEqual(result.firstUrlLevel, 'standard', 'records first successful fast level')
  assertEqual(calls.length, 1, 'stops fast tier loop after first non-trial URL')
})

await runTest(async () => {
  dbCache.urlGet = async () => null
  dbCache.urlSet = async () => { throw new Error('should not cache fallback') }
  ncm.songUrl = async () => ({ data: [{ url: '' }] })
  ncm.songUrlMatch = async () => ({ data: [{ url: '' }] })
  ncm.songUrlOld = async () => ({ data: [{ url: '' }] })

  const result = await getPlayableUrls(77, 'lossless', new Map(), 1)

  assertDeepEqual(result.urls, [FALLBACK_URL_TEMPLATE(77)], 'uses official fallback when API returns no URL')
  assertEqual(result.firstUrlLevel, '', 'leaves firstUrlLevel empty for official fallback')
})

await runTest(async () => {
  let matchCalls = 0
  let cachedUrls = null
  dbCache.urlGet = async () => null
  dbCache.urlSet = async (id, urls) => { cachedUrls = urls }
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
  dbCache.urlGet = async () => null
  dbCache.urlSet = async () => {}
  ncm.songUrl = async () => ({ data: [{ url: 'https://cdn.example/trial.mp3', freeTrialInfo: { start: 0, end: 30 } }] })
  ncm.songUrlMatch = async () => ({ data: [{ url: 'https://cdn.example/matched-full.mp3' }] })
  ncm.songUrlOld = async () => { throw new Error('should not use old API when match succeeds') }

  const result = await getPlayableUrls(79, 'lossless', new Map(), 1)

  assertDeepEqual(result.urls, ['https://cdn.example/matched-full.mp3'], 'prefers match fallback over trial clip')
  assertEqual(result.isTrial, false, 'does not mark matched fallback as trial')
})

await runTest(async () => {
  let cachedUrls = null
  dbCache.urlGet = async () => null
  dbCache.urlSet = async (id, urls) => { cachedUrls = urls }
  ncm.songUrl = async () => ({ data: [{ url: '' }] })
  ncm.songUrlMatch = async () => ({ data: [{ url: '' }] })
  ncm.songUrlOld = async () => ({ data: [{ url: 'https://cdn.example/old-only.mp3' }] })

  const result = await getPlayableUrls(80, 'lossless', new Map(), 1)

  assertDeepEqual(result.urls, ['https://cdn.example/old-only.mp3'], 'uses old API when match is empty')
  assertEqual(cachedUrls, null, 'does not persist old API fallback URLs')
})

await runTest(async () => {
  let cachedUrls = null
  dbCache.urlGet = async () => null
  dbCache.urlSet = async (id, urls) => { cachedUrls = urls }
  ncm.songUrl = async () => ({ data: [{ url: 'https://cdn.example/trial-only.mp3', freeTrialInfo: { start: 0, end: 30 } }] })
  ncm.songUrlMatch = async () => ({ data: [{ url: '' }] })
  ncm.songUrlOld = async () => ({ data: [{ url: '' }] })

  const result = await getPlayableUrls(81, 'lossless', new Map(), 1)

  assertDeepEqual(result.urls, ['https://cdn.example/trial-only.mp3'], 'uses trial clip only after match and old API fail')
  assertEqual(result.isTrial, true, 'marks trial-only result as trial')
  assertEqual(cachedUrls, null, 'does not persist trial-only URLs')
})

await runTest(async () => {
  dbCache.urlGet = async () => null
  dbCache.urlSet = async () => {}
  ncm.songUrl = async (id, level, unblock) => ({
    data: [{ url: unblock ? `https://cdn.example/${level}-unblock.mp3` : '' }],
  })

  const result = await getPlayableUrls(88, 'higher', new Map(), 1)

  assertDeepEqual(result.urls, ['https://cdn.example/standard-unblock.mp3'], 'tries unblock fast tiers after official fast tiers fail')
  assertEqual(result.firstUrlLevel, 'standard+unblock', 'marks unblock first level')
})

await runTest(async () => {
  const upgradeEvents = []
  ncm.songUrl = async (id, level, unblock) => {
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
  assertEqual(upgradeEvents[0].currentTime, 12, 'passes current playback position to upgrade event')
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

console.log(`\n${passed} passed, ${failed} failed${failed ? ' - FAIL' : ' - all good'}`)
process.exit(failed ? 1 : 0)