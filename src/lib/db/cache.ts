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
import { dbApiClear, dbApiRead, dbApiWrite, dbCleanExpired, dbClearAll, dbGetStats } from '../utils/dbcache.ts'
import { apiSession } from '../api/session.ts'
import { QUALITY_ORDER } from '../utils/constants.ts'
import type { PlayStream, SongId } from '../types/music.ts'

// ==== 降级前缀 ====
const URL_CACHE_PREFIX = 'db_fallback_url_'  // localStorage fallback for song URLs

// 离线保留窗口：过期但仍在窗口内的 API 缓存行会留着，供断网兜底（allowExpired）读取；
// 超过该窗口才算真正弃用，由读取路径和会话清扫统一回收。
export const OFFLINE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

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

export interface UrlCacheContext {
  namespace: string
  isCurrent: () => boolean
}

export interface SongUrlCacheEntry {
  namespace: string
  urls: string[]
  candidates: { url: string; level?: string; source?: string }[]
  expiresAt: number
}

const memoryUrlMetadata = new WeakMap<string[], SongUrlCacheEntry>()
const pendingUrlWrites = new Map<SongId, Promise<void>>()

async function withUrlWriteLock<T>(songId: SongId, write: () => Promise<T>): Promise<T> {
  const previousWrite = pendingUrlWrites.get(songId)
  let release!: () => void
  const finished = new Promise<void>(resolve => { release = resolve })
  pendingUrlWrites.set(songId, finished)
  try {
    if (previousWrite) await previousWrite
    return await write()
  } finally {
    release()
    if (pendingUrlWrites.get(songId) === finished) pendingUrlWrites.delete(songId)
  }
}

export function attachUrlCacheMetadata(urls: string[], entry: SongUrlCacheEntry): void {
  memoryUrlMetadata.set(urls, entry)
}

export function getUrlCacheMetadata(urls: string[]): SongUrlCacheEntry | undefined {
  return memoryUrlMetadata.get(urls)
}

export async function getUrlCacheContext(): Promise<UrlCacheContext> {
  const base = apiSession.getBase()
  const version = apiSession.getVersion()
  const getIdentity = () => apiSession.getCookie().split(';').map(part => part.trim()).find(part => part.startsWith('MUSIC_U=')) || 'public'
  const identity = getIdentity()
  const { musicProviders } = await import('../music/service.ts')
  const provider = musicProviders.getActive()
  const isCurrent = () => provider === musicProviders.getActive() && base === apiSession.getBase()
    && version === apiSession.getVersion()
  // 非安全上下文无法安全散列身份，跳过 URL 缓存而不落盘原始凭据。
  if (!globalThis.crypto?.subtle) return { namespace: '', isCurrent }
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([provider.id, base, identity])))
    return { namespace: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''), isCurrent }
  } catch {
    return { namespace: '', isCurrent }
  }
}

function readUrlCacheEntry(value: unknown, namespace: string): SongUrlCacheEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<SongUrlCacheEntry>
  if (record.namespace !== namespace || typeof record.expiresAt !== 'number' || !Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now()
    || !Array.isArray(record.candidates)) return null
  const candidates = record.candidates.filter(candidate => candidate && typeof candidate.url === 'string' && candidate.url)
    .map(candidate => ({
      url: candidate.url,
      level: typeof candidate.level === 'string' ? candidate.level : undefined,
      source: typeof candidate.source === 'string' ? candidate.source : undefined,
    }))
  if (candidates.length === 0) return null
  return { namespace, candidates, urls: candidates.map(candidate => candidate.url), expiresAt: record.expiresAt }
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
      const now = Date.now()
      const rows = await db.sql(
        allowExpired
          ? `SELECT value FROM api_cache WHERE key = ? AND expires_at + ? > ?`
          : `SELECT value FROM api_cache WHERE key = ? AND expires_at > ?`,
        allowExpired ? [key, OFFLINE_RETENTION_MS, now] : [key, now]
      )
      const raw = rows[0]?.value
      if (typeof raw === 'string' && raw) {
        return JSON.parse(raw)
      }
      if (!allowExpired) {
        // 只删超过保留窗口的旧行；窗口内的过期行留着供断网兜底读取，统一交给清扫回收
        await db.sql(`DELETE FROM api_cache WHERE key = ? AND expires_at + ? <= ?`, [key, OFFLINE_RETENTION_MS, now]).catch(() => {})
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
      await db.sql(`DELETE FROM api_cache WHERE expires_at + ? <= ?`, [OFFLINE_RETENTION_MS, Date.now()])
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
    return (await dbCache.urlGetEntry(songId))?.urls ?? null
  },

  async urlGetEntry(songId: SongId, context?: UrlCacheContext): Promise<SongUrlCacheEntry | null> {
    if (!songId) return null
    const currentContext = context ?? await getUrlCacheContext()
    await ensureDB()
    if (!currentContext.namespace || !currentContext.isCurrent()) return null
    const readLocalFallback = (): SongUrlCacheEntry | null => {
      const raw = getStorage(URL_CACHE_PREFIX + songId, '')
      if (!raw) return null
      try {
        return readUrlCacheEntry(JSON.parse(raw), currentContext.namespace)
      } catch { return null }
    }

    if (!getDB()) return readLocalFallback()
    try {
      const db = getDB()
      if (!db) return null
      const rows = await db.sql(`SELECT urls, expires_at FROM song_urls WHERE song_id = ?`, [songId])
      const row = rows[0]
      if (!currentContext.isCurrent()) return null
      if (row && typeof row.urls === 'string' && row.urls) {
        const expiresAt = typeof row.expires_at === 'number' ? row.expires_at : 0
        if (expiresAt && expiresAt > 0 && expiresAt < Date.now()) {
          debugLog('db', 'urlGet expired', { songId, expiresAt: new Date(expiresAt).toISOString() })
          return null
        }
        return readUrlCacheEntry(JSON.parse(row.urls), currentContext.namespace)
      }
      return null
    } catch (error) {
      debugLog('db', 'urlGet SQLite failed', { songId, message: describeError(error) })
      return null
    }
  },

  /** 缓存歌曲 URL；ttlMs 过期时间，默认 1 小时 */
  async urlSet(songId: SongId, urls: string[], ttlMs: number = 60 * 60 * 1000): Promise<void> {
    await dbCache.urlSetEntry(songId, urls.map(url => ({ url })), { ttlMs })
  },

  async urlSetEntry(
    songId: SongId,
    streams: readonly PlayStream[],
    options: {
      context?: UrlCacheContext
      ttlMs?: number
      preserveHigherQuality?: boolean
      isUrlFailed?: (url: string) => boolean
      isActive?: () => boolean
    } = {},
  ): Promise<SongUrlCacheEntry | null> {
    if (!songId || !streams || streams.length === 0) return null
    const currentContext = options.context ?? await getUrlCacheContext()
    const canWrite = () => Boolean(currentContext.namespace) && currentContext.isCurrent() && options.isActive?.() !== false
    const collectCandidates = () => streams.filter(stream => stream?.url && !stream.isTrial && stream.cacheable !== false && !options.isUrlFailed?.(stream.url))
      .map(stream => ({ url: stream.url, level: stream.level, source: stream.source }))
      .filter((candidate, index, all) => all.findIndex(item => item.url === candidate.url) === index)
    // 同首歌的质量检查和回写串行执行，避免并发刷新用低档位覆盖新写入的高档位。
    return withUrlWriteLock(songId, async () => {
      await ensureDB()
      if (!canWrite()) return null
      let candidates = collectCandidates()
      if (candidates.length === 0) return null
      if (options.preserveHigherQuality) {
        const existing = await dbCache.urlGetEntry(songId, currentContext)
        if (!canWrite()) return null
        candidates = collectCandidates()
        if (candidates.length === 0) return null
        const existingCandidates = existing?.candidates.filter(candidate => !options.isUrlFailed?.(candidate.url)) ?? []
        const existingLevel = QUALITY_ORDER.indexOf(existingCandidates[0]?.level || '')
        const newLevel = QUALITY_ORDER.indexOf(candidates[0]?.level || '')
        if (existing && existingLevel >= 0 && (newLevel < 0 || existingLevel < newLevel)) {
          return { ...existing, candidates: existingCandidates, urls: existingCandidates.map(candidate => candidate.url) }
        }
      }
      if (!canWrite()) return null
      candidates = collectCandidates()
      if (candidates.length === 0) return null
      const expiresAt = Date.now() + Math.max(0, options.ttlMs ?? 60 * 60 * 1000)
      const entry: SongUrlCacheEntry = { namespace: currentContext.namespace, urls: candidates.map(candidate => candidate.url), candidates, expiresAt }
      const serialized = JSON.stringify({ namespace: entry.namespace, candidates, expiresAt })
      if (!getDB()) {
        setStorage(URL_CACHE_PREFIX + songId, serialized)
        return entry
      }
      try {
        const db = getDB()
        if (!db || !canWrite()) return null
        await db.sql(
          `INSERT INTO song_urls (song_id, urls, expires_at, saved_at) VALUES (?, ?, ?, ?) ON CONFLICT(song_id) DO UPDATE SET urls = excluded.urls, expires_at = excluded.expires_at, saved_at = excluded.saved_at`,
          [songId, serialized, expiresAt, Date.now()]
        )
        return entry
      } catch (error) {
        debugLog('db', 'urlSet SQLite failed', { songId, message: describeError(error) })
        return null
      }
    })
  },

  async urlRemove(songId: SongId, url: string, context?: UrlCacheContext): Promise<void> {
    if (!songId || !url) return
    const currentContext = context ?? await getUrlCacheContext()
    await withUrlWriteLock(songId, async () => {
      await ensureDB()
      if (!currentContext.namespace || !currentContext.isCurrent()) return
      const entry = await dbCache.urlGetEntry(songId, currentContext)
      if (!entry || !currentContext.isCurrent()) return
      const candidates = entry.candidates.filter(candidate => candidate.url !== url)
      if (candidates.length === entry.candidates.length) return
      const serialized = JSON.stringify({ namespace: entry.namespace, candidates, expiresAt: entry.expiresAt })
      const db = getDB()
      if (!db) {
        setStorage(URL_CACHE_PREFIX + songId, serialized)
        return
      }
      try {
        await db.sql(`UPDATE song_urls SET urls = ? WHERE song_id = ?`, [serialized, songId])
      } catch (error) {
        debugLog('db', 'urlRemove SQLite failed', { songId, message: describeError(error) })
      }
    })
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
