import { dbCache } from '../db/cache.js'

const MINUTE = 60 * 1000

const CACHE_TTL = {
  '/song/url/v1': 0,  // 音质 URL 不缓存，登录状态变化会影响可用性
  '/song/url': 0,
  '/lyric': 7 * 24 * 60 * MINUTE,
  '/lyric/new': 7 * 24 * 60 * MINUTE,
  '/song/detail': 24 * 60 * MINUTE,
  '/playlist/detail': 30 * MINUTE,
  '/playlist/track/all': 30 * MINUTE,
  '/album': 6 * 60 * MINUTE,
  '/artist/detail': 12 * 60 * MINUTE,
  '/artist/songs': 2 * 60 * MINUTE,
  '/artist/album': 12 * 60 * MINUTE,
  '/banner': 30 * MINUTE,
  '/personalized': 30 * MINUTE,
  '/top/playlist': 30 * MINUTE,
  '/personalized/newsong': 30 * MINUTE,
  '/recommend/songs': 10 * MINUTE,
  '/album/newest': 2 * 60 * MINUTE,
  '/homepage/block/page': 20 * MINUTE,
  '/recommend/resource': 15 * MINUTE,
  '/user/playlist': 5 * MINUTE,
  '/user/record': 5 * MINUTE,
  '/user/subcount': 5 * MINUTE,
  '/toplist': 60 * MINUTE,
  '/toplist/detail': 30 * MINUTE,
  '/history/recommend/songs': 15 * MINUTE,
  '/history/recommend/songs/detail': 15 * MINUTE,
}

export function getApiCacheTtl(endpoint, method, options = {}) {
  if (method !== 'GET' || options.cache === false) return 0
  return options.cacheTtl ?? CACHE_TTL[endpoint] ?? 0
}

export function createApiCacheKey({ base, endpoint, params, body, cookie, ttl }) {
  if (!ttl) return ''
  return dbCache.createKey([
    base,
    endpoint,
    params,
    body,
    cookie ? cookie.slice(0, 48) : 'public',
  ])
}

export async function readApiCache(cacheKey, options = {}) {
  if (!cacheKey) return null
  return dbCache.apiGet(cacheKey, options)
}

export function writeApiCache(cacheKey, value, ttl) {
  if (!cacheKey || !ttl) return Promise.resolve()
  return dbCache.apiSet(cacheKey, value, ttl)
}

export function clearApiCache() {
  return dbCache.apiClear()
}

export function getApiCacheStats() {
  return dbCache.getLegacyApiStats()
}
