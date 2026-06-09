import { ncm } from '../api/client.js'

const { setCookie, clearCookie } = ncm

let _user = $state(null)
let _loginMode = $state(null)

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
  get loginMode() { return _loginMode },

  get isLoggedIn() { return !!_user && !!_loginMode },
  get isAccountLoggedIn() { return _loginMode === 'account' },
  get isLooseLoggedIn() { return !!_loginMode },

  init() {
    const stored = localStorage.getItem('auth_user')
    const mode = localStorage.getItem('auth_mode')
    if (stored && mode) {
      try {
        _user = normalizeUser(JSON.parse(stored))
        _loginMode = mode
      } catch { this.clear() }
    }
  },

  setUser(user, mode) {
    _user = normalizeUser(user)
    _loginMode = mode
    localStorage.setItem('auth_user', JSON.stringify(_user))
    localStorage.setItem('auth_mode', mode)
  },

  clear() {
    _user = null
    _loginMode = null
    localStorage.removeItem('auth_user')
    localStorage.removeItem('auth_mode')
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
    return profile
  },

  async qrLogin() {
    await new Promise(r => setTimeout(r, 500))
    let lastErr
    for (const fn of ['loginStatus', 'userAccount']) {
      try {
        const res = await ncm[fn]()
        console.log(`qrLogin /${fn}:`, JSON.stringify(res).slice(0, 500))
        const ok = res.code === 200 || res.data?.code === 200
        if (ok) {
          // 跳过匿名用户（登录失败）
          const account = res.account || res.data?.account || {}
          if (account.anonimousUser) {
            lastErr = '/login/qr/check returned 803 but cookie not accepted'
            continue
          }
          let p = res.profile || res.data?.profile || res.account || res.data?.account
          if (p?.userId || p?.id) return this.setUser(p, 'account'), p
          const uid = res.account?.id || res.data?.account?.id
          if (uid) {
            try {
              const detail = await ncm.userDetail(uid)
              p = detail.profile || detail.user || detail.data?.profile || detail.data?.user || { userId: uid, nickname: '用户', avatarUrl: '' }
            } catch {}
          }
          if (p) return this.setUser(p, 'account'), p
        }
        lastErr = `/${fn} code=${res.code ?? res.data?.code ?? 'none'}`
      } catch (e) {
        lastErr = `/${fn} ${e.message}`
      }
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
    const chainId = `v1_${Math.random().toString(36).slice(2, 10)}_web_login_${Date.now()}`
    const imgRes = await ncm.loginQrCreate(key, true, chainId)
    if (imgRes.code !== 200) throw new Error('生成二维码失败')
    return { key, chainId, qrurl: imgRes.data.qrurl, qrimg: imgRes.data.qrimg }
  },

  startQrPolling(key, onStatus) {
    let timer
    const promise = new Promise((resolve, reject) => {
      timer = setInterval(async () => {
        try {
          const check = await ncm.loginQrCheck(key)
          onStatus?.(check.code)
          if (check.code === 803) {
            clearInterval(timer)
            console.log('QR 803 full response:', JSON.stringify(check))
            const raw = check.cookie || check.data?.cookie || ''
            const ck = raw ? raw.split(';').map(s => s.trim()).filter(s => s.includes('=') && !/^(Path|Domain|Expires|Max-Age|HttpOnly|Secure|SameSite)/i.test(s)).join('; ') : ''
            console.log('QR 803 extracted cookie:', ck)
            if (ck) setCookie(ck)
            resolve()
          } else if (check.code === 800) {
            clearInterval(timer)
            reject(new Error('二维码已过期'))
          }
        } catch (e) {
          clearInterval(timer)
          reject(e)
        }
      }, 1500)
    })
    return { promise, cancel: () => clearInterval(timer) }
  }
}
