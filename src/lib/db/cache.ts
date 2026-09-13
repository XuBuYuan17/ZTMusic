/**
 * 缓存存储（SQLite）
 * 替代 localStorage cache + IndexedDB dbcache
 *
 * 两个缓存表：
 *   - api_cache:  API 响应缓存（带 TTL）
 *   - song_urls:  歌曲 URL 缓存（持久化）
 *
 * 用法：
 *   import { dbCache } from '../db/cache.ts'
 *   await dbCache.apiGet(key)
 *   await dbCache.apiSet(key, value, ttl)
 *   await dbCache.urlGet(songId)
 *   await dbCache.urlSet(songId, urls)
 */

import { ensureDB, getDB } from './init.ts'
import { getStorage, setStorage } from '../utils/storage.ts'
import { debugLog, describeError } from '../utils/logging.ts'
import {
  clearCache as clearLegacyApiCache,
  createCacheKey,
  getCacheStats as getLegacyApiCacheStats,
  readCache,
  writeCache,
} from '../utils/cache.ts'
import { dbApiClear, dbApiRead, dbApiWrite, dbCleanExpired, dbClearAll, dbGetStats, dbUrlGet } from '../utils/dbcache.ts'
import type { SongId } from '../types/music.ts'

// ==== 降级前缀 ====
const URL_CACHE_PREFIX = 'db_fallback_url_'  // localStorage fallback for song URLs

export interface ApiCacheReadOptions {
  allowExpired?: boolean
}

export interface LegacyApiStats {
  entries: number
  bytes?: number
  source: string
}

export interface DbCacheStats {
  apiCache: number
  urlCache: number
  available?: boolean
}

// 每个会话只在首次成功写入后清扫一次过期项；写路径本已 ensureDB，不违背懒加载
let _expiredSwept = false
function scheduleExpiredSweep(): void {
  if (_expiredSwept) return
  _expiredSwept = true
  void dbCache.apiCleanExpired()
}

export const dbCache = {
  // ========================
  // API 缓存 (api_cache)
  // ========================

  createKey(parts: unknown[]): string {
    return createCacheKey(parts)
  },

  /** 读取 API 缓存 */
  async apiGet(key: string, options: ApiCacheReadOptions = {}): Promise<unknown> {
    if (!key) return null
    await ensureDB()
    const { allowExpired = false } = options
    if (!getDB()) {
      debugLog('db', 'apiGet SQLite unavailable, using fallback', { key: key?.slice(0, 32) })
      const idbCached = allowExpired ? null : await dbApiRead(key).catch(() => null)
      if (idbCached) return idbCached
      return readCache(key, { allowExpired }) ?? null
    }
    try {
      const db = getDB()
      if (!db) return null
      const rows = await db.sql(
        allowExpired
          ? `SELECT value FROM api_cache WHERE key = ?`
          : `SELECT value FROM api_cache WHERE key = ? AND expires_at > ?`,
        allowExpired ? [key] : [key, Date.now()]
      )
      const raw = rows[0]?.value
      if (typeof raw === 'string' && raw) {
        return JSON.parse(raw)
      }
      if (!allowExpired) {
        await db.sql(`DELETE FROM api_cache WHERE key = ?`, [key]).catch(() => {})
      }
      return null
    } catch (error) {
      debugLog('db', 'apiGet SQLite failed', { key: key?.slice(0, 32), message: describeError(error) })
      return null
    }
  },

  /** 写入 API 缓存；ttl 单位毫秒 */
  async apiSet(key: string, value: unknown, ttl: number): Promise<void> {
    if (!key || !ttl || ttl <= 0) return
    await ensureDB()
    if (!getDB()) {
      writeCache(key, value, ttl)
      dbApiWrite(key, value, ttl).catch(() => {})
      scheduleExpiredSweep()
      return
    }
    try {
      const db = getDB()
      if (!db) return
      await db.sql(
        `INSERT INTO api_cache (key, value, expires_at, saved_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, saved_at = excluded.saved_at`,
        [key, JSON.stringify(value), Date.now() + ttl, Date.now()]
      )
      scheduleExpiredSweep()
    } catch (error) {
      debugLog('db', 'apiSet SQLite failed', { key: key?.slice(0, 32), message: describeError(error) })
    }
  },

  /** 删除过期 API 缓存 */
  async apiCleanExpired(): Promise<void> {
    await ensureDB()
    const db = getDB()
    if (!db) {
      // SQLite 不可用：清 IndexedDB fallback；localStorage 层由 LRU 120 自限
      await dbCleanExpired().catch(() => {})
      return
    }
    try {
      await db.sql(`DELETE FROM api_cache WHERE expires_at <= ?`, [Date.now()])
    } catch { /* ignore */ }
  },

  /** 清空 API 缓存（包含旧 localStorage / IndexedDB fallback） */
  async apiClear(): Promise<void> {
    await ensureDB()
    clearLegacyApiCache()
    await dbApiClear().catch(() => {})
    const db = getDB()
    if (!db) return
    try {
      await db.sql(`DELETE FROM api_cache`)
    } catch { /* ignore */ }
  },

  async getLegacyApiStatsAsync(): Promise<LegacyApiStats> {
    await ensureDB()
    const db = getDB()
    if (db) {
      try {
        const rows = await db.sql(`SELECT COUNT(*) as cnt FROM api_cache`)
        return { entries: (rows[0]?.cnt as number | undefined) || 0, source: 'sqlite' }
      } catch { return { entries: 0, source: 'sqlite' } }
    }
    const legacy = getLegacyApiCacheStats()
    return { ...legacy, source: 'localStorage' }
  },

  // ========================
  // 歌曲 URL 缓存 (song_urls)
  // ========================

  /** 获取缓存的歌曲 URL */
  async urlGet(songId: SongId): Promise<string[] | null> {
    if (!songId) return null
    await ensureDB()
    const readLocalFallback = (): string[] | null => {
      const raw = getStorage(URL_CACHE_PREFIX + songId, '')
      if (!raw) return null
      try {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const record = parsed as { urls?: unknown; expiresAt?: unknown }
          if (Array.isArray(record.urls)) {
            if (typeof record.expiresAt === 'number' && record.expiresAt < Date.now()) return null
            return record.urls as string[]
          }
          return null
        }
        return Array.isArray(parsed) ? parsed as string[] : null
      } catch { return null }
    }

    if (!getDB()) {
      return readLocalFallback() || await dbUrlGet(songId).catch(() => null)
    }
    try {
      const db = getDB()
      if (!db) return null
      const rows = await db.sql(`SELECT urls, expires_at FROM song_urls WHERE song_id = ?`, [songId])
      const row = rows[0]
      if (row && typeof row.urls === 'string' && row.urls) {
        const expiresAt = typeof row.expires_at === 'number' ? row.expires_at : 0
        if (expiresAt && expiresAt > 0 && expiresAt < Date.now()) {
          debugLog('db', 'urlGet expired', { songId, expiresAt: new Date(expiresAt).toISOString() })
          return null
        }
        return JSON.parse(row.urls) as string[]
      }
      return null
    } catch (error) {
      debugLog('db', 'urlGet SQLite failed', { songId, message: describeError(error) })
      return null
    }
  },

  /** 缓存歌曲 URL；ttlMs 过期时间，默认 1 小时 */
  async urlSet(songId: SongId, urls: string[], ttlMs: number = 60 * 60 * 1000): Promise<void> {
    if (!songId || !urls || urls.length === 0) return
    await ensureDB()
    const expiresAt = Date.now() + Math.max(0, ttlMs)
    if (!getDB()) {
      setStorage(URL_CACHE_PREFIX + songId, JSON.stringify({ urls, expiresAt }))
      return
    }
    try {
      const db = getDB()
      if (!db) return
      await db.sql(
        `INSERT INTO song_urls (song_id, urls, expires_at, saved_at) VALUES (?, ?, ?, ?) ON CONFLICT(song_id) DO UPDATE SET urls = excluded.urls, expires_at = excluded.expires_at, saved_at = excluded.saved_at`,
        [songId, JSON.stringify(urls), expiresAt, Date.now()]
      )
    } catch (error) {
      debugLog('db', 'urlSet SQLite failed', { songId, message: describeError(error) })
    }
  },

  /** 获取缓存统计信息 */
  async getStats(): Promise<DbCacheStats> {
    await ensureDB()
    const db = getDB()
    if (!db) {
      return dbGetStats()
    }
    try {
      const apiResult = await db.sql(`SELECT COUNT(*) as cnt FROM api_cache`)
      const urlResult = await db.sql(`SELECT COUNT(*) as cnt FROM song_urls`)
      return {
        apiCache: (apiResult[0]?.cnt as number | undefined) || 0,
        urlCache: (urlResult[0]?.cnt as number | undefined) || 0,
        available: true,
      }
    } catch { return { apiCache: 0, urlCache: 0, available: true } }
  },

  /** 清空所有缓存 */
  async clearAll(): Promise<void> {
    await ensureDB()
    clearLegacyApiCache()
    await dbClearAll().catch(() => {})
    const db = getDB()
    if (!db) return
    try {
      await db.sql(`DELETE FROM api_cache`)
      await db.sql(`DELETE FROM song_urls`)
    } catch { /* ignore */ }
  },
}
