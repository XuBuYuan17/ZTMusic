const DB_NAME = 'zheting-local-music'
const DB_VERSION = 1
const TRACKS_STORE = 'tracks'
const FILES_STORE = 'files'
const urlCache = new Map<IDBValidKey, string>()

/** tracks store 的行：本地 LocalTrack 的最小超集，读取边界只依赖这三个字段 */
interface StoredTrackRow {
  id: IDBValidKey
  localId?: IDBValidKey
  addedAt?: number
  [key: string]: unknown
}

/** saveLocalTrack 写入时需要的标识字段（store 传入完整 LocalTrack） */
interface StoredTrackIdentity {
  id: IDBValidKey
  localId?: IDBValidKey
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('当前环境不支持本地曲库'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(TRACKS_STORE)) {
        const tracks = db.createObjectStore(TRACKS_STORE, { keyPath: 'id' })
        tracks.createIndex('addedAt', 'addedAt')
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) db.createObjectStore(FILES_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开本地曲库'))
  })
}

async function transaction<T>(mode: IDBTransactionMode, stores: string | string[], action: (tx: IDBTransaction) => T): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode)
      let result: T | undefined
      try { result = action(tx) } catch (error) { reject(error); return }
      tx.oncomplete = () => resolve(result as T)
      tx.onerror = () => reject(tx.error || new Error('本地曲库事务失败'))
      tx.onabort = () => reject(tx.error || new Error('本地曲库事务已中止'))
    })
  } finally {
    db.close()
  }
}

function requestResult<T>(request: IDBRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error || new Error('本地曲库读取失败'))
  })
}

export async function listLocalTracks(): Promise<StoredTrackRow[]> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(TRACKS_STORE, 'readonly')
    const tracks = await requestResult<StoredTrackRow[]>(tx.objectStore(TRACKS_STORE).getAll())
    return tracks.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
  } finally {
    db.close()
  }
}

export async function saveLocalTrack(track: StoredTrackIdentity, file: Blob): Promise<void> {
  await transaction('readwrite', [TRACKS_STORE, FILES_STORE], (tx) => {
    tx.objectStore(TRACKS_STORE).put(track)
    tx.objectStore(FILES_STORE).put(file, track.localId)
  })
  revokeLocalPlayableUrl(track.localId)
  try { await navigator.storage?.persist?.() } catch {}
}

export async function removeLocalTrack(id: IDBValidKey): Promise<void> {
  await transaction('readwrite', [TRACKS_STORE, FILES_STORE], (tx) => {
    tx.objectStore(TRACKS_STORE).delete(id)
    tx.objectStore(FILES_STORE).delete(id)
  })
  revokeLocalPlayableUrl(id)
}

export async function clearLocalTracks(): Promise<void> {
  await transaction('readwrite', [TRACKS_STORE, FILES_STORE], (tx) => {
    tx.objectStore(TRACKS_STORE).clear()
    tx.objectStore(FILES_STORE).clear()
  })
  for (const url of urlCache.values()) URL.revokeObjectURL(url)
  urlCache.clear()
}

export async function getLocalPlayableUrl(id: IDBValidKey): Promise<string> {
  const cached = urlCache.get(id)
  if (cached !== undefined) return cached
  const db = await openDatabase()
  try {
    const file = await requestResult<Blob>(db.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE).get(id))
    if (!file) throw new Error('本地音频文件不存在，请重新导入')
    const url = URL.createObjectURL(file)
    urlCache.set(id, url)
    return url
  } finally {
    db.close()
  }
}

export function revokeLocalPlayableUrl(id: IDBValidKey | undefined): void {
  if (id == null) return
  const url = urlCache.get(id)
  if (!url) return
  URL.revokeObjectURL(url)
  urlCache.delete(id)
}
