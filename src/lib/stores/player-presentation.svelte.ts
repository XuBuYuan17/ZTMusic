export type PlayerTheme = 'card' | 'vinyl'

export const PLAYER_THEME_OPTIONS = [
  { value: 'card', label: '卡片封面', icon: 'music' },
  { value: 'vinyl', label: '黑胶唱片', icon: 'disc' },
] as const

export const playerPresentation = $state<{ theme: PlayerTheme; showTranslation: boolean }>({
  theme: 'card',
  showTranslation: true,
})
