import { SETTING_DEFAULTS, storedSettingDefinition } from '../settings/definitions.ts'
import { getStorage, setStorage } from './storage.ts'
export { SETTING_DEFAULTS }

export const SETTINGS_SCHEMA_KEY = 'settings_schema_version'
export const SETTINGS_SCHEMA_VERSION = 4

/** setSetting 的入参：布尔开关收 'true'/'false'，音量收 number，其余为字符串 */
export type SettingValue = string | number | boolean

function hasStorageKey(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

function normalizeSetting(key: string, value: SettingValue | null | undefined): string {
  const definition = storedSettingDefinition(key)
  if (!definition) return value == null ? '' : String(value)
  if (definition.kind === 'boolean') {
    if (value === true || value === 'true') return 'true'
    if (value === false || value === 'false') return 'false'
    return definition.defaultValue
  }
  if (definition.kind === 'number') {
    const number = Number.parseFloat(String(value))
    return Number.isFinite(number) ? String(Math.min(Math.max(number, definition.min), definition.max)) : definition.defaultValue
  }
  return typeof value === 'string' && definition.options.some(option => option.value === value) ? value : definition.defaultValue
}

/**
 * 初始化并迁移设置。仅处理偏好配置，不迁移播放队列/进度等运行时状态。
 */
export function migrateSettings(): { from: number; to: number; changed: boolean } {
  const from = Number.parseInt(getStorage(SETTINGS_SCHEMA_KEY, '0'), 10) || 0
  // 幂等：只在真的写入/归一化时才置 true，避免仅版本号变动导致 UI 无谓刷新
  let changed = false

  for (const [key, fallback] of Object.entries(SETTING_DEFAULTS)) {
    if (!hasStorageKey(key)) {
      setStorage(key, fallback)
      changed = true
      continue
    }
    const current = getStorage(key, fallback)
    const normalized = normalizeSetting(key, current)
    if (normalized !== current) {
      setStorage(key, normalized)
      changed = true
    }
  }

  if (from !== SETTINGS_SCHEMA_VERSION) {
    setStorage(SETTINGS_SCHEMA_KEY, SETTINGS_SCHEMA_VERSION)
  }

  return { from, to: SETTINGS_SCHEMA_VERSION, changed }
}

export function getSetting(key: string, fallback: string = SETTING_DEFAULTS[key] ?? ''): string {
  return normalizeSetting(key, getStorage(key, fallback))
}

export function setSetting(key: string, value: SettingValue): string {
  const normalized = normalizeSetting(key, value)
  setStorage(key, normalized)
  return normalized
}

export function getBooleanSetting(key: string, fallback: string = SETTING_DEFAULTS[key] ?? 'false'): boolean {
  return getSetting(key, fallback) === 'true'
}

export function setBooleanSetting(key: string, value: boolean): string {
  return setSetting(key, value ? 'true' : 'false')
}
