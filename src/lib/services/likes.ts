/**
 * 「喜欢」状态变化的事件。
 *
 * 取消喜欢发生在歌曲菜单里，喜欢页需要据此刷新列表与计数。
 * 沿用项目既有的 window 事件约定（PLAYLIST_CHANGE / LISTENING_CHANGE），
 * 不额外引入事件总线。
 */
import type { SongId } from '../types/music.ts'

export const LIKE_CHANGE = 'local-like-change'

export function notifyLikeChange(trackId: SongId): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(LIKE_CHANGE, { detail: { id: trackId } }))
}
