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

import { isTauriAndroid, isTauriRuntime } from '../utils/runtime.ts'
import { debugLog, describeError } from '../utils/logging.ts'
import { getStorage, getStorageJson, removeStorage, setStorage } from '../utils/storage.ts'
import { STORAGE_KEYS } from '../utils/constants.ts'
import { LEGACY_MESSAGE_READ_STATE_KEY, migrateLegacyData } from './migration.ts'
import type { LegacyTrack } from './migration.ts'

/** adaptSQLocal 之后的统一数据库句柄：sql(statement, 参数数组或展开参数) */
export interface SqlClient {
  sql(statement: string, ...params: unknown[]): Promise<Record<string, unknown>[]>
}

interface RawSqlClient {
  sql: (statement: string, ...params: unknown[]) => Promise<unknown>
}

type SqlClientCtor = new (path: string) => RawSqlClient

let sqlocalCtor: SqlClientCtor | null = null
let _db: SqlClient | null = null
let _ready = false
let _errored = false
let _initPromise: Promise<boolean> | null = null
let _backend: 'pending' | 'sqlite' | 'fallback' = 'pending'

export function supportsPersistentSQLiteRuntime(
  runtime: { crossOriginIsolated?: boolean } = globalThis as typeof globalThis & { crossOriginIsolated?: boolean },
): boolean {
  return runtime?.crossOriginIsolated === true
}

async function loadSQLocal(): Promise<SqlClientCtor> {
  if (sqlocalCtor) return sqlocalCtor
  const mod = await import('sqlocal') as unknown as Record<string, unknown>
  sqlocalCtor = (mod.SQLocal ?? mod.default ?? mod) as SqlClientCtor
  return sqlocalCtor
}

export function adaptSQLocal(client: RawSqlClient): SqlClient {
  const raw = client.sql.bind(client)
  client.sql = (statement: string, ...params: unknown[]): Promise<unknown> => (
    params.length === 1 && Array.isArray(params[0])
      ? raw(statement, ...(params[0] as unknown[]))
      : raw(statement, ...params)
  )
  return client as unknown as SqlClient
}

export async function initDB(): Promise<boolean> {
  if (_ready) return true
  if (_errored) return false
  if (_initPromise) return _initPromise

  if (typeof window === 'undefined') {
    _errored = true
    _backend = 'fallback'
    try { setStorage('db_fallback_reason', 'non_browser_runtime') } catch { /* ignore */ }
    return false
  }

  // Tauri Android: WebView 行为更接近移动浏览器，OPFS 不可靠，直接降级。
  // 桌面端（Linux/Windows WebView2/WebKitGTK）尝试走 SQLite 路径。
  if (isTauriAndroid()) {
    debugLog('db', 'skip SQLite on Tauri Android')
    _errored = true
    _backend = 'fallback'
    try { setStorage('db_fallback_reason', 'android_tauri') } catch { /* ignore */ }
    return false
  }

  if (!isTauriRuntime() && !supportsPersistentSQLiteRuntime()) {
    debugLog('db', 'skip SQLite without cross-origin isolation')
    _errored = true
    _backend = 'fallback'
    try { setStorage('db_fallback_reason', 'cross_origin_isolation_unavailable') } catch { /* ignore */ }
    return false
  }

  _initPromise = (async () => {
    try {
      const SQLocalClass = await loadSQLocal()
      const db = adaptSQLocal(new SQLocalClass('zheting.db'))
      _db = db

      await db.sql(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
      await db.sql(`CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT, song_id INTEGER NOT NULL,
        name TEXT NOT NULL, artists TEXT, album TEXT, pic_url TEXT,
        duration INTEGER, played_at INTEGER NOT NULL, play_count INTEGER NOT NULL DEFAULT 1,
        source TEXT, local_id TEXT, webdav_id TEXT, remote_url TEXT,
        webdav_base_url TEXT, webdav_username TEXT, file_name TEXT, relative_path TEXT, mime TEXT, file_size INTEGER
      )`)
      const addHistoryColumn = async (definition: string) => {
        try { await db.sql(`ALTER TABLE play_history ADD COLUMN ${definition}`) } catch { /* already exists */ }
      }
      await addHistoryColumn('play_count INTEGER NOT NULL DEFAULT 1')
      await addHistoryColumn('source TEXT')
      await addHistoryColumn('local_id TEXT')
      await addHistoryColumn('webdav_id TEXT')
      await addHistoryColumn('remote_url TEXT')
      await addHistoryColumn('webdav_base_url TEXT')
      await addHistoryColumn('webdav_username TEXT')
      await addHistoryColumn('file_name TEXT')
      await addHistoryColumn('relative_path TEXT')
      await addHistoryColumn('mime TEXT')
      await addHistoryColumn('file_size INTEGER')
      await db.sql(`CREATE TABLE IF NOT EXISTS song_urls (
        song_id INTEGER PRIMARY KEY, urls TEXT NOT NULL,
        expires_at INTEGER NOT NULL DEFAULT 0, saved_at INTEGER NOT NULL
      )`)
      try {
        await db.sql(`ALTER TABLE song_urls ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0`)
      } catch {
        // 列已存在时 ALTER 抛错，忽略
      }
      await db.sql(`CREATE TABLE IF NOT EXISTS api_cache (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        expires_at INTEGER NOT NULL, saved_at INTEGER NOT NULL
      )`)
      await db.sql(`CREATE INDEX IF NOT EXISTS idx_history_played_at ON play_history(played_at DESC)`)
      await db.sql(`CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at)`)

      const legacySettings: Record<string, string> = {}
      const messageReadState = getStorage(LEGACY_MESSAGE_READ_STATE_KEY, '') || null
      if (messageReadState != null) legacySettings[LEGACY_MESSAGE_READ_STATE_KEY] = messageReadState
      await migrateLegacyData(db, {
        history: getStorageJson<LegacyTrack[]>(STORAGE_KEYS.LOCAL_HISTORY, []),
        settings: legacySettings,
      })
      removeStorage(STORAGE_KEYS.LOCAL_HISTORY)
      removeStorage(LEGACY_MESSAGE_READ_STATE_KEY)

      _ready = true
      _backend = 'sqlite'
      debugLog('db', 'sqlite ready')
      return true
    } catch (err) {
      // sqlocal 抛 'OPFS not available'、wasm init 失败、cross-origin isolated 缺失
      // 等任何 SQLite 不可用的情况：都降级到 IndexedDB/localStorage。
      const reason = describeError(err)
      debugLog('db', 'sqlite init failed, falling back', { reason })
      _errored = true
      _db = null
      _backend = 'fallback'
      try { setStorage('db_fallback_reason', reason.slice(0, 200)) } catch { /* ignore */ }
      return false
    }
  })()

  return _initPromise
}

export function ensureDB(): Promise<boolean> { return initDB() }
export function getDB(): SqlClient | null { return _ready ? _db : null }
export function isReady(): boolean { return _ready }
export function getDBBackend(): string { return _backend }
