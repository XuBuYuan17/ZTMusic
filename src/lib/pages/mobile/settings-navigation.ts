export const SETTINGS_CATEGORIES = [
  { id: 'appearance', title: '外观', icon: 'sun' },
  { id: 'playback', title: '播放与歌词', icon: 'lyrics' },
  { id: 'sources', title: '音源管理', icon: 'music' },
  { id: 'android', title: 'Android 功能', icon: 'grid' },
  { id: 'general', title: '通用', icon: 'settings' },
  { id: 'data', title: '数据与账号', icon: 'user' },
  { id: 'advanced', title: '高级', icon: 'folder' },
  { id: 'about', title: '关于', icon: 'info' },
] as const

export type SettingsCategory = typeof SETTINGS_CATEGORIES[number]['id']

export function settingsCategory(view: string): SettingsCategory | null {
  return SETTINGS_CATEGORIES.find(item => view === `settings-${item.id}`)?.id ?? null
}

export function settingsCategories(android: boolean) {
  return SETTINGS_CATEGORIES.filter(item => android || item.id !== 'android')
}

export function settingsSummaries(input: {
  theme: string; quality: string; pluginCount: number; locale: string; loggedIn: boolean; version: string
}): Record<SettingsCategory, string> {
  return {
    appearance: input.theme === 'light' ? '浅色' : '深色',
    playback: input.quality,
    sources: `${input.pluginCount} 个已启用`,
    android: '歌词与权限',
    general: input.locale === 'en' ? 'English' : '中文',
    data: input.loggedIn ? '已登录' : '未登录',
    advanced: 'API 与缓存',
    about: input.version,
  }
}
