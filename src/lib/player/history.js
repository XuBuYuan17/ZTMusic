/**
 * 播放历史管理（localStorage 桥接层）
 *
 * 职责：读取/清空本地播放历史。写入由 player/store.svelte.js 通过
 * dbHistory.add() 统一管理（SQLite + localStorage fallback）。
 */

import { getStorageJson, removeStorage } from '../utils/storage.js'
import { STORAGE_KEYS } from '../utils/constants.js'
import { dbHistory } from '../db/history.js'

/**
 * 获取播放历史
 * @returns {Array}
 */
export function getLocalHistory() {
  return getStorageJson(STORAGE_KEYS.LOCAL_HISTORY, [])
}

/**
 * 清空播放历史（localStorage + SQLite 双清）
 */
export function clearHistory() {
  removeStorage(STORAGE_KEYS.LOCAL_HISTORY)
  dbHistory.clear().catch(() => {})
}
