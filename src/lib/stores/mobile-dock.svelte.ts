import { DEFAULT_MOBILE_DOCK, normalizeMobileDock, toggleDockTab, type DockTabId, type MobileDockConfig } from '../settings/mobile-dock.ts'

const KEY = 'mobile_dock_config'
function load(): MobileDockConfig {
  try { return normalizeMobileDock(JSON.parse(localStorage.getItem(KEY) || 'null')) }
  catch { return normalizeMobileDock(DEFAULT_MOBILE_DOCK) }
}

let config = $state<MobileDockConfig>(load())
let error = $state('')
function save(next: MobileDockConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    config = next
    error = ''
  } catch { error = '设置保存失败，请检查存储空间' }
}

export const mobileDock = {
  get config() { return config },
  get error() { return error },
  setLayout(layout: MobileDockConfig['layout']) { save(normalizeMobileDock({ ...config, layout })) },
  setLabels(labels: boolean) { save(normalizeMobileDock({ ...config, labels })) },
  toggleTab(id: DockTabId) { const next = toggleDockTab(config, id); if (next) save(next) },
  setIcon(id: DockTabId, icon: string) { save(normalizeMobileDock({ ...config, icons: { ...config.icons, [id]: icon } })) },
  reset() { save(normalizeMobileDock(DEFAULT_MOBILE_DOCK)) },
}
