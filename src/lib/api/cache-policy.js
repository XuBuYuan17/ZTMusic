import { dbCache } from '../db/cache.js'
export { getApiCacheTtl, isCacheableResponse } from './cache-ttl.js'

const MAX_MEMORY_API_ENTRIES = 200
const PERSISTENT_MEMORY_PROMOTION_TTL = 30 * 1000
const memoryApiCache = new Map()

function rememberMemoryApiCache(cacheKey, value, ttl = PERSISTENT_MEMORY_PROMOTION_TTL) {
  if (!cacheKey || value === null || value === undefined) return
  memoryApiCache.delete(cacheKey)
  memoryApiCache.set(cacheKey, { value, expiresAt: Date.now() + ttl })
  while (memoryApiCache.size > MAX_MEMORY_API_ENTRIES) {
    memoryApiCache.delete(memoryApiCache.keys().next().value)
  }
}

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
  const memoryEntry = memoryApiCache.get(cacheKey)
  if (memoryEntry) {
    if (options.allowExpired || memoryEntry.expiresAt > Date.now()) {
      memoryApiCache.delete(cacheKey)
      memoryApiCache.set(cacheKey, memoryEntry)
      return memoryEntry.value
    }
    memoryApiCache.delete(cacheKey)
  }
  const persistent = await dbCache.apiGet(cacheKey, options)
  if (persistent && !options.allowExpired) rememberMemoryApiCache(cacheKey, persistent)
  return persistent
}

export function writeApiCache(cacheKey, value, ttl) {
  if (!cacheKey || !ttl) return Promise.resolve()
  rememberMemoryApiCache(cacheKey, value, ttl)
  return dbCache.apiSet(cacheKey, value, ttl)
}

export function clearApiCache() {
  memoryApiCache.clear()
  return dbCache.apiClear()
}

export async function getApiCacheStats() {
  return dbCache.getLegacyApiStatsAsync()
}
