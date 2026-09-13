import { dbCache } from '../db/cache.ts'
export { getApiCacheTtl, isCacheableResponse } from './cache-ttl.ts'
import type { ApiCacheKeyInput } from '../types/api.ts'

const MAX_MEMORY_API_ENTRIES = 200
const PERSISTENT_MEMORY_PROMOTION_TTL = 30 * 1000

interface MemoryCacheEntry {
  value: unknown
  expiresAt: number
}

const memoryApiCache = new Map<string, MemoryCacheEntry>()

function rememberMemoryApiCache(cacheKey: string, value: unknown, ttl: number = PERSISTENT_MEMORY_PROMOTION_TTL): void {
  if (!cacheKey || value === null || value === undefined) return
  memoryApiCache.delete(cacheKey)
  memoryApiCache.set(cacheKey, { value, expiresAt: Date.now() + ttl })
  while (memoryApiCache.size > MAX_MEMORY_API_ENTRIES) {
    const oldest = memoryApiCache.keys().next().value
    if (oldest === undefined) break
    memoryApiCache.delete(oldest)
  }
}

export function createApiCacheKey({ base, endpoint, params, body, cookie, ttl }: ApiCacheKeyInput): string {
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

export interface ReadApiCacheOptions {
  allowExpired?: boolean
}

export async function readApiCache(
  cacheKey: string,
  options: ReadApiCacheOptions = {},
): Promise<unknown | null> {
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

export function writeApiCache(cacheKey: string, value: unknown, ttl: number): Promise<void> {
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
