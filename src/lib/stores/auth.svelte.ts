import type { SongId } from '../types/music.ts'
import { ncm } from '../api/client.ts'
import { fetchVipInfo, normalizeVipInfo } from '../auth/vip.ts'
import { getStorage, getStorageJson, removeStorage, setStorage } from '../utils/storage.ts'

type Loose = Record<string, unknown>

interface AuthUser extends Loose {
  userId: SongId
  avatarUrl: string
  nickname: string
}

interface VipInfo {
  vipType: number
  vipLevel: number
  isVip: boolean
  raw: Loose
}

interface LoginCredentials {
  phone?: string
  password?: string
  email?: string
}

interface QrCodePayload {
  key: string
  qrurl: string
  qrimg: string
}

interface QrPollHandle {
  promise: Promise<string>
  cancel(): void
}

function asRecord(value: unknown): Loose | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value) return value
  }
  return ''
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as Loose).message)
  return 'undefined'
}

const { setCookie, clearCookie } = ncm

let _user = $state<AuthUser | null>(null)
let _loginMode = $state<string | null>(null)
let _cookieOk = $state(true)
let _vipInfo = $state<VipInfo | null>(null)
let _authToken = 0

function deepFind(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  const seen = new WeakSet<object>()
  function search(o: unknown): string | undefined {
    if (!o || typeof o !== 'object' || seen.has(o)) return undefined
    seen.add(o)
    if (key in o) {
      const v = (o as Loose)[key]
      if (typeof v === 'string' && v) return v
    }
    for (const v of Object.values(o as Loose)) {
      if (typeof v === 'object' && v) {
        const found = search(v)
        if (found) return found
      }
    }
    return undefined
  }
  return search(obj)
}

/** 检测登录 cookie 是否仍然有效，无效则自动清除登录状态 */
async function checkLoginStatus(): Promise<boolean> {
  if (!_loginMode) return true
  const modeSnapshot = _loginMode  // 记录本次检测时的登录会话
  try {
    const res = await ncm.loginStatus()
    const r = asRecord(res)
    const d = asRecord(r?.data)
    const ok = r?.code === 200 || d?.code === 200
    const isAnon = asRecord(r?.account)?.anonimousUser || asRecord(d?.account)?.anonimousUser
    if (!ok || isAnon) {
      // 二次校验：await 期间用户可能已重新登录，_loginMode 会被 setUser 覆盖
      if (_loginMode !== modeSnapshot) return true
      _cookieOk = false
      // 延迟一点清除登录态，让 UI 可以捕捉到 cookieOk 变化
      const token = ++_authToken
      setTimeout(() => {
        // 定时器触发时再次校验：这 100ms 内用户可能刚登录成功
        if (token !== _authToken) return
        clearCookie()
        _user = null
        _loginMode = null
        _vipInfo = null
        removeStorage('auth_user')
        removeStorage('auth_mode')
        removeStorage('auth_vip')
      }, 100)
      return false
    }
    _cookieOk = true
    return true
  } catch {
    return _cookieOk
  }
}

function normalizeUser(user: unknown): AuthUser | null {
  const u = asRecord(user)
  if (!u) return null
  const profile = asRecord(u.profile)
  const account = asRecord(u.account)
  const userId: unknown = u.userId || u.id || account?.id || deepFind(user, 'userId')
  return {
    ...u,
    userId: typeof userId === 'number' || typeof userId === 'string' ? userId : 0,
    avatarUrl: pickString(u.avatarUrl, profile?.avatarUrl, account?.avatarUrl, deepFind(user, 'avatarUrl')),
    nickname: pickString(u.nickname, profile?.nickname, account?.nickname, deepFind(user, 'nickname')) || '用户',
  }
}

let _currentQrPoll: QrPollHandle | null = null

export const auth = {
  get user() { return _user },
  get vipInfo() { return _vipInfo },
  get loginMode() { return _loginMode },

  get isLoggedIn() { return !!_user && !!_loginMode },
  get isVip() { return Boolean(_vipInfo?.isVip) },
  get vipLabel() {
    if (!_loginMode) return '未登录'
    if (!_vipInfo) return '未同步'
    if (!_vipInfo.isVip) return '普通账号'
    return _vipInfo.vipLevel ? `VIP Lv.${_vipInfo.vipLevel}` : 'VIP'
  },
  get isAccountLoggedIn() { return _loginMode === 'account' },
  get isLooseLoggedIn() { return !!_loginMode },
  get cookieOk() { return _cookieOk },
  checkLoginStatus,

  init() {
    const stored = getStorageJson<unknown>('auth_user', null)
    const vip = getStorageJson<unknown>('auth_vip', null)
    const mode = getStorage('auth_mode', '')
    if (stored && mode) {
      try {
        _user = normalizeUser(stored)
        _vipInfo = vip as VipInfo | null
        _loginMode = mode
        // 串行：先校验 cookie，通过后再刷新 VIP，避免失效 cookie 下的过期 VIP 信息被写回缓存
        checkLoginStatus().then((valid) => {
          if (valid) this.refreshVipInfo()
        })
      } catch { this.clear() }
    }
  },

  setUser(user: unknown, mode: string) {
    _user = normalizeUser(user)
    _loginMode = mode
    _cookieOk = true
    setStorage('auth_user', _user)
    setStorage('auth_mode', mode)
  },

  async refreshVipInfo(): Promise<VipInfo | null> {
    if (!this.isLoggedIn) {
      _vipInfo = null
      removeStorage('auth_vip')
      return null
    }
    try {
      const res = await fetchVipInfo(ncm) as unknown
      _vipInfo = normalizeVipInfo(res) as VipInfo
      setStorage('auth_vip', _vipInfo)
      return _vipInfo
    } catch {
      return _vipInfo
    }
  },

  async setAccountUser(user: unknown): Promise<unknown> {
    this.setUser(user, 'account')
    await this.refreshVipInfo()
    return user
  },

  clear() {
    _user = null
    _loginMode = null
    _vipInfo = null
    removeStorage('auth_user')
    removeStorage('auth_mode')
    removeStorage('auth_vip')
  },

  async login(mode: string, credentials: LoginCredentials): Promise<unknown> {
    let res: unknown = undefined
    if (mode === 'phone') {
      res = await ncm.loginCellphone(credentials.phone as string, credentials.password as string)
    } else if (mode === 'email') {
      res = await ncm.loginEmail(credentials.email as string, credentials.password as string)
    }
    const r = asRecord(res)
    if (!r || r.code !== 200) throw new Error(pickString(r?.msg, r?.message) || '登录失败')
    const d = asRecord(r.data)
    const ck = pickString(r.cookie, d?.cookie)
    if (ck) setCookie(ck)
    const profile = r.profile || d?.profile || r.account || d?.account
    this.setUser(profile, 'account')
    await this.refreshVipInfo()
    return profile
  },

  async qrLogin(cookie = ''): Promise<unknown> {
    if (cookie) setCookie(cookie)
    await new Promise(r => setTimeout(r, 500))
    let lastErr = ''
    try {
      const res = await ncm.loginStatus(cookie)
      const r = asRecord(res)
      const d = asRecord(r?.data)
      const ok = r?.code === 200 || d?.code === 200
      if (ok && r) {
        const account = asRecord(r.account || d?.account || {})!
        if (account.anonimousUser) {
          throw new Error('/login/status returned anonymous account')
        }
        let p: unknown = r.profile || d?.profile || r.account || d?.account
        const pr = asRecord(p)
        if (pr && (pr.userId || pr.id)) return this.setAccountUser(p)
        const uid = asRecord(r.account)?.id || asRecord(d?.account)?.id
        if (uid) {
          try {
            const detail = await ncm.userDetail(uid as SongId)
            const dr = asRecord(detail)
            const ddr = asRecord(dr?.data)
            p = dr?.profile || dr?.user || ddr?.profile || ddr?.user || { userId: uid, nickname: '用户', avatarUrl: '' }
          } catch {}
        }
        if (p) return this.setAccountUser(p)
      }
      lastErr = `/login/status code=${r?.code ?? d?.code ?? 'none'}`
    } catch (e) {
      lastErr = `/login/status ${errorText(e)}`
    }

    try {
      const res = await ncm.userAccount()
      const r = asRecord(res)
      const d = asRecord(r?.data)
      const ok = r?.code === 200 || d?.code === 200
      if (ok && r) {
        const p = r.profile || d?.profile || r.account || d?.account
        if (p) return this.setAccountUser(p)
      }
      lastErr = `/user/account code=${r?.code ?? d?.code ?? 'none'}`
    } catch (e) {
      lastErr = `/user/account ${errorText(e)}`
    }
    throw new Error('获取用户信息失败 (' + lastErr + ')')
  },

  async logout() {
    try { await ncm.logout() } catch {}
    clearCookie()
    this.clear()
  },

  async getQrCode(): Promise<QrCodePayload> {
    clearCookie() // 清除过期 cookie，避免干扰
    const keyRes = await ncm.loginQrKey()
    const kr = asRecord(keyRes)
    if (!kr || kr.code !== 200) throw new Error('获取二维码失败')
    const key = asString(asRecord(kr.data)?.unikey)
    const imgRes = await ncm.loginQrCreate(key, true)
    const ir = asRecord(imgRes)
    if (!ir || ir.code !== 200) throw new Error('生成二维码失败')
    const img = asRecord(ir.data)
    return { key, qrurl: asString(img?.qrurl), qrimg: asString(img?.qrimg) }
  },

  startQrPolling(key: string, onStatus?: (code: unknown) => void): QrPollHandle {
    // 幂等：新一轮轮询开始前先取消上一个，避免并发 poll 造成 cookie 静默覆盖
    _currentQrPoll?.cancel()

    let canceled = false
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let retry = 0
    const MAX_RETRIES = 3
    const MAX_DURATION_MS = 90_000  // 硬超时：NCM QR 一般 2 分钟过期，90s 后主动放弃
    const startedAt = Date.now()

    let resolvePromise!: (value: string) => void
    let rejectPromise!: (reason?: unknown) => void
    const promise = new Promise<string>((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })
    let handle: QrPollHandle | undefined
    const finish = <T,>(settle: (value: T) => void, value: T): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (_currentQrPoll === handle) _currentQrPoll = null
      settle(value)
    }
    const poll = async () => {
      if (canceled || settled) return
      if (Date.now() - startedAt > MAX_DURATION_MS) {
        finish(rejectPromise, new Error('二维码轮询超时'))
        return
      }
      try {
        const check = await ncm.loginQrCheck(key)
        if (canceled || settled) return
        retry = 0
        const cr = asRecord(check)
        const cd = asRecord(cr?.data)
        const code = cr?.code ?? cd?.code
        onStatus?.(code)
        if (code === 803) {
          const raw = asString(cr?.cookie) || asString(cd?.cookie) || ''
          const ck = raw ? raw.split(';').map(s => s.trim()).filter(s => s.includes('=') && !/^(Path|Domain|Expires|Max-Age|HttpOnly|Secure|SameSite)/i.test(s)).join('; ') : ''
          if (ck) setCookie(ck)
          finish(resolvePromise, ck)
          return
        }
        if (code === 800) {
          finish(rejectPromise, new Error('二维码已过期'))
          return
        }
        timer = setTimeout(poll, 1500)
      } catch (e) {
        if (canceled || settled) return
        if (++retry > MAX_RETRIES) {
          finish(rejectPromise, e)
          return
        }
        timer = setTimeout(poll, 1500 * 2 ** retry)
      }
    }

    handle = {
      promise,
      cancel: () => {
        if (canceled || settled) return
        canceled = true
        finish(rejectPromise, new DOMException('Aborted', 'AbortError'))
      },
    }
    _currentQrPoll = handle
    poll()
    return handle
  },
}
