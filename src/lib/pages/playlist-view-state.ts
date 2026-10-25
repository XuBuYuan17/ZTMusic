/**
 * 歌单页的「访问状态」暂存：搜索词、排序键、排序方向。
 *
 * 布局切换会销毁整个外壳（MobileApp / DesktopPageHost），组件里用 $state 保存的
 * 这些值会随之丢失。这里按资源 key 存放，属于会话内状态、不落任何持久化：
 * 重新挂载时恢复，换资源时天然拿到空值（新资源不会继承上一个资源的筛选）。
 *
 * 资源数据（曲目、分页游标）不在这里，仍在 router 的详情缓存里。
 */
import type { PlaylistSortDir, PlaylistSortKey } from './playlist-sort.ts'

export interface PlaylistViewState {
  search: string
  sort: PlaylistSortKey
  dir: PlaylistSortDir
}

export type PlaylistViewKind = 'playlist' | 'album' | 'recommendation'

// ponytail: 只保留最近 8 个资源；再大的浏览深度依赖重新筛选，不做按内存预算淘汰。
const LIMIT = 8
const states = new Map<string, PlaylistViewState>()

export function playlistViewKey(kind: PlaylistViewKind, id: unknown): string {
  if (id === null || id === undefined || id === '') return ''
  return `${kind}:${String(id)}`
}

/** 没有记录时返回 undefined —— 调用方据此使用默认值，不会继承别的资源 */
export function recallPlaylistView(key: string): PlaylistViewState | undefined {
  return key ? states.get(key) : undefined
}

export function rememberPlaylistView(key: string, state: PlaylistViewState): void {
  if (!key) return
  states.set(key, state)
  while (states.size > LIMIT) {
    const oldest = states.keys().next().value
    if (oldest === undefined || oldest === key) break
    states.delete(oldest)
  }
}

/** 自检用：清空全部记录 */
export function clearPlaylistViewStates(): void {
  states.clear()
}
