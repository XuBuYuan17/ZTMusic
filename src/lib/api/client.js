let _base
try { _base = localStorage.getItem('api_base') } catch {}
let API_BASE = _base || 'http://localhost:3000'

let _cookie = ''
try {
  const saved = localStorage.getItem('api_cookie')
  if (saved) _cookie = saved
} catch {}

async function request(endpoint, params = {}, method = 'GET', body = null) {
  const url = new URL(`${API_BASE}${endpoint}`)
  if (method === 'GET') {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v)
    })
    if (_cookie) url.searchParams.set('cookie', _cookie)
  }
  const opts = { method }
  if (body) {
    opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (_cookie) body.cookie = _cookie
    opts.body = new URLSearchParams(body).toString()
  }
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  const raw = data.cookie || data.data?.cookie || ''
  const ck = raw ? raw.split(';').map(s => s.trim()).filter(s => s.includes('=') && !/^(Path|Domain|Expires|Max-Age|HttpOnly|Secure|SameSite)/i.test(s)).join('; ') : ''
  if (ck && ck !== _cookie) {
    _cookie = ck
    localStorage.setItem('api_cookie', _cookie)
  }
  return data
}

export const ncm = {
  setBase(url) {
    localStorage.setItem('api_base', url)
    API_BASE = url
  },
  getBase() { return API_BASE },
  setCookie(c) { _cookie = c; localStorage.setItem('api_cookie', _cookie) },
  clearCookie() { _cookie = ''; localStorage.removeItem('api_cookie') },

  search(keywords, limit = 30, offset = 0) {
    return request('/search', { keywords, limit, offset })
  },
  cloudsearch(keywords, limit = 30, offset = 0) {
    return request('/cloudsearch', { keywords, limit, offset })
  },

  songUrl(id, br = 320000) {
    return request('/song/url/v1', { id, level: br >= 320000 ? 'lossless' : 'standard' })
  },
  lyric(id) {
    return request('/lyric', { id })
  },
  songDetail(id) {
    return request('/song/detail', { ids: id })
  },
  checkMusic(id) {
    return request('/check/music', { id })
  },

  playlistDetail(id) {
    return request('/playlist/detail', { id })
  },
  playlistTracks(id, limit = 100, offset = 0) {
    return request('/playlist/track/all', { id, limit, offset })
  },
  userPlaylist(uid) {
    return request('/user/playlist', { uid })
  },
  userDetail(uid) {
    return request('/user/detail', { uid })
  },
  userAccount() {
    return request('/user/account', {}, 'POST', {})
  },
  userRecord(uid, type = 1) {
    return request('/user/record', { uid, type })
  },
  userSubcount() {
    return request('/user/subcount')
  },

  personalized(limit = 10) {
    return request('/personalized', { limit })
  },
  banner() {
    return request('/banner')
  },
  recommendSongs(limit = 10) {
    return request('/recommend/songs', { limit })
  },

  artistSongs(id, limit = 50, offset = 0) {
    return request('/artist/songs', { id, limit, offset })
  },
  artistAlbums(id, limit = 50) {
    return request('/artist/album', { id, limit })
  },
  album(id) {
    return request('/album', { id })
  },

  toplist() {
    return request('/toplist')
  },
  toplistDetail(id, limit = 50) {
    return request('/toplist/detail', { id, limit })
  },

  topPlaylist(cat = '全部', limit = 20, offset = 0) {
    return request('/top/playlist', { cat, limit, offset })
  },
  topSongs(type = 0) {
    return request('/top/song', { type })
  },

  loginQrKey() {
    return request('/login/qr/key')
  },
  loginQrCreate(key, qrimg = true, chainId) {
    return request('/login/qr/create', { key, qrimg, platform: 'web', ...chainId && { chainId }, ua: 'pc' })
  },
  loginQrCheck(key) {
    return request('/login/qr/check', { key, ua: 'pc' })
  },
  loginCellphone(phone, password) {
    return request('/login/cellphone', { phone, password })
  },
  loginEmail(email, password) {
    return request('/login', { email, password })
  },
  logout() {
    return request('/logout')
  },
  loginStatus() {
    return request('/login/status', {}, 'POST', {})
  },

  like(id, like = true) {
    return request('/like', { id, like })
  },
  likelist(uid) {
    return request('/likelist', { uid })
  },

  // ===== 云音乐 \(Cloud\) =====
  /** 获取云盘歌曲列表（POST 接口，需要时间戳防缓存 + cookie 放 query） */
  async cloudSongs(limit = 30, offset = 0) {
    const url = new URL(`${API_BASE}/user/cloud`)
    // 加时间戳防止缓存
    url.searchParams.set('timestamp', String(Date.now()))
    if (_cookie) url.searchParams.set('cookie', _cookie)
    const body = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    }).toString()
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()
    // 更新 cookie
    const raw = data.cookie || data.data?.cookie || ''
    const ck = raw ? raw.split(';').map(s => s.trim()).filter(s => s.includes('=') && !/^(Path|Domain|Expires|Max-Age|HttpOnly|Secure|SameSite)/i.test(s)).join('; ') : ''
    if (ck && ck !== _cookie) {
      _cookie = ck
      localStorage.setItem('api_cookie', _cookie)
    }
    return data
  },
}
