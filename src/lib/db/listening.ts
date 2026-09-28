import type { ListeningArchive, ListeningRecord } from '../services/listening-report.ts'

let connection: Promise<IDBDatabase> | undefined
function open(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('当前环境无法保存本地听歌统计')); return }
    const request = indexedDB.open('zheting-listening', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('records', { keyPath: 'key' })
      request.result.createObjectStore('metadata')
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('统计数据库被其他窗口占用，请关闭旧窗口后重试'))
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); connection = undefined }
      resolve(db)
    }
  }).catch(error => { connection = undefined; throw error })
  return connection
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('统计数据读写失败'))
    tx.onabort = () => reject(tx.error ?? new Error('统计数据事务中断'))
  })
}

export const listeningDB = {
  async initialize(archive: ListeningArchive): Promise<void> {
    const db = await open()
    const tx = db.transaction('metadata', 'readwrite')
    const done = complete(tx)
    const store = tx.objectStore('metadata')
    const request = store.get('archive')
    request.onsuccess = () => { if (!request.result) store.put(archive, 'archive') }
    await done
  },
  async save(rows: ListeningRecord[]): Promise<void> {
    if (!rows.length) return
    const db = await open()
    const tx = db.transaction('records', 'readwrite')
    const done = complete(tx)
    for (const row of rows) tx.objectStore('records').put(row)
    await done
  },
  async read(): Promise<{ records: ListeningRecord[]; archive: ListeningArchive | undefined }> {
    const db = await open()
    const tx = db.transaction(['records', 'metadata'], 'readonly')
    const done = complete(tx)
    const rows = tx.objectStore('records').getAll()
    const archive = tx.objectStore('metadata').get('archive')
    await done
    return { records: rows.result, archive: archive.result }
  },
}

export class ListeningCheckpoints {
  private pending = new Map<string, ListeningRecord>()
  private flight: Promise<void> | null = null
  private save: (rows: ListeningRecord[]) => Promise<void>
  constructor(save: (rows: ListeningRecord[]) => Promise<void>) { this.save = save }
  put(rows: ListeningRecord[]): void { for (const row of rows) this.pending.set(row.key, row) }
  flush(): Promise<void> {
    if (this.flight) return this.flight
    this.flight = (async () => {
      while (this.pending.size) {
        const batch = [...this.pending.values()]
        await this.save(batch)
        for (const row of batch) if (this.pending.get(row.key) === row) this.pending.delete(row.key)
      }
    })().finally(() => { this.flight = null })
    return this.flight
  }
}
