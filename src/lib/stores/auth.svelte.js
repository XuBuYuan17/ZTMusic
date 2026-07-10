import { ncm } from '../api/client.js'
import { fetchVipInfo, normalizeVipInfo } from '../auth/vip.js'
import { getStorage, getStorageJson, removeStorage, setStorage } from '../utils/storage.js'

const { setCookie, clearCookie } = ncm

let _user = $state(null)
let _loginMode = $state(null)
let _cookieOk = $state(true)
let _vipInfo = $state(null)

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
  try {
    const res = await ncm.loginStatus()
    const ok = res.code === 200 || res.data?.code === 200
    const isAnon = res.account?.anonimousUser || res.data?.account?.anonimousUser
    if (!ok || isAnon) {
      _cookieOk = false
      // 延迟一点清除登录态，让 UI 可以捕捉到 cookieOk 变化
      setTimeout(() => {
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
        this.refreshVipInfo()
        // 启动时主动校验 cookie 是否仍有效，失效则自动登出，避免“显示已登录但实际失效”
        checkLoginStatus()
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
    let canceled = false
    let timer
    const promise = new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const check = await ncm.loginQrCheck(key)
          const code = check.code ?? check.data?.code
          onStatus?.(code)
          if (code === 803) {
            const raw = check.cookie || check.data?.cookie || ''
            const ck = raw ? raw.split(';').map(s => s.trim()).filter(s => s.includes('=') && !/^(Path|Domain|Expires|Max-Age|HttpOnly|Secure|SameSite)/i.test(s)).join('; ') : ''
            if (ck) setCookie(ck)
            resolve(ck)
            return
          }
          if (code === 800) {
            reject(new Error('二维码已过期'))
            return
          }
          if (!canceled) timer = setTimeout(poll, 1500)
        } catch (e) {
          reject(e)
        }
      }
      poll()
    })
    return { promise, cancel: () => { canceled = true; clearTimeout(timer) } }
  }
}
