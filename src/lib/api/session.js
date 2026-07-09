import { getStorage, removeStorage, setStorage } from '../utils/storage.js'

export const DEFAULT_API_BASE = 'https://music.xubuyuan.top'
export const DEV_PROXY_API_BASE = '/ncm-api'

const LEGACY_LOCAL_API_BASES = new Set(['http://localhost:3000', 'http://127.0.0.1:3000'])
const API_BASE_KEY = 'api_base'
const API_COOKIE_KEY = 'api_cookie'

function loadApiBase() {
  let base = getStorage(API_BASE_KEY, '')
  if (LEGACY_LOCAL_API_BASES.has(base)) {
    removeStorage(API_BASE_KEY)
    base = ''
  }
  return base || DEFAULT_API_BASE
}

export function extractCookie(raw = '') {
  return raw
    ? raw.split(';').map(s => s.trim()).filter(s => s.includes('=') && !/^(Path|Domain|Expires|Max-Age|HttpOnly|Secure|SameSite)/i.test(s)).join('; ')
    : ''
}

/** 合并两个 cookie 串：newCookie 的键覆盖 oldCookie 的同名键，保留 oldCookie 中未被提及的键 */
export function mergeCookies(oldCookie = '', newCookie = '') {
  const map = {}
  for (const part of oldCookie.split(';')) {
    const kv = part.trim()
    const eq = kv.indexOf('=')
    if (eq > 0) map[kv.slice(0, eq)] = kv.slice(eq + 1)
  }
  for (const part of newCookie.split(';')) {
    const kv = part.trim()
    const eq = kv.indexOf('=')
    if (eq > 0) map[kv.slice(0, eq)] = kv.slice(eq + 1)
  }
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ')
}

export function normalizeCookieForRequest(cookieString) {
  if (!cookieString) return ''
  const parts = cookieString.split(';').map(s => s.trim()).filter(s => s.includes('='))
  if (!parts.some(part => part.startsWith('MUSIC_U='))) return ''
  if (!parts.some(part => part.startsWith('os='))) {
    parts.push('os=pc')
  }
  return parts.join('; ')
}

let apiBase = loadApiBase()
let apiCookie = getStorage(API_COOKIE_KEY, '') || ''

export const apiSession = {
  getBase() {
    return apiBase
  },

  setBase(url) {
    setStorage(API_BASE_KEY, url)
    apiBase = url
  },

  getCookie() {
    return normalizeCookieForRequest(apiCookie)
  },

  setCookie(cookie) {
    apiCookie = cookie || ''
    setStorage(API_COOKIE_KEY, apiCookie)
  },

  clearCookie() {
    apiCookie = ''
    removeStorage(API_COOKIE_KEY)
  },

  saveCookieFromResponse(data, rawCookie = '') {
    const raw = rawCookie || data?.cookie || data?.data?.cookie || ''
    const cookie = extractCookie(raw)
    if (!cookie || cookie === apiCookie) return
    // 合并式更新：响应 cookie 覆盖旧值中同名键，保留旧值中未被提及的键
    const merged = mergeCookies(apiCookie, cookie)
    // 只有合并后仍含 MUSIC_U 才写入，防止意外抹掉登录态
    if (normalizeCookieForRequest(merged)) {
      apiCookie = merged
      setStorage(API_COOKIE_KEY, apiCookie)
    }
  },
}
