import { QUALITY_ORDER, STORAGE_KEYS } from './constants.js'
import { getStorage, setStorage } from './storage.js'

export const SETTINGS_SCHEMA_KEY = 'settings_schema_version'
export const SETTINGS_SCHEMA_VERSION = 2

export const SETTING_DEFAULTS = {
  'default_page': 'home',
  'lyrics_blur_effect': 'true',
  'lyrics_text_blur_effect': 'true',
  [STORAGE_KEYS.RESTORE_SESSION]: 'true',
  [STORAGE_KEYS.VOLUME]: '0.8',
  [STORAGE_KEYS.MODE]: 'list',
  [STORAGE_KEYS.PREFERRED_QUALITY]: 'standard',
}

const BOOLEAN_KEYS = new Set([
  'lyrics_blur_effect',
  'lyrics_text_blur_effect',
  STORAGE_KEYS.RESTORE_SESSION,
])

function hasStorageKey(key) {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

function normalizeBoolean(value, fallback = 'true') {
  if (value === true || value === 'true') return 'true'
  if (value === false || value === 'false') return 'false'
  return fallback
}

function normalizeVolume(value) {
  const num = Number.parseFloat(value)
  if (!Number.isFinite(num)) return SETTING_DEFAULTS[STORAGE_KEYS.VOLUME]
  return String(Math.min(Math.max(num, 0), 1))
}

function normalizeMode(value) {
  return ['list', 'shuffle', 'repeat'].includes(value) ? value : SETTING_DEFAULTS[STORAGE_KEYS.MODE]
}

function normalizeQuality(value) {
  return QUALITY_ORDER.includes(value) ? value : SETTING_DEFAULTS[STORAGE_KEYS.PREFERRED_QUALITY]
}

function normalizeDefaultPage(value) {
  return ['home', 'explore', 'library'].includes(value) ? value : SETTING_DEFAULTS.default_page
}

function normalizeSetting(key, value) {
  if (BOOLEAN_KEYS.has(key)) return normalizeBoolean(value, SETTING_DEFAULTS[key])
  if (key === STORAGE_KEYS.VOLUME) return normalizeVolume(value)
  if (key === STORAGE_KEYS.MODE) return normalizeMode(value)
  if (key === STORAGE_KEYS.PREFERRED_QUALITY) return normalizeQuality(value)
  if (key === 'default_page') return normalizeDefaultPage(value)
  return value == null ? SETTING_DEFAULTS[key] : String(value)
}

/**
 * 初始化并迁移设置。仅处理偏好配置，不迁移播放队列/进度等运行时状态。
 * @returns {{ from: number, to: number, changed: boolean }}
 */
export function migrateSettings() {
  const from = Number.parseInt(getStorage(SETTINGS_SCHEMA_KEY, '0'), 10) || 0
  let changed = from < SETTINGS_SCHEMA_VERSION

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

export function getSetting(key, fallback = SETTING_DEFAULTS[key] ?? '') {
  return normalizeSetting(key, getStorage(key, fallback))
}

export function setSetting(key, value) {
  const normalized = normalizeSetting(key, value)
  setStorage(key, normalized)
  return normalized
}

export function getBooleanSetting(key, fallback = SETTING_DEFAULTS[key] ?? 'false') {
  return getSetting(key, fallback) === 'true'
}

export function setBooleanSetting(key, value) {
  return setSetting(key, value ? 'true' : 'false')
}
