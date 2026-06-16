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

function extractCookie(raw = '') {
  return raw
    ? raw.split(';').map(s => s.trim()).filter(s => s.includes('=') && !/^(Path|Domain|Expires|Max-Age|HttpOnly|Secure|SameSite)/i.test(s)).join('; ')
    : ''
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
    return apiCookie
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
    if (cookie && cookie !== apiCookie) {
      apiCookie = cookie
      setStorage(API_COOKIE_KEY, apiCookie)
    }
  },
}
