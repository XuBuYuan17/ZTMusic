import { QUALITY_ORDER, STORAGE_KEYS } from './constants.ts'
import { getStorage, setStorage } from './storage.ts'

export const SETTINGS_SCHEMA_KEY = 'settings_schema_version'
export const SETTINGS_SCHEMA_VERSION = 4

export const SETTING_DEFAULTS: Record<string, string> = {
  'default_page': 'home',
  'layout_mode': 'auto',
  'lyrics_blur_effect': 'true',
  'lyrics_text_blur_effect': 'true',
  'wallpaper_video_play': 'true',
  'accent_theme': 'red',
  [STORAGE_KEYS.RESTORE_SESSION]: 'true',
  [STORAGE_KEYS.VOLUME]: '0.8',
  [STORAGE_KEYS.MODE]: 'list',
  [STORAGE_KEYS.PREFERRED_QUALITY]: 'standard',
}

const BOOLEAN_KEYS = new Set<string>([
  'lyrics_blur_effect',
  'lyrics_text_blur_effect',
  'wallpaper_video_play',
  STORAGE_KEYS.RESTORE_SESSION,
])

/** setSetting 的入参：布尔开关收 'true'/'false'，音量收 number，其余为字符串 */
export type SettingValue = string | number | boolean

function hasStorageKey(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

function normalizeBoolean(value: SettingValue | null | undefined, fallback: string = 'true'): string {
  if (value === true || value === 'true') return 'true'
  if (value === false || value === 'false') return 'false'
  return fallback
}

function normalizeVolume(value: SettingValue | null | undefined): string {
  const num = Number.parseFloat(String(value))
  if (!Number.isFinite(num)) return SETTING_DEFAULTS[STORAGE_KEYS.VOLUME] ?? '0.8'
  return String(Math.min(Math.max(num, 0), 1))
}

function oneOf(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === 'string' && allowed.includes(value)
}

function normalizeMode(value: SettingValue | null | undefined): string {
  return oneOf(value, ['list', 'shuffle', 'repeat']) ? value : (SETTING_DEFAULTS[STORAGE_KEYS.MODE] ?? 'list')
}

function normalizeQuality(value: SettingValue | null | undefined): string {
  return oneOf(value, QUALITY_ORDER) ? value : (SETTING_DEFAULTS[STORAGE_KEYS.PREFERRED_QUALITY] ?? 'standard')
}

function normalizeDefaultPage(value: SettingValue | null | undefined): string {
  return oneOf(value, ['home', 'explore', 'library']) ? value : (SETTING_DEFAULTS.default_page ?? 'home')
}

function normalizeLayoutMode(value: SettingValue | null | undefined): string {
  return oneOf(value, ['auto', 'pc', 'mobile']) ? value : (SETTING_DEFAULTS.layout_mode ?? 'auto')
}

function normalizeAccentTheme(value: SettingValue | null | undefined): string {
  return oneOf(value, ['red', 'berry', 'violet', 'blue', 'teal', 'orange', 'cover'])
    ? value
    : (SETTING_DEFAULTS.accent_theme ?? 'red')
}

function normalizeSetting(key: string, value: SettingValue | null | undefined): string {
  if (BOOLEAN_KEYS.has(key)) return normalizeBoolean(value, SETTING_DEFAULTS[key] ?? 'true')
  if (key === STORAGE_KEYS.VOLUME) return normalizeVolume(value)
  if (key === STORAGE_KEYS.MODE) return normalizeMode(value)
  if (key === STORAGE_KEYS.PREFERRED_QUALITY) return normalizeQuality(value)
  if (key === 'default_page') return normalizeDefaultPage(value)
  if (key === 'layout_mode') return normalizeLayoutMode(value)
  if (key === 'accent_theme') return normalizeAccentTheme(value)
  return value == null ? (SETTING_DEFAULTS[key] ?? '') : String(value)
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
