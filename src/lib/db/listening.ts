import { dayKey, mergeListeningRows, type ListeningArchive, type ListeningRecord } from '../services/listening-report.ts'

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
  /** 把超过保留期的逐次播放行按「同一天同一首」合并，返回被消掉的行数。失败由调用方决定怎么处理 */
  async compact(retentionDays: number): Promise<number> {
    const db = await open()
    const tx = db.transaction('records', 'readwrite')
    const done = complete(tx)
    const store = tx.objectStore('records')
    const cutoff = dayKey(Date.now() - retentionDays * 86_400_000)
    const groups = new Map<string, ListeningRecord[]>()
    let removed = 0
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        const row = cursor.value as ListeningRecord
        if (typeof row?.day === 'string' && row.day < cutoff && row.track?.key) {
          const group = `${row.track.key}/${row.day}`
          const list = groups.get(group)
          if (list) list.push(row)
          else groups.set(group, [row])
        }
        cursor.continue()
        return
      }
      // 游标走完再写，且全在同一个事务里同步发请求：事务不会提前提交。
      // 合并行的 key 是 <track.key>/<day>，先删后写，避免把上一轮合并出来的行删掉
      for (const rows of groups.values()) {
        const merged = rows.length > 1 ? mergeListeningRows(rows) : null
        if (!merged) continue
        for (const row of rows) store.delete(row.key)
        store.put(merged)
        removed += rows.length - 1
      }
    }
    await done
    return removed
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
