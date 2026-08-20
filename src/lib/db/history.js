/**
 * 播放历史存储（SQLite）
 * 替代 player/history.js 中的 localStorage 逻辑
 *
 * 用法：
 *   import { dbHistory } from '../db/history.js'
 *   await dbHistory.add(track)
 *   const list = await dbHistory.list()
 */

import { getDB, isReady } from './init.js'
import { getStorageJson, removeStorage, setStorage } from '../utils/storage.js'
import { normalizeImageUrl } from '../utils/image.js'
import { LIMITS, STORAGE_KEYS } from '../utils/constants.js'

const FALLBACK_KEY = STORAGE_KEYS.LOCAL_HISTORY
const HISTORY_CHANGE_EVENT = 'local-listening-history-change'

function notifyHistoryChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HISTORY_CHANGE_EVENT))
}

function isAvailable() {
  return isReady() && getDB()
}

export const dbHistory = {
  /**
   * 添加歌曲到播放历史
   * @param {object} track
   */
  async add(track) {
    if (!track || !track.id) return

    const album = track.al || track.album || {}
    const entry = {
      song_id: track.id,
      name: track.name || '',
      artists: JSON.stringify(track.ar || track.artists || []),
      album: JSON.stringify(album),
      pic_url: normalizeImageUrl(album.picUrl || track.coverImgUrl || track.picUrl || ''),
      duration: track.dt || track.duration || 0,
      played_at: Date.now(),
    }

    if (!isAvailable()) {
      // fallback: localStorage
      try {
        let list = getStorageJson(FALLBACK_KEY, [])
        const previous = list.find(t => t.id === track.id)
        list = list.filter(t => t.id !== track.id)
        list.unshift({
          id: track.id, name: track.name, artists: track.ar || track.artists || [],
          album, picUrl: entry.pic_url, duration: entry.duration, playedAt: Date.now(),
          playCount: (Number(previous?.playCount) || 0) + 1,
        })
        if (list.length > LIMITS.MAX_HISTORY) list.length = LIMITS.MAX_HISTORY
        setStorage(FALLBACK_KEY, list)
        notifyHistoryChange()
      } catch { /* ignore */ }
      return
    }

    try {
      const db = getDB()
      const previous = await db.sql(`SELECT play_count FROM play_history WHERE song_id = ? LIMIT 1`, [track.id])
      const playCount = (Number(previous?.[0]?.play_count) || 0) + 1
      // 去重：删除同 song_id 旧记录
      await db.sql(`DELETE FROM play_history WHERE song_id = ?`, [track.id])
      // 限制最大条数
      await db.sql(`DELETE FROM play_history WHERE id NOT IN (SELECT id FROM play_history ORDER BY played_at DESC LIMIT ?)`, [LIMITS.MAX_HISTORY - 1])
      // 插入新记录
      await db.sql(
        `INSERT INTO play_history (song_id, name, artists, album, pic_url, duration, played_at, play_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.song_id, entry.name, entry.artists, entry.album, entry.pic_url, entry.duration, entry.played_at, playCount]
      )
      notifyHistoryChange()
    } catch {
      // fallback silently
    }
  },

  /**
   * 获取播放历史
   * @param {number} [limit=200]
   * @returns {Promise<Array>}
   */
  async list(limit = 200) {
    if (!isAvailable()) {
      return getStorageJson(FALLBACK_KEY, [])
    }
    try {
      const db = getDB()
      const rows = await db.sql(
        `SELECT song_id, name, artists, album, pic_url, duration, played_at, play_count FROM play_history ORDER BY played_at DESC LIMIT ?`,
        [limit]
      )
      return rows.map(r => ({
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
      }))
    } catch {
      return getStorageJson(FALLBACK_KEY, [])
    }
  },

  /**
   * 清空播放历史
   */
  async clear() {
    if (!isAvailable()) {
      removeStorage(FALLBACK_KEY)
      notifyHistoryChange()
      return
    }
    try {
      const db = getDB()
      await db.sql(`DELETE FROM play_history`)
      notifyHistoryChange()
    } catch { /* ignore */ }
  },
}
