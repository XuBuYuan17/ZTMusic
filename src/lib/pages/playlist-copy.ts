/**
 * 歌单页的边界文案。
 *
 * 搜索与排序只作用于**已加载**的曲目，而详情里的曲目是分批加载的。
 * 这里把「已加载 / 全部」的差别写死在文案里，避免把局部结果描述成全量结果：
 * - 加载完：`没有匹配的歌曲`
 * - 还有未加载：明确说明只在已加载范围内匹配
 * - 一条都没有：`这个歌单还没有歌曲`
 */

export interface PlaylistEmptyInput {
  /** 详情里已加载的曲目数 */
  loadedCount: number
  /** 是否还有未加载的分页 */
  hasMore: boolean
}

export function playlistEmptyText({ loadedCount, hasMore }: PlaylistEmptyInput): string {
  if (loadedCount <= 0) return '这个歌单还没有歌曲'
  if (hasMore) return `已加载的 ${loadedCount} 首里没有匹配，继续下滑加载更多`
  return '没有匹配的歌曲'
}

export interface PlaylistCountInput {
  /** 匹配（过滤后）的曲目数 */
  visibleCount: number
  /** 已加载的曲目数 */
  loadedCount: number
  hasMore: boolean
}

export function playlistCountLabel({ visibleCount, loadedCount, hasMore }: PlaylistCountInput): string {
  const base = `匹配 ${visibleCount} 首，已加载 ${loadedCount} 首`
  return hasMore ? `${base}，还有未加载的歌曲` : base
}
