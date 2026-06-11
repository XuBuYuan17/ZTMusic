let _base
try { _base = localStorage.getItem('api_base') } catch {}
let API_BASE = _base || 'http://localhost:3000'
let tauriInvokePromise

let _cookie = ''
try {
  const saved = localStorage.getItem('api_cookie')
  if (saved) _cookie = saved
} catch {}

const DEFAULT_TIMEOUT = 15000

function isTauriRuntime() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

async function getTauriInvoke() {
  if (!isTauriRuntime()) return null
  if (!tauriInvokePromise) {
    tauriInvokePromise = import('@tauri-apps/api/core')
      .then(mod => mod.invoke)
      .catch(() => null)
  }
  return tauriInvokePromise
}

function extractCookie(raw = '') {
  return raw
    ? raw.split(';').map(s => s.trim()).filter(s => s.includes('=') && !/^(Path|Domain|Expires|Max-Age|HttpOnly|Secure|SameSite)/i.test(s)).join('; ')
    : ''
}

function saveCookieFromResponse(data, rawCookie = '') {
  const raw = rawCookie || data.cookie || data.data?.cookie || ''
  const ck = extractCookie(raw)
  if (ck && ck !== _cookie) {
    _cookie = ck
    localStorage.setItem('api_cookie', _cookie)
  }
}

async function fetchWithTimeout(url, opts = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('API request timeout')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function request(endpoint, params = {}, method = 'GET', body = null) {
  const invoke = await getTauriInvoke()
  if (invoke) {
    const result = await invoke('ncm_request', {
      request: {
        base: API_BASE,
        endpoint,
        params,
        method,
        body,
        cookie: _cookie,
      },
    })
    saveCookieFromResponse(result.data, result.cookie)
    return result.data
  }

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
  const res = await fetchWithTimeout(url, opts)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  saveCookieFromResponse(data)
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

  search(keywords, limit = 30, offset = 0, type = 1) {
    return request('/search', { keywords, limit, offset, type })
  },
  searchSongs(keywords, limit = 30, offset = 0) {
    return request('/search', { keywords, limit, offset, type: 1 })
  },
  searchArtists(keywords, limit = 20, offset = 0) {
    return request('/search', { keywords, limit, offset, type: 100 })
  },
  searchPlaylists(keywords, limit = 20, offset = 0) {
    return request('/search', { keywords, limit, offset, type: 1000 })
  },
  cloudsearch(keywords, limit = 30, offset = 0) {
    return request('/cloudsearch', { keywords, limit, offset })
  },
  searchHot() {
    return request('/search/hot')
  },

  songUrl(id, level = 'lossless') {
    return request('/song/url/v1', { id, level })
  },
  lyric(id) {
    return request('/lyric', { id })
  },
  lyricNew(id) {
    return request('/lyric/new', { id })
  },
  songDetail(id) {
    const ids = Array.isArray(id) ? id.join(',') : id
    return request('/song/detail', { ids })
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
  playlistAddTrack(id, tracks) {
    return request('/playlist/tracks', { op: 'add', id, tracks })
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
  userRecordWeek(uid) {
    return request('/user/record', { uid, type: 1 })
  },
  userSubcount() {
    return request('/user/subcount')
  },

  personalized(limit = 10) {
    return request('/personalized', { limit })
  },
  recommendResource() {
    return request('/recommend/resource')
  },
  banner() {
    return request('/banner')
  },
  recommendSongs(limit = 10) {
    return request('/recommend/songs', { limit })
  },
  personalizedNewSong(limit = 12) {
    return request('/personalized/newsong', { limit })
  },
  homepageBlockPage(refresh = false, cursor) {
    return request('/homepage/block/page', { refresh, cursor })
  },
  historyRecommendSongs() {
    return request('/history/recommend/songs')
  },
  historyRecommendSongsDetail(date) {
    return request('/history/recommend/songs/detail', { date })
  },
  simiSong(id) {
    return request('/simi/song', { id })
  },
  simiPlaylist(id) {
    return request('/simi/playlist', { id })
  },
  commentMusic(id, limit = 20, offset = 0, before) {
    return request('/comment/music', { id, limit, offset, before })
  },
  topAlbum(area = 'ALL', limit = 20, offset = 0, type = 'new', year, month) {
    return request('/top/album', { area, limit, offset, type, year, month })
  },
  albumNewest() {
    return request('/album/newest')
  },
  albumNew(area = 'ALL', limit = 20, offset = 0) {
    return request('/album/new', { area, limit, offset })
  },

  artistDetail(id) {
    return request('/artist/detail', { id })
  },
  artistSongs(id, limit = 50, offset = 0) {
    return request('/artist/songs', { id, limit, offset })
  },
  artistAlbums(id, limit = 50, offset = 0) {
    return request('/artist/album', { id, limit, offset })
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

  // ===== 私信 & 通知 =====
  /** 获取私信列表 */
  msgPrivate(limit = 30, offset = 0) {
    return request('/msg/private', { limit, offset })
  },
  /** 获取最近联系人 */
  msgRecentContact() {
    return request('/msg/recentcontact')
  },
  /** 获取私信详情 */
  msgPrivateHistory(uid, limit = 30, before) {
    return request('/msg/private/history', { uid, limit, before })
  },
  /** 发送文字私信 */
  sendText(userIds, msg) {
    return request('/send/text', { user_ids: userIds, msg })
  },
  /** 发送歌曲私信 */
  sendSong(userIds, id, msg) {
    return request('/send/song', { user_ids: userIds, id, msg })
  },
  /** 发送专辑私信 */
  sendAlbum(userIds, id, msg) {
    return request('/send/album', { user_ids: userIds, id, msg })
  },
  /** 发送歌单私信 */
  sendPlaylist(userIds, playlist, msg) {
    return request('/send/playlist', { user_ids: userIds, playlist, msg })
  },
  /** 获取评论通知 */
  msgComments(uid, limit = 30, before) {
    return request('/msg/comments', { uid, limit, before })
  },
  /** 获取@我通知 */
  msgForwards(limit = 30, offset = 0) {
    return request('/msg/forwards', { limit, offset })
  },
  /** 获取系统通知 */
  msgNotices(limit = 30, lasttime = -1) {
    return request('/msg/notices', { limit, lasttime })
  },
}
