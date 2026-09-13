/**
 * IndexedDB 缓存层
 * - API 缓存: 带 TTL 的 HTTP 响应缓存（替代 localStorage）
 * - URL 缓存: 持久化歌曲播放 URL（跨会话，LRU 淘汰）
 *
 * 自动降级: IndexedDB 不可用时（隐私模式等）静默失败，
 * 调用方应回退到 localStorage。
 */

import type { SongId } from '../types/music.ts'

const DB_NAME = 'zheting_cache'
const DB_VERSION = 3
const STORE_API = 'api_cache'
const STORE_URL = 'song_urls'
const DB_TIMEOUT = 3000 // 3s timeout for IndexedDB operations
const URL_CACHE_TTL = 12 * 60 * 60 * 1000  // 歌曲 URL 过期时间：12 小时
let _idbFailed = false // fast-failure flag

interface ApiCacheRecord {
  key: string
  value: unknown
  expiresAt: number
  savedAt: number
}

interface UrlCacheRecord {
  id: string
  urls: string[]
  expiresAt?: number
  savedAt?: number
}

export interface DbCacheCounts {
  apiCache: number
  urlCache: number
  available: boolean
}

function openDB(): Promise<IDBDatabase> {
  if (_idbFailed) return Promise.reject(new Error('indexedDB previously failed'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('indexedDB timeout')), DB_TIMEOUT)
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => {
        const request = e.target as IDBOpenDBRequest
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_API)) {
          const s = db.createObjectStore(STORE_API, { keyPath: 'key' })
          s.createIndex('expiresAt', 'expiresAt', { unique: false })
        } else {
          // 升级旧 store
          const tx = request.transaction
          if (tx) {
            const store = tx.objectStore(STORE_API)
            if (!store.indexNames.contains('expiresAt')) {
              store.createIndex('expiresAt', 'expiresAt', { unique: false })
            }
          }
        }
        if (!db.objectStoreNames.contains(STORE_URL)) {
          const s = db.createObjectStore(STORE_URL, { keyPath: 'id' })
          s.createIndex('savedAt', 'savedAt', { unique: false })
        }
      }
      req.onsuccess = (e) => {
        clearTimeout(timer)
        resolve((e.target as IDBOpenDBRequest).result)
      }
      req.onerror = () => {
        clearTimeout(timer)
        _idbFailed = true
        reject(req.error ?? new Error('indexedDB open failed'))
      }
    } catch (err) {
      clearTimeout(timer)
      _idbFailed = true
      reject(err instanceof Error ? err : new Error('indexedDB not available'))
    }
  })
}

// ===== API 缓存 =====

export async function dbApiRead(key: string): Promise<unknown> {
  let db: IDBDatabase
  try { db = await openDB() } catch { return null }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_API, 'readonly')
      const req = tx.objectStore(STORE_API).get(key)
      req.onsuccess = () => {
        const entry = req.result as ApiCacheRecord | undefined
        if (!entry) return resolve(null)
        if (entry.expiresAt < Date.now()) {
          // 过期：dbCleanExpired() 统一清理，此处不再开 readwrite 事务
          return resolve(null)
        }
        resolve(entry.value)
      }
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

export async function dbApiWrite(key: string, value: unknown, ttl: number): Promise<void> {
  if (!ttl || ttl <= 0) return
  let db: IDBDatabase
  try { db = await openDB() } catch { return }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_API, 'readwrite')
      const record: ApiCacheRecord = { key, value, expiresAt: Date.now() + ttl, savedAt: Date.now() }
      tx.objectStore(STORE_API).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch { resolve() }
  })
}

export async function dbApiClear(): Promise<void> {
  let db: IDBDatabase
  try { db = await openDB() } catch { return }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_API, 'readwrite')
      tx.objectStore(STORE_API).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch { resolve() }
  })
}

// ===== 歌曲 URL 缓存（持久化） =====

export async function dbUrlGet(id: SongId): Promise<string[] | null> {
  let db: IDBDatabase
  try { db = await openDB() } catch { return null }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_URL, 'readonly')
      const req = tx.objectStore(STORE_URL).get(String(id))
      req.onsuccess = () => {
        const result = req.result as UrlCacheRecord | undefined
        if (!result?.urls) {
          resolve(null)
          return
        }
        // 新格式有 expiresAt，优先检查
        if (typeof result.expiresAt === 'number') {
          if (result.expiresAt < Date.now()) {
            resolve(null)
          } else {
            resolve(result.urls)
          }
          return
        }
        // 兼容旧格式用 savedAt
        if (result.savedAt && Date.now() - result.savedAt < URL_CACHE_TTL) {
          resolve(result.urls)
        } else {
          // 过期了，返回 null 让它重新请求
          resolve(null)
        }
      }
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

// ===== 统计 & 管理 =====

export async function dbGetStats(): Promise<DbCacheCounts> {
  let db: IDBDatabase
  try { db = await openDB() } catch { return { apiCache: 0, urlCache: 0, available: false } }
  try {
    const apiCount = await new Promise<number>((r) => {
      const c = db.transaction(STORE_API).objectStore(STORE_API).count()
      c.onsuccess = () => r(c.result as number)
      c.onerror = () => r(0)
    })
    const urlCount = await new Promise<number>((r) => {
      const c = db.transaction(STORE_URL).objectStore(STORE_URL).count()
      c.onsuccess = () => r(c.result as number)
      c.onerror = () => r(0)
    })
    return { apiCache: apiCount, urlCache: urlCount, available: true }
  } catch { return { apiCache: 0, urlCache: 0, available: false } }
}

export async function dbClearAll(): Promise<void> {
  let db: IDBDatabase
  try { db = await openDB() } catch { return }
  try {
    await Promise.all([
      new Promise<void>((r) => { const t = db.transaction(STORE_API, 'readwrite'); t.objectStore(STORE_API).clear(); t.oncomplete = () => r(); t.onerror = () => r() }),
      new Promise<void>((r) => { const t = db.transaction(STORE_URL, 'readwrite'); t.objectStore(STORE_URL).clear(); t.oncomplete = () => r(); t.onerror = () => r() }),
    ])
  } catch {}
}

export async function dbCleanExpired(): Promise<void> {
  let db: IDBDatabase
  try { db = await openDB() } catch { return }
  try {
    const tx = db.transaction(STORE_API, 'readwrite')
    const idx = tx.objectStore(STORE_API).index('expiresAt')
    idx.openCursor(IDBKeyRange.upperBound(Date.now())).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result
      if (cursor) { cursor.delete(); cursor.continue() }
    }
  } catch {}
}
