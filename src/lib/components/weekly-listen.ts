/**
 * 本周常听的纯逻辑：排名行、展开切片、数据状态。
 *
 * 单独抽出来是为了能把「排名与数据顺序一致」「请求失败不等于没有听歌」
 * 这两条用测试固定下来，而不是散在模板的 #if 里。
 */
import { formatPlayCount } from '../format.ts'

export interface WeeklyListenTrack {
  id?: unknown
  name?: unknown
  playCount?: unknown
  ar?: unknown
  artists?: unknown
}

export interface WeeklyListenRow {
  /** 在完整列表中的下标，播放时用它，不能用可见切片的下标 */
  index: number
  /** 名次，与数据顺序一一对应 */
  rank: number
  key: string
  title: string
  subtitle: string
}

export type WeeklyListenState = 'failed' | 'loading' | 'empty' | 'ready'

export function weeklyListenState(input: { failed: boolean; loading: boolean; count: number }): WeeklyListenState {
  if (input.failed) return 'failed'
  if (input.loading) return 'loading'
  return input.count > 0 ? 'ready' : 'empty'
}

export function weeklyListenRows(
  tracks: WeeklyListenTrack[],
  options: { limit?: number; expanded?: boolean } = {},
): WeeklyListenRow[] {
  const { limit = 8, expanded = false } = options
  const visible = expanded ? tracks : tracks.slice(0, limit)
  return visible.map((track, position) => ({
    index: position,
    // 名次取完整列表里的位置：切片的第 0 条就是第 1 名
    rank: position + 1,
    key: `${String(track.id ?? '')}#${position}`,
    title: String(track.name ?? ''),
    subtitle: `${formatPlayCount(typeof track.playCount === 'number' ? track.playCount : 0) || '0'} 次播放`,
  }))
}

export function weeklyListenCanExpand(count: number, limit = 8): boolean {
  return count > limit
}
