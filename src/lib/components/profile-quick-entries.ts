/**
 * 个人资料页的快捷入口定义。
 *
 * 主页与资料库概览共用这一份：数量、文案、目标都由这里决定，
 * 页面只负责提供数值和跳转回调，避免两端各写一套卡片后又慢慢跑偏。
 */
export type ProfileQuickId = 'favorites' | 'stats' | 'recent' | 'daily'

export interface ProfileQuickEntry {
  id: ProfileQuickId
  label: string
  title: string
  value: string
  icon: string
  onSelect: () => void
}

export interface ProfileQuickInput {
  /** 喜欢的音乐曲目数；未知时传 0 */
  likedCount: number
  /** 本地听歌统计摘要，空串表示还没有记录 */
  statsText: string
  statsError: boolean
  recentCount: number
  onOpenFavorites: () => void
  onOpenStats: () => void
  onOpenRecent: () => void
  onOpenDaily: () => void
}

export function buildProfileQuickEntries(input: ProfileQuickInput): ProfileQuickEntry[] {
  return [
    {
      id: 'favorites',
      label: 'FAVORITES',
      title: '喜欢的音乐',
      value: `${input.likedCount} 首`,
      icon: 'heart-filled',
      onSelect: input.onOpenFavorites,
    },
    {
      id: 'stats',
      label: 'ON THIS DEVICE',
      title: '本地听歌统计',
      value: input.statsError ? '统计暂不可用 · 点击重试' : (input.statsText || '开始记录你的聆听'),
      icon: 'music',
      onSelect: input.onOpenStats,
    },
    {
      id: 'recent',
      label: 'CONTINUE',
      title: '最近播放',
      value: `${input.recentCount} 首记录`,
      icon: 'clock',
      onSelect: input.onOpenRecent,
    },
    {
      id: 'daily',
      label: 'DAILY',
      title: '历史日推',
      value: '回看每天为你推送的歌',
      icon: 'calendar',
      onSelect: input.onOpenDaily,
    },
  ]
}
