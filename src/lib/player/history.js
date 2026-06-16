/**
 * 播放历史管理
 *
 * 职责：管理 localStorage 中的本地播放历史记录。
 * 播放历史用于"最近播放"页面，切歌时自动追加。
 */

import { getStorageJson, removeStorage, setStorage } from '../utils/storage.js'
import { normalizeImageUrl } from '../utils/image.js'
import { LIMITS, STORAGE_KEYS } from '../utils/constants.js'

/**
 * 添加歌曲到播放历史（去重，保留最新记录）
 * @param {object} track - 经过 compactTrack 处理后的曲目对象
 */
export function addLocalHistory(track) {
  if (!track || !track.id) return
  try {
    const key = STORAGE_KEYS.LOCAL_HISTORY
    let list = getStorageJson(key, [])
    // 去重
    list = list.filter(t => t.id !== track.id)
    // 插入到头部
    const album = track.al || track.album || {}
    const entry = {
      id: track.id,
      name: track.name,
      artists: track.ar || track.artists || [],
      album,
      picUrl: normalizeImageUrl(album.picUrl || track.coverImgUrl || track.picUrl || ''),
      duration: track.dt || track.duration || 0,
      playedAt: Date.now(),
    }
    list.unshift(entry)
    // 限制最大条数
    if (list.length > LIMITS.MAX_HISTORY) list.length = LIMITS.MAX_HISTORY
    setStorage(key, list)
  } catch {
    // 静默失败
  }
}

/**
 * 获取播放历史
 * @returns {Array}
 */
export function getLocalHistory() {
  return getStorageJson(STORAGE_KEYS.LOCAL_HISTORY, [])
}

/**
 * 清空播放历史
 */
export function clearHistory() {
  removeStorage(STORAGE_KEYS.LOCAL_HISTORY)
}
