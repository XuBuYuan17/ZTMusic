import { dbCache } from '../db/cache.js'
export { getApiCacheTtl } from './cache-ttl.js'

export function createApiCacheKey({ base, endpoint, params, body, cookie, ttl }) {
  if (!ttl) return ''
  // 使用完整 cookie 参与 key 生成，避免 slice(0,48) 因不同账号前缀相同（MUSIC_A_T=/os=pc; MUSIC_U=）导致跨账号缓存串数据
  return dbCache.createKey([
    base,
    endpoint,
    params,
    body,
    cookie || 'public',
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

export async function getApiCacheStats() {
  return dbCache.getLegacyApiStatsAsync()
}
