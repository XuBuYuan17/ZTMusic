import { zh } from './zh.js'
import { en } from './en.js'
import { getStorage, setStorage } from '../utils/storage.js'

const locales = { zh, en }

export const i18n = $state({ locale: getStorage('locale', 'zh') })

export function setLocale(locale) {
  i18n.locale = locale
  setStorage('locale', locale)
}

export function t(key, fallback = key) {
  const dict = locales[i18n.locale]
  return dict?.[key] ?? fallback
}
