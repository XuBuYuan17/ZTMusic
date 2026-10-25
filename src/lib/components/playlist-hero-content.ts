/**
 * PlaylistHero 的纯决策：
 * - 播放按钮此刻是「暂停/继续」还是「播放全部」
 * - 元信息行的文案（创建者 · 数量 · 时长 · 加载状态）
 * - 创建者名、时长的格式化
 *
 * 这里只做字符串与状态推导，不碰 DOM、不读播放器单例：调用方把现有
 * `player.playing` / `player.id` 的判定结果作为入参传进来，所以暂停/继续的
 * 语义可以被单测固定住。组件交给这些函数渲染，抽取或重构不会悄悄改含义。
 */

export interface HeroPlaybackInput {
  /** 当前播放曲目是否属于这个详情（决定按钮是「切换当前曲目」还是「播放全部」） */
  containsCurrentTrack: boolean
  /** 播放器是否正在播放（调用方传 player.playing 的判定结果） */
  playing: boolean
  /** 过滤后可见的曲目数 */
  visibleCount: number
  /** 窄布局用更短的按钮文案 */
  compact?: boolean
}

export interface HeroPlayback {
  /** toggle: 暂停/继续当前曲目；playAll: 从头播放本详情 */
  mode: 'toggle' | 'playAll'
  /** 是否处于「正在播放本详情」状态 */
  pressed: boolean
  /** 主按钮文案（窄布局更短） */
  label: string
  /** 操作面板里的文案（面板只在窄布局出现，沿用完整说法） */
  menuLabel: string
  icon: 'play' | 'pause'
  disabled: boolean
}

export function heroPlayback(input: HeroPlaybackInput): HeroPlayback {
  const { containsCurrentTrack, playing, visibleCount, compact = false } = input
  // 注意：正在播放的可能是别的详情里的歌，只有「当前曲目属于本详情」才算本详情的播放态
  const pressed = containsCurrentTrack && playing
  const idleLabel = compact ? '播放' : '播放全部'
  return {
    mode: containsCurrentTrack ? 'toggle' : 'playAll',
    pressed,
    label: pressed ? '暂停' : idleLabel,
    menuLabel: pressed ? '暂停' : '播放全部',
    icon: pressed ? 'pause' : 'play',
    disabled: visibleCount === 0 && !containsCurrentTrack,
  }
}

export function heroCreatorName(creator: unknown): string {
  if (typeof creator === 'string') return creator
  const record = typeof creator === 'object' && creator !== null && !Array.isArray(creator)
    ? creator as Record<string, unknown>
    : null
  if (typeof record?.nickname === 'string') return record.nickname
  if (typeof record?.name === 'string') return record.name
  return ''
}

export function heroDurationText(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60000)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`
}

export interface HeroMetaInput {
  creatorName: string
  totalCount: number
  loading: boolean
  totalDuration: number
  loadingMore: boolean
}

/** 与模板原先的拼接顺序保持一致（含创建者为空时的前缀行为） */
export function heroMetaText(input: HeroMetaInput): string {
  let text = input.creatorName
  if (input.totalCount) text += ` · ${input.totalCount} 首`
  else if (input.loading) text += ' · 正在加载歌曲'
  if (input.totalDuration) text += ` · ${heroDurationText(input.totalDuration)}`
  if (input.loadingMore) text += ' · 正在补全'
  return text
}
