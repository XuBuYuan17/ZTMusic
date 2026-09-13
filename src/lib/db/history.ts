/**
 * 播放历史存储（SQLite）
 * 替代 player/history.ts 中的 localStorage 逻辑
 *
 * 用法：
 *   import { dbHistory } from '../db/history.ts'
 *   await dbHistory.add(track)
 *   const list = await dbHistory.list()
 */

import { ensureDB, getDB } from './init.ts'
import { getStorageJson, removeStorage, setStorage } from '../utils/storage.ts'
import { normalizeImageUrl } from '../utils/image.ts'
import { LIMITS, STORAGE_KEYS } from '../utils/constants.ts'
import { debugLog, describeError } from '../utils/logging.ts'
import type { SongId } from '../types/music.ts'
import type { LegacyTrack } from './migration.ts'

const FALLBACK_KEY = STORAGE_KEYS.LOCAL_HISTORY
const HISTORY_CHANGE_EVENT = 'local-listening-history-change'
const HISTORY_FIELDS: (keyof LegacyTrack)[] = [
  'source',
  'localId',
  'webdavId',
  'remoteUrl',
  'webdavBaseUrl',
  'webdavUsername',
  'fileName',
  'relativePath',
  'mime',
  'fileSize',
]

/** dbHistory.list() 的返回条目；artists/album 是 JSON 解析后的松散结构 */
export interface HistoryEntry {
  id: SongId
  name: string
  artists: unknown
  album: unknown
  picUrl: string | null
  pic_url: string | null
  duration: number | null
  dt: number | null
  playedAt: number
  playCount: number
  source?: string
  localId?: SongId
  webdavId?: SongId
  remoteUrl?: string
  webdavBaseUrl?: string
  webdavUsername?: string
  fileName?: string
  relativePath?: string
  mime?: string
  fileSize: number
}

interface HistoryRow {
  song_id: SongId
  name: string
  artists: string | null
  album: string | null
  pic_url: string | null
  duration: number | null
  played_at: number
  play_count: number | null
  source: string | null
  local_id: string | null
  webdav_id: string | null
  remote_url: string | null
  webdav_base_url: string | null
  webdav_username: string | null
  file_name: string | null
  relative_path: string | null
  mime: string | null
  file_size: number | null
}

function notifyHistoryChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HISTORY_CHANGE_EVENT))
}

export const dbHistory = {
  /** 添加歌曲到播放历史 */
  async add(track: LegacyTrack): Promise<void> {
    if (!track || !track.id) return
    await ensureDB()

    const album = (track.al || track.album || {}) as { picUrl?: string }
    const source = track.source || ''
    const entry: Record<string, unknown> = {
      song_id: track.id,
      name: track.name || '',
      artists: JSON.stringify(track.ar || track.artists || []),
      album: JSON.stringify(album),
      pic_url: normalizeImageUrl(album.picUrl || (track.coverImgUrl as string) || (track.picUrl as string) || ''),
      duration: track.dt || track.duration || 0,
      played_at: Date.now(),
      source,
      local_id: track.localId || '',
      webdav_id: track.webdavId || '',
      remote_url: track.remoteUrl || '',
      webdav_base_url: track.webdavBaseUrl || '',
      webdav_username: track.webdavUsername || '',
      file_name: track.fileName || '',
      relative_path: track.relativePath || '',
      mime: track.mime || '',
      file_size: track.fileSize || 0,
    }

    if (!getDB()) {
      // fallback: localStorage
      try {
        let list = getStorageJson<HistoryEntry[]>(FALLBACK_KEY, [])
        const previous = list.find(t => t.id === track.id)
        list = list.filter(t => t.id !== track.id)
        list.unshift({
          id: track.id, name: track.name as string, artists: track.ar || track.artists || [],
          album, picUrl: entry.pic_url as string | null, duration: entry.duration as number, playedAt: Date.now(),
          playCount: (Number(previous?.playCount) || 0) + 1,
          ...Object.fromEntries(HISTORY_FIELDS.map(field => [field, track[field] || ''])),
        } as HistoryEntry)
        if (list.length > LIMITS.MAX_HISTORY) list.length = LIMITS.MAX_HISTORY
        setStorage(FALLBACK_KEY, list)
        notifyHistoryChange()
      } catch { /* ignore */ }
      return
    }

    try {
      const db = getDB()
      if (!db) return
      const previous = await db.sql(`SELECT play_count FROM play_history WHERE song_id = ? LIMIT 1`, [track.id])
      const playCount = (Number(previous?.[0]?.play_count) || 0) + 1
      // 去重：删除同 song_id 旧记录
      await db.sql(`DELETE FROM play_history WHERE song_id = ?`, [track.id])
      // 限制最大条数
      await db.sql(`DELETE FROM play_history WHERE id NOT IN (SELECT id FROM play_history ORDER BY played_at DESC LIMIT ?)`, [LIMITS.MAX_HISTORY - 1])
      // 插入新记录
      await db.sql(
        `INSERT INTO play_history (
          song_id, name, artists, album, pic_url, duration, played_at, play_count,
          source, local_id, webdav_id, remote_url, webdav_base_url, webdav_username, file_name, relative_path, mime, file_size
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.song_id, entry.name, entry.artists, entry.album, entry.pic_url, entry.duration, entry.played_at, playCount,
          entry.source, entry.local_id, entry.webdav_id, entry.remote_url, entry.webdav_base_url, entry.webdav_username, entry.file_name,
          entry.relative_path, entry.mime, entry.file_size,
        ]
      )
      notifyHistoryChange()
    } catch (error) {
      debugLog('db', 'history add failed', { trackId: track.id, message: describeError(error) })
    }
  },

  /** 获取播放历史 */
  async list(limit: number = 200): Promise<HistoryEntry[]> {
    await ensureDB()
    const db = getDB()
    if (!db) {
      return getStorageJson<HistoryEntry[]>(FALLBACK_KEY, [])
    }
    try {
      const rows = await db.sql(
        `SELECT
          song_id, name, artists, album, pic_url, duration, played_at, play_count,
          source, local_id, webdav_id, remote_url, webdav_base_url, webdav_username, file_name, relative_path, mime, file_size
        FROM play_history ORDER BY played_at DESC LIMIT ?`,
        [limit]
      ) as unknown as HistoryRow[]
      return rows.map((r): HistoryEntry => ({
        id: r.song_id,
        name: r.name,
        artists: JSON.parse(r.artists || '[]'),
        album: JSON.parse(r.album || '{}'),
        picUrl: r.pic_url,
        pic_url: r.pic_url,
        duration: r.duration,
        dt: r.duration,
        playedAt: r.played_at,
        playCount: Number(r.play_count) || 1,
        source: r.source || undefined,
        localId: r.local_id || undefined,
        webdavId: r.webdav_id || undefined,
        remoteUrl: r.remote_url || undefined,
        webdavBaseUrl: r.webdav_base_url || undefined,
        webdavUsername: r.webdav_username || undefined,
        fileName: r.file_name || undefined,
        relativePath: r.relative_path || undefined,
        mime: r.mime || undefined,
        fileSize: r.file_size || 0,
      }))
    } catch (error) {
      debugLog('db', 'history list failed', { message: describeError(error) })
      return []
    }
  },

  /** 清空播放历史 */
  async clear(): Promise<void> {
    await ensureDB()
    const db = getDB()
    if (!db) {
      removeStorage(FALLBACK_KEY)
      notifyHistoryChange()
      return
    }
    try {
      await db.sql(`DELETE FROM play_history`)
      notifyHistoryChange()
    } catch (error) {
      debugLog('db', 'history clear failed', { message: describeError(error) })
    }
  },
}
