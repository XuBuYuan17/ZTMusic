/**
 * 缓存存储（SQLite）
 * 替代 localStorage cache + IndexedDB dbcache
 *
 * 两个缓存表：
 *   - api_cache:  API 响应缓存（带 TTL）
 *   - song_urls:  歌曲 URL 缓存（持久化）
 *
 * 用法：
 *   import { dbCache } from '../db/cache.js'
 *   await dbCache.apiGet(key)
 *   await dbCache.apiSet(key, value, ttl)
 *   await dbCache.urlGet(songId)
 *   await dbCache.urlSet(songId, urls)
 */

import { getDB, isReady } from './init.js'
import { getStorage, setStorage } from '../utils/storage.js'
import { readCache, writeCache } from '../utils/cache.js'

// ==== 降级前缀 ====
const URL_CACHE_PREFIX = 'db_fallback_url_'  // localStorage fallback for song URLs

function isAvailable() {
  return isReady() && getDB()
}

export const dbCache = {
  // ========================
  // API 缓存 (api_cache)
  // ========================

  /**
   * 读取 API 缓存
   * @param {string} key
   * @returns {Promise<*|null>}
   */
  async apiGet(key) {
    if (!key) return null
    if (!isAvailable()) {
      return readCache(key) ?? null
    }
    try {
      const db = getDB()
      const rows = await db.sql(
        `SELECT value FROM api_cache WHERE key = ? AND expires_at > ?`,
        [key, Date.now()]
      )
      if (rows.length > 0 && rows[0].value) {
        return JSON.parse(rows[0].value)
      }
      // 过期则后台删除
      await db.sql(`DELETE FROM api_cache WHERE key = ?`, [key]).catch(() => {})
      return null
    } catch {
      return readCache(key) ?? null
    }
  },

  /**
   * 写入 API 缓存
   * @param {string} key
   * @param {*} value
   * @param {number} ttl - TTL in ms
   */
  async apiSet(key, value, ttl) {
    if (!key || !ttl || ttl <= 0) return
    if (!isAvailable()) {
      writeCache(key, value, ttl)
      return
    }
    try {
      const db = getDB()
      await db.sql(
        `INSERT INTO api_cache (key, value, expires_at, saved_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, saved_at = excluded.saved_at`,
        [key, JSON.stringify(value), Date.now() + ttl, Date.now()]
      )
    } catch {
      writeCache(key, value, ttl)
    }
  },

  /**
   * 删除过期 API 缓存
   */
  async apiCleanExpired() {
    if (!isAvailable()) return
    try {
      const db = getDB()
      await db.sql(`DELETE FROM api_cache WHERE expires_at <= ?`, [Date.now()])
    } catch { /* ignore */ }
  },

  // ========================
  // 歌曲 URL 缓存 (song_urls)
  // ========================

  /**
   * 获取缓存的歌曲 URL
   * @param {number} songId
   * @returns {Promise<string[]|null>}
   */
  async urlGet(songId) {
    if (!songId) return null
    if (!isAvailable()) {
      // localStorage fallback
      const raw = getStorage(URL_CACHE_PREFIX + songId, '')
      if (raw) {
        try { return JSON.parse(raw) } catch { return null }
      }
      return null
    }
    try {
      const db = getDB()
      const rows = await db.sql(`SELECT urls FROM song_urls WHERE song_id = ?`, [songId])
      if (rows.length > 0 && rows[0].urls) {
        return JSON.parse(rows[0].urls)
      }
      return null
    } catch {
      const raw = getStorage(URL_CACHE_PREFIX + songId, '')
      if (raw) {
        try { return JSON.parse(raw) } catch { return null }
      }
      return null
    }
  },

  /**
   * 缓存歌曲 URL
   * @param {number} songId
   * @param {string[]} urls
   */
  async urlSet(songId, urls) {
    if (!songId || !urls || urls.length === 0) return
    if (!isAvailable()) {
      setStorage(URL_CACHE_PREFIX + songId, JSON.stringify(urls))
      return
    }
    try {
      const db = getDB()
      await db.sql(
        `INSERT INTO song_urls (song_id, urls, saved_at) VALUES (?, ?, ?) ON CONFLICT(song_id) DO UPDATE SET urls = excluded.urls, saved_at = excluded.saved_at`,
        [songId, JSON.stringify(urls), Date.now()]
      )
    } catch {
      setStorage(URL_CACHE_PREFIX + songId, JSON.stringify(urls))
    }
  },

  /**
   * 获取缓存统计信息
   * @returns {Promise<{apiCache: number, urlCache: number}>
   */
  async getStats() {
    if (!isAvailable()) {
      return { apiCache: 0, urlCache: 0, available: false }
    }
    try {
      const db = getDB()
      const apiResult = await db.sql(`SELECT COUNT(*) as cnt FROM api_cache`)
      const urlResult = await db.sql(`SELECT COUNT(*) as cnt FROM song_urls`)
      return {
        apiCache: apiResult[0]?.cnt || 0,
        urlCache: urlResult[0]?.cnt || 0,
        available: true,
      }
    } catch {
      return { apiCache: 0, urlCache: 0, available: false }
    }
  },

  /**
   * 清空所有缓存
   */
  async clearAll() {
    if (!isAvailable()) return
    try {
      const db = getDB()
      await db.sql(`DELETE FROM api_cache`)
      await db.sql(`DELETE FROM song_urls`)
    } catch { /* ignore */ }
  },
}