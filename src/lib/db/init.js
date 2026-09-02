/**
 * SQLite 数据库初始化与 Schema 迁移
 *
 * 使用 sqlocal（SQLite WASM + OPFS）实现持久化存储。
 *
 * 兼容性策略（重要）：
 *   - 纯浏览器环境：OPFS 正常工作，数据持久化
 *   - Tauri Android：WebView 行为更接近移动浏览器，OPFS 不可靠，跳过 SQLite
 *   - Tauri 桌面（Linux/Windows）：尝试 SQLite，失败时静默降级到 IndexedDB
 *   - 任一失败：降级到 localStorage/IndexedDB
 */

import { isTauriAndroid } from '../utils/runtime.js'
import { debugLog } from '../utils/logging.js'

let SQLocal = null
let _db = null
let _ready = false
let _errored = false
let _initPromise = null

async function loadSQLocal() {
  if (SQLocal) return SQLocal
  const mod = await import('sqlocal')
  SQLocal = mod.SQLocal || mod.default || mod
  return SQLocal
}

export async function initDB() {
  if (_ready) return true
  if (_errored) return false
  if (_initPromise) return _initPromise

  // Tauri Android: WebView 行为更接近移动浏览器，OPFS 不可靠，直接降级。
  // 桌面端（Linux/Windows WebView2/WebKitGTK）尝试走 SQLite 路径。
  if (isTauriAndroid()) {
    debugLog('db', 'skip SQLite on Tauri Android')
    _errored = true
    try { setStorage('db_fallback_reason', 'android_tauri') } catch { /* ignore */ }
    return false
  }

  _initPromise = (async () => {
    try {
      const SQLocalClass = await loadSQLocal()
      _db = new SQLocalClass('zheting.db')

      await _db.sql(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
      await _db.sql(`CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT, song_id INTEGER NOT NULL,
        name TEXT NOT NULL, artists TEXT, album TEXT, pic_url TEXT,
        duration INTEGER, played_at INTEGER NOT NULL, play_count INTEGER NOT NULL DEFAULT 1,
        source TEXT, local_id TEXT, webdav_id TEXT, remote_url TEXT,
        webdav_username TEXT, file_name TEXT, relative_path TEXT, mime TEXT, file_size INTEGER
      )`)
      const addHistoryColumn = async (definition) => {
        try { await _db.sql(`ALTER TABLE play_history ADD COLUMN ${definition}`) } catch { /* already exists */ }
      }
      await addHistoryColumn('play_count INTEGER NOT NULL DEFAULT 1')
      await addHistoryColumn('source TEXT')
      await addHistoryColumn('local_id TEXT')
      await addHistoryColumn('webdav_id TEXT')
      await addHistoryColumn('remote_url TEXT')
      await addHistoryColumn('webdav_username TEXT')
      await addHistoryColumn('file_name TEXT')
      await addHistoryColumn('relative_path TEXT')
      await addHistoryColumn('mime TEXT')
      await addHistoryColumn('file_size INTEGER')
      await _db.sql(`CREATE TABLE IF NOT EXISTS song_urls (
        song_id INTEGER PRIMARY KEY, urls TEXT NOT NULL,
        expires_at INTEGER NOT NULL DEFAULT 0, saved_at INTEGER NOT NULL
      )`)
      try {
        await _db.sql(`ALTER TABLE song_urls ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0`)
      } catch {
        // 列已存在时 ALTER 抛错，忽略
      }
      await _db.sql(`CREATE TABLE IF NOT EXISTS api_cache (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        expires_at INTEGER NOT NULL, saved_at INTEGER NOT NULL
      )`)
      await _db.sql(`CREATE INDEX IF NOT EXISTS idx_history_played_at ON play_history(played_at DESC)`)
      await _db.sql(`CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at)`)

      _ready = true
      debugLog('db', 'sqlite ready')
      return true
    } catch (err) {
      // sqlocal 抛 'OPFS not available'、wasm init 失败、cross-origin isolated 缺失
      // 等任何 SQLite 不可用的情况：都降级到 IndexedDB/localStorage。
      const reason = err?.message || String(err)
      debugLog('db', 'sqlite init failed, falling back', { reason })
      _errored = true
      try { setStorage('db_fallback_reason', reason.slice(0, 200)) } catch { /* ignore */ }
      return false
    }
  })()

  return _initPromise
}

export function getDB() { return _ready ? _db : null }
export function isReady() { return _ready }
