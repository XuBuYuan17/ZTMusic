import { ncm } from '../api/client.js'
import { fetchVipInfo, normalizeVipInfo } from '../auth/vip.js'
import { getStorage, getStorageJson, removeStorage, setStorage } from '../utils/storage.js'

const { setCookie, clearCookie } = ncm

let _user = $state(null)
let _loginMode = $state(null)
let _cookieOk = $state(true)
let _vipInfo = $state(null)
let _authToken = 0

function deepFind(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined
  const seen = new WeakSet()
  function search(o) {
    if (!o || typeof o !== 'object' || seen.has(o)) return undefined
    seen.add(o)
    if (key in o) {
      const v = o[key]
      if (typeof v === 'string' && v) return v
    }
    for (const v of Object.values(o)) {
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
async function checkLoginStatus() {
  if (!_loginMode) return true
  const modeSnapshot = _loginMode  // 记录本次检测时的登录会话
  try {
    const res = await ncm.loginStatus()
    const ok = res.code === 200 || res.data?.code === 200
    const isAnon = res.account?.anonimousUser || res.data?.account?.anonimousUser
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

function normalizeUser(user) {
  if (!user) return null
  return {
    ...user,
    userId: user.userId || user.id || user.account?.id || deepFind(user, 'userId') || 0,
    avatarUrl: user.avatarUrl || user.profile?.avatarUrl || user.account?.avatarUrl || deepFind(user, 'avatarUrl') || '',
    nickname: user.nickname || user.profile?.nickname || user.account?.nickname || deepFind(user, 'nickname') || '用户',
  }
}

let _currentQrPoll = null

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
    const stored = getStorageJson('auth_user', null)
    const vip = getStorageJson('auth_vip', null)
    const mode = getStorage('auth_mode', '')
    if (stored && mode) {
      try {
        _user = normalizeUser(stored)
        _vipInfo = vip
        _loginMode = mode
        // 串行：先校验 cookie，通过后再刷新 VIP，避免失效 cookie 下的过期 VIP 信息被写回缓存
        checkLoginStatus().then((valid) => {
          if (valid) this.refreshVipInfo()
        })
      } catch { this.clear() }
    }
  },

  setUser(user, mode) {
    _user = normalizeUser(user)
    _loginMode = mode
    _cookieOk = true
    setStorage('auth_user', _user)
    setStorage('auth_mode', mode)
  },

  async refreshVipInfo() {
    if (!this.isLoggedIn) {
      _vipInfo = null
      removeStorage('auth_vip')
      return null
    }
    try {
      const res = await fetchVipInfo(ncm)
      _vipInfo = normalizeVipInfo(res)
      setStorage('auth_vip', _vipInfo)
      return _vipInfo
    } catch {
      return _vipInfo
    }
  },

  async setAccountUser(user) {
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

  async login(mode, credentials) {
    let res
    if (mode === 'phone') {
      res = await ncm.loginCellphone(credentials.phone, credentials.password)
    } else if (mode === 'email') {
      res = await ncm.loginEmail(credentials.email, credentials.password)
    }
    if (!res || res.code !== 200) throw new Error(res?.msg || res?.message || '登录失败')
    const ck = res.cookie || res.data?.cookie
    if (ck) setCookie(ck)
    const profile = res.profile || res.data?.profile || res.account || res.data?.account
    this.setUser(profile, 'account')
    await this.refreshVipInfo()
    return profile
  },

  async qrLogin(cookie = '') {
    if (cookie) setCookie(cookie)
    await new Promise(r => setTimeout(r, 500))
    let lastErr
    try {
      const res = await ncm.loginStatus(cookie)
      const ok = res.code === 200 || res.data?.code === 200
      if (ok) {
        const account = res.account || res.data?.account || {}
        if (account.anonimousUser) {
          throw new Error('/login/status returned anonymous account')
        }
        let p = res.profile || res.data?.profile || res.account || res.data?.account
        if (p?.userId || p?.id) return this.setAccountUser(p)
        const uid = res.account?.id || res.data?.account?.id
        if (uid) {
          try {
            const detail = await ncm.userDetail(uid)
            p = detail.profile || detail.user || detail.data?.profile || detail.data?.user || { userId: uid, nickname: '用户', avatarUrl: '' }
          } catch {}
        }
        if (p) return this.setAccountUser(p)
      }
      lastErr = `/login/status code=${res.code ?? res.data?.code ?? 'none'}`
    } catch (e) {
      lastErr = `/login/status ${e.message}`
    }

    try {
      const res = await ncm.userAccount()
      const ok = res.code === 200 || res.data?.code === 200
      if (ok) {
        let p = res.profile || res.data?.profile || res.account || res.data?.account
        if (p) return this.setAccountUser(p)
      }
      lastErr = `/user/account code=${res.code ?? res.data?.code ?? 'none'}`
    } catch (e) {
      lastErr = `/user/account ${e.message}`
    }
    throw new Error('获取用户信息失败 (' + lastErr + ')')
  },

  async logout() {
    try { await ncm.logout() } catch {}
    clearCookie()
    this.clear()
  },

  async getQrCode() {
    clearCookie() // 清除过期 cookie，避免干扰
    const keyRes = await ncm.loginQrKey()
    if (keyRes.code !== 200) throw new Error('获取二维码失败')
    const key = keyRes.data.unikey
    const imgRes = await ncm.loginQrCreate(key, true)
    if (imgRes.code !== 200) throw new Error('生成二维码失败')
    return { key, qrurl: imgRes.data.qrurl, qrimg: imgRes.data.qrimg }
  },

  startQrPolling(key, onStatus) {
    // 幂等：新一轮轮询开始前先取消上一个，避免并发 poll 造成 cookie 静默覆盖
    _currentQrPoll?.cancel()

    let canceled = false
    let settled = false
    let timer
    let retry = 0
    const MAX_RETRIES = 3
    const MAX_DURATION_MS = 90_000  // 硬超时：NCM QR 一般 2 分钟过期，90s 后主动放弃
    const startedAt = Date.now()

    let resolvePromise
    let rejectPromise
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })
    let handle
    const finish = (settle, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
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
        const code = check.code ?? check.data?.code
        onStatus?.(code)
        if (code === 803) {
          const raw = check.cookie || check.data?.cookie || ''
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
  }
}
