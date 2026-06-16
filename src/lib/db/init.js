/**
 * SQLite 数据库初始化与 Schema 迁移
 *
 * 使用 sqlocal（SQLite WASM + OPFS）实现持久化存储。
 * 自动降级：IndexedDB/OPFS 不可用时返回 null，调用方应回退到 localStorage。
 */

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

/**
 * 初始化数据库。可重复调用，只初始化一次。
 * @returns {Promise<boolean>} 是否初始化成功
 */
export async function initDB() {
  if (_ready) return true
  if (_errored) return false
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    try {
      const SQLocalClass = await loadSQLocal()
      _db = new SQLocalClass('zheting.db')

      // 执行 schema 迁移
      await _db.sql(`
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `)
      await _db.sql(`
        CREATE TABLE IF NOT EXISTS play_history (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          song_id   INTEGER NOT NULL,
          name      TEXT NOT NULL,
          artists   TEXT,
          album     TEXT,
          pic_url   TEXT,
          duration  INTEGER,
          played_at INTEGER NOT NULL
        )
      `)
      await _db.sql(`
        CREATE TABLE IF NOT EXISTS song_urls (
          song_id   INTEGER PRIMARY KEY,
          urls      TEXT NOT NULL,
          saved_at  INTEGER NOT NULL
        )
      `)
      await _db.sql(`
        CREATE TABLE IF NOT EXISTS api_cache (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          saved_at   INTEGER NOT NULL
        )
      `)

      // 创建索引
      await _db.sql(`CREATE INDEX IF NOT EXISTS idx_history_played_at ON play_history(played_at DESC)`)
      await _db.sql(`CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at)`)

      _ready = true
      console.debug('[DB] SQLite initialized successfully')
      return true
    } catch (err) {
      console.warn('[DB] SQLite initialization failed, falling back to localStorage:', err?.message || err)
      _errored = true
      return false
    }
  })()

  return _initPromise
}

/**
 * 获取数据库实例。调用前请确保 initDB() 已成功。
 * @returns {object|null} SQLocal 实例或 null
 */
export function getDB() {
  return _ready ? _db : null
}

/**
 * 检查数据库是否可用
 * @returns {boolean}
 */
export function isReady() {
  return _ready
}
