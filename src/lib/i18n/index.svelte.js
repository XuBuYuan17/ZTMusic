import { zh } from './zh.js'
import { en } from './en.js'
import { getStorage, setStorage } from '../utils/storage.js'

const locales = { zh, en }
const missingKeyWarned = new Set()

export const i18n = $state({ locale: getStorage('locale', 'zh') })

export function setLocale(locale) {
  i18n.locale = locale
  setStorage('locale', locale)
}

export function t(key, fallback = key) {
  const dict = locales[i18n.locale]
  const value = dict?.[key]
  if (value == null) {
    // 只在开发模式提示，且每个 key 只提示一次，方便发现遗漏；行为不变（回退到 fallback/key）
    if (import.meta.env?.DEV && !missingKeyWarned.has(key)) {
      missingKeyWarned.add(key)
      console.warn(`[i18n] missing key: "${key}" for locale "${i18n.locale}"`)
    }
    return fallback
  }
  return value
}
