import { getStorage, removeStorage, setStorage } from '../utils/storage.ts'
import type { ApiSession } from '../types/api.ts'

export const DEFAULT_API_BASE = 'https://music.xubuyuan.top'
export const DEV_PROXY_API_BASE = '/ncm-api'

const LEGACY_LOCAL_API_BASES = new Set(['http://localhost:3000', 'http://127.0.0.1:3000'])
const API_BASE_KEY = 'api_base'
const API_COOKIE_KEY = 'api_cookie'

function loadApiBase(): string {
  let base = getStorage(API_BASE_KEY, '')
  if (LEGACY_LOCAL_API_BASES.has(base)) {
    removeStorage(API_BASE_KEY)
    base = ''
  }
  return base || DEFAULT_API_BASE
}

export function extractCookie(raw: string = ''): string {
  return raw
    ? raw.split(';').map(s => s.trim()).filter(s => s.includes('=') && !/^(Path|Domain|Expires|Max-Age|HttpOnly|Secure|SameSite)/i.test(s)).join('; ')
    : ''
}

/** 合并两个 cookie 串：newCookie 的键覆盖 oldCookie 的同名键，保留 oldCookie 中未被提及的键 */
export function mergeCookies(oldCookie: string = '', newCookie: string = ''): string {
  const map: Record<string, string> = {}
  for (const part of oldCookie.split(';')) {
    const kv = part.trim()
    const eq = kv.indexOf('=')
    if (eq > 0) map[kv.slice(0, eq)] = kv.slice(eq + 1)
  }
  for (const part of newCookie.split(';')) {
    const kv = part.trim()
    const eq = kv.indexOf('=')
    if (eq <= 0) continue
    const key = kv.slice(0, eq)
    const value = kv.slice(eq + 1)
    // 空值表示服务端在清这个 cookie（`MUSIC_U=; Expires=...`，属性已被 api.rs 截掉）。
    // 写进空值会让 startsWith('MUSIC_U=') 仍然判定为已登录，所以要删掉这个键。
    if (value.trim() === '') delete map[key]
    else map[key] = value
  }
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ')
}

export function normalizeCookieForRequest(cookieString: string | null | undefined): string {
  if (!cookieString) return ''
  const parts = cookieString.split(';').map(s => s.trim()).filter(s => s.includes('='))
  // MUSIC_U 必须是非空值才算已登录：`MUSIC_U=` 是服务端清 cookie 的写法，不能当登录态
  if (!parts.some(part => part.startsWith('MUSIC_U=') && part.length > 'MUSIC_U='.length)) return ''
  if (!parts.some(part => part.startsWith('os='))) {
    parts.push('os=pc')
  }
  return parts.join('; ')
}

let apiBase = loadApiBase()
let apiCookie = getStorage(API_COOKIE_KEY, '') || ''

export const apiSession: ApiSession = {
  getBase(): string {
    return apiBase
  },

  setBase(url: string): void {
    setStorage(API_BASE_KEY, url)
    apiBase = url
  },

  getCookie(): string {
    return normalizeCookieForRequest(apiCookie)
  },

  setCookie(cookie: string): void {
    apiCookie = cookie || ''
    setStorage(API_COOKIE_KEY, apiCookie)
  },

  clearCookie(): void {
    apiCookie = ''
    removeStorage(API_COOKIE_KEY)
  },

  saveCookieFromResponse(data: unknown, rawCookie: string = ''): void {
    const rec = data && typeof data === 'object' ? data as { cookie?: unknown; data?: unknown } : null
    const nested = rec?.data && typeof rec.data === 'object'
      ? (rec.data as { cookie?: unknown }).cookie
      : undefined
    const raw = rawCookie
      || (typeof rec?.cookie === 'string' ? rec.cookie : '')
      || (typeof nested === 'string' ? nested : '')
    const cookie = extractCookie(raw)
    if (!cookie || cookie === apiCookie) return
    // 合并式更新：响应 cookie 覆盖旧值中同名键，保留旧值中未被提及的键
    const merged = mergeCookies(apiCookie, cookie)
    // 响应里出现空值 cookie（`MUSIC_U=`）＝ 服务端明确在清 cookie，此时必须落盘：
    // 否则本地一直留着旧的 MUSIC_U，客户端以为还登录着，带着失效 cookie 反复发请求。
    const serverCleared = cookie.split(';').some(part => {
      const eq = part.indexOf('=')
      return eq > 0 && part.slice(eq + 1).trim() === ''
    })
    // 其余情况仍是「只有合并后还含 MUSIC_U 才写入」，防止匿名接口的 __csrf/NMTID 抹掉登录态
    if (serverCleared || normalizeCookieForRequest(merged)) {
      apiCookie = merged
      setStorage(API_COOKIE_KEY, apiCookie)
    }
  },
}
