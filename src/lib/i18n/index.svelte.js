import { zh } from './zh.js'
import { en } from './en.js'

const locales = { zh, en }

function getLS(key, def) {
  try { return localStorage.getItem(key) || def } catch { return def }
}
function setLS(key, val) {
  try { localStorage.setItem(key, val) } catch {}
}

export const i18n = $state({ locale: getLS('locale', 'zh') })

export function setLocale(locale) {
  i18n.locale = locale
  setLS('locale', locale)
}

export function t(key, fallback = key) {
  const dict = locales[i18n.locale]
  return dict?.[key] ?? fallback
}
