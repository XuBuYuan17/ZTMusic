/**
 * 播放历史管理桥接层
 *
 * 职责：读取/清空本地播放历史。写入由 player.svelte.ts 通过
 * dbHistory.add() 统一管理（SQLite + localStorage fallback）。
 */

import { dbHistory } from '../db/history.ts'

/**
 * 清空播放历史
 */
export function clearHistory(): void {
  dbHistory.clear().catch(() => {})
}
