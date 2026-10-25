/**
 * 歌单页的状态判定。
 *
 * 六种展示状态统一由这里决定，页面只负责按状态渲染：
 * - initial-loading：还没有详情（首屏骨架）
 * - failed：详情都没拿到（整页失败，仍可返回）
 * - missing：没有详情、不在加载、也没有报错（兜底空态）
 * - header-only：详情到了、曲目还在补（头部 + 骨架）
 * - empty：详情到了，歌单本身就是空的
 * - batch-failed：详情到了，但首批曲目请求失败（保留头部）
 * - ready：有曲目可展示（追加失败只影响底部行，不影响已显示内容）
 *
 * 底部另有一套：hidden / appending / append-failed / more。
 * 两套分开是为了「重试只重试对应失败过程」：整页失败重进入详情，曲目失败重试当前批次。
 */

export type PlaylistDisplayState =
  | 'initial-loading'
  | 'failed'
  | 'missing'
  | 'header-only'
  | 'empty'
  | 'batch-failed'
  | 'ready'

export interface PlaylistDisplayInput {
  loading: boolean
  error: string
  /** 是否已拿到详情（含卡片带来的预览） */
  hasDetail: boolean
  /** 详情里已加载的曲目数 */
  loadedCount: number
}

export function playlistDisplayState(input: PlaylistDisplayInput): PlaylistDisplayState {
  const { loading, error, hasDetail, loadedCount } = input
  if (!hasDetail) {
    if (error) return 'failed'
    // 没详情、没在加载、也没报错：兜底成「找不到详情」，不要一直停在骨架
    return loading ? 'initial-loading' : 'missing'
  }
  // 已有曲目时，任何刷新/追加错误都不该把页面打回空态
  if (loadedCount > 0) return 'ready'
  if (error) return 'batch-failed'
  return loading ? 'header-only' : 'empty'
}

export type PlaylistFooterState = 'hidden' | 'appending' | 'append-failed' | 'more'

export interface PlaylistFooterInput {
  loadingMore: boolean
  error: string
  hasMore: boolean
  /** 详情里本身有曲目（筛选后为空时仍要显示底部行） */
  hasLoadedTracks: boolean
}

export function playlistFooterState(input: PlaylistFooterInput): PlaylistFooterState {
  if (!input.hasLoadedTracks) return 'hidden'
  if (input.error) return 'append-failed'
  if (input.loadingMore) return 'appending'
  return input.hasMore ? 'more' : 'hidden'
}
