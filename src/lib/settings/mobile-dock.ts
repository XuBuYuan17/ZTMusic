export const DOCK_TABS = [
  { id: 'explore', label: '发现', icons: [{ value: 'compass', label: '指南针' }, { value: 'home', label: '首页' }] },
  { id: 'search', label: '搜索', icons: [{ value: 'search', label: '放大镜' }] },
  { id: 'library', label: '资料库', icons: [{ value: 'music', label: '音符' }, { value: 'grid', label: '网格' }] },
  { id: 'recent', label: '最近播放', icons: [{ value: 'clock', label: '时钟' }] },
  { id: 'localMusic', label: '本地音乐', icons: [{ value: 'folder', label: '文件夹' }, { value: 'music', label: '音符' }] },
  { id: 'settings', label: '设置', icons: [{ value: 'settings', label: '齿轮' }] },
] as const

export type DockTabId = typeof DOCK_TABS[number]['id']
export type DockItem = { id: DockTabId; label: string; icon: string }
export type MobileDockConfig = { layout: 'classic' | 'floating'; labels: boolean; tabs: DockTabId[]; icons: Partial<Record<DockTabId, string>> }
export const DEFAULT_MOBILE_DOCK: MobileDockConfig = { layout: 'classic', labels: true, tabs: ['explore', 'search', 'library', 'settings'], icons: {} }
export const MAX_DOCK_TABS = 4

export function normalizeMobileDock(value: unknown): MobileDockConfig {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const allowed = new Set<string>(DOCK_TABS.map(tab => tab.id))
  const supplied = Array.isArray(data.tabs) ? data.tabs.filter((id): id is DockTabId => typeof id === 'string' && allowed.has(id)) : DEFAULT_MOBILE_DOCK.tabs
  const tabs: DockTabId[] = []
  for (const id of supplied) if (!tabs.includes(id) && (id === 'settings' || tabs.filter(tab => tab !== 'settings').length < MAX_DOCK_TABS - 1)) tabs.push(id)
  if (!tabs.some(id => id !== 'settings')) tabs.unshift('explore')
  if (!tabs.includes('settings')) tabs.push('settings')
  const rawIcons = data.icons && typeof data.icons === 'object' && !Array.isArray(data.icons) ? data.icons as Record<string, unknown> : {}
  const icons: MobileDockConfig['icons'] = {}
  for (const tab of DOCK_TABS) {
    const selected = rawIcons[tab.id]
    if (typeof selected === 'string' && tab.icons.some(icon => icon.value === selected)) icons[tab.id] = selected
  }
  return { layout: data.layout === 'floating' ? 'floating' : 'classic', labels: data.labels !== false, tabs, icons }
}

export function toggleDockTab(config: MobileDockConfig, id: DockTabId): MobileDockConfig | null {
  if (id === 'settings') return null
  const selected = config.tabs.includes(id)
  const others = config.tabs.filter(tab => tab !== 'settings' && tab !== id)
  if (selected && !others.length) return null
  if (!selected && config.tabs.length >= MAX_DOCK_TABS) return null
  const tabs = config.tabs.filter(tab => tab !== id)
  if (!selected) tabs.splice(tabs.indexOf('settings'), 0, id)
  return normalizeMobileDock({ ...config, tabs })
}

export function moveDockTab(config: MobileDockConfig, id: DockTabId, target: DockTabId): MobileDockConfig | null {
  const from = config.tabs.indexOf(id)
  const to = config.tabs.indexOf(target)
  if (from < 0 || to < 0 || from === to) return null
  const tabs = [...config.tabs]
  tabs.splice(from, 1)
  tabs.splice(to, 0, id)
  return normalizeMobileDock({ ...config, tabs })
}

export function buildDockItems(config: MobileDockConfig): DockItem[] {
  return config.tabs.map(id => {
    const tab = DOCK_TABS.find(item => item.id === id)!
    return { id, label: tab.label, icon: config.icons[id] || tab.icons[0].value }
  })
}
