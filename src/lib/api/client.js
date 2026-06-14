import { getStorage, removeStorage, setStorage } from '../utils/storage.js'
import { clearCache, createCacheKey, getCacheStats, readCache, writeCache } from '../utils/cache.js'

export const DEFAULT_API_BASE = 'https://music.xubuyuan.top'
const DEV_PROXY_API_BASE = '/ncm-api'
const LEGACY_LOCAL_API_BASES = new Set(['http://localhost:3000', 'http://127.0.0.1:3000'])

let _base
_base = getStorage('api_base', '')
if (LEGACY_LOCAL_API_BASES.has(_base)) {
  removeStorage('api_base')
  _base = ''
}
let API_BASE = _base || DEFAULT_API_BASE
let tauriInvokePromise

function isBrowserDevRuntime() {
  return typeof window !== 'undefined' && window.location?.hostname === '127.0.0.1' && !isTauriRuntime()
}

function getRequestBase() {
  return isBrowserDevRuntime() && API_BASE === DEFAULT_API_BASE ? DEV_PROXY_API_BASE : API_BASE
}

let _cookie = ''
const savedCookie = getStorage('api_cookie', '')
if (savedCookie) _cookie = savedCookie

const DEFAULT_TIMEOUT = 15000
const MINUTE = 60 * 1000
const CACHE_TTL = {
  '/song/url/v1': 10 * MINUTE,
  '/lyric': 7 * 24 * 60 * MINUTE,
  '/lyric/new': 7 * 24 * 60 * MINUTE,
  '/song/detail': 24 * 60 * MINUTE,
  '/playlist/detail': 30 * MINUTE,
  '/playlist/track/all': 30 * MINUTE,
  '/album': 6 * 60 * MINUTE,
  '/artist/detail': 12 * 60 * MINUTE,
  '/artist/songs': 2 * 60 * MINUTE,
  '/artist/album': 12 * 60 * MINUTE,
  '/banner': 30 * MINUTE,
  '/personalized': 30 * MINUTE,
  '/top/playlist': 30 * MINUTE,
  '/personalized/newsong': 30 * MINUTE,
  '/recommend/songs': 10 * MINUTE,
  '/album/newest': 2 * 60 * MINUTE,
  '/homepage/block/page': 20 * MINUTE,
  '/recommend/resource': 15 * MINUTE,
  '/user/playlist': 5 * MINUTE,
  '/user/record': 5 * MINUTE,
  '/user/subcount': 5 * MINUTE,
  '/toplist': 60 * MINUTE,
  '/toplist/detail': 30 * MINUTE,
  '/history/recommend/songs': 15 * MINUTE,
  '/history/recommend/songs/detail': 15 * MINUTE,
}

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
    setStorage('api_cookie', _cookie)
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

async function request(endpoint, params = {}, method = 'GET', body = null, options = {}) {
  const invoke = await getTauriInvoke()
  const cookie = options.noCookie ? '' : _cookie
  const withRandomCNIP = options.randomCNIP !== false
  const requestParams = withRandomCNIP ? { randomCNIP: true, ...params } : params
  const requestBody = body ? (withRandomCNIP ? { randomCNIP: true, ...body } : body) : body
  const cacheTtl = method === 'GET' && options.cache !== false ? options.cacheTtl ?? CACHE_TTL[endpoint] : 0
  const cacheKey = cacheTtl
    ? createCacheKey([API_BASE, endpoint, requestParams, requestBody, cookie ? cookie.slice(0, 48) : 'public'])
    : ''
  if (cacheKey && !options.refresh) {
    const cached = readCache(cacheKey)
    if (cached) return cached
  }
  if (invoke) {
    try {
      const result = await invoke('ncm_request', {
        request: {
          base: API_BASE,
          endpoint,
          params: requestParams,
          method,
          body: requestBody,
          cookie,
          allowErrorBody: !!options.allowErrorBody,
        },
      })
      if (options.saveCookie !== false) saveCookieFromResponse(result.data, result.cookie)
      writeCache(cacheKey, result.data, cacheTtl)
      return result.data
    } catch (error) {
      const stale = cacheKey ? readCache(cacheKey, { allowExpired: true }) : null
      if (stale) return stale
      throw error
    }
  }

  const requestBase = getRequestBase()
  const url = requestBase.startsWith('http')
    ? new URL(`${requestBase}${endpoint}`)
    : new URL(`${requestBase}${endpoint}`, window.location.origin)
  if (method === 'GET') {
    Object.entries(requestParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v)
    })
    if (cookie) url.searchParams.set('cookie', cookie)
  }
  const opts = { method, credentials: options.browserCredentials || 'same-origin' }
  if (requestBody) {
    opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    const formBody = { ...requestBody }
    if (cookie) formBody.cookie = cookie
    opts.body = new URLSearchParams(formBody).toString()
  }
  try {
    const res = await fetchWithTimeout(url, opts)
    if (!res.ok && !options.allowErrorBody) throw new Error(`API error: ${res.status}`)
    const data = await res.json().catch(() => ({ code: res.status, message: `API error: ${res.status}` }))
    if (options.saveCookie !== false) saveCookieFromResponse(data)
    writeCache(cacheKey, data, cacheTtl)
    return data
  } catch (error) {
    const stale = cacheKey ? readCache(cacheKey, { allowExpired: true }) : null
    if (stale) return stale
    throw error
  }
}

export const ncm = {
  setBase(url) {
    setStorage('api_base', url)
    API_BASE = url
  },
  getBase() { return API_BASE },
  setCookie(c) { _cookie = c; setStorage('api_cookie', _cookie) },
  clearCookie() { _cookie = ''; removeStorage('api_cookie') },
  clearCache,
  getCacheStats,

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

  songUrl(id, level = 'lossless', unblock = false) {
    return request('/song/url/v1', { id, level, unblock: unblock ? 'true' : 'false' })
  },
  /** 老版 /song/url — 用 br 码率，作 fallback 兜底 */
  songUrlOld(id, br = 320000) {
    return request('/song/url', { id, br })
  },
  /** 直接获取灰色歌曲链接（UnblockNeteaseMusic） */
  songUrlMatch(id) {
    return request('/song/url/match', { id })
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
    const trackIds = Array.isArray(tracks) ? tracks.join(',') : tracks
    return request('/playlist/tracks', { op: 'add', pid: id, tracks: trackIds, timestamp: Date.now() })
  },
  playlistRemoveTrack(id, tracks) {
    const trackIds = Array.isArray(tracks) ? tracks.join(',') : tracks
    return request('/playlist/tracks', { op: 'del', pid: id, tracks: trackIds, timestamp: Date.now() })
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
  userFollows(uid, limit = 30, offset = 0) {
    return request('/user/follows', { uid, limit, offset })
  },
  userFolloweds(uid, limit = 30, offset = 0) {
    return request('/user/followeds', { uid, limit, offset })
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
  artistSub(id, subscribe = true) {
    return request('/artist/sub', { id, t: subscribe ? 1 : 0 })
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
    return request('/login/qr/key', { timestamp: Date.now(), noCookie: true }, 'GET', null, { randomCNIP: false, noCookie: true, saveCookie: false, browserCredentials: 'omit' })
  },
  loginQrCreate(key, qrimg = true) {
    // 不传 platform=web，避免后端基于空 cookie 生成无效 chainId 污染 qrurl
    return request('/login/qr/create', { key, qrimg, timestamp: Date.now() }, 'GET', null, { randomCNIP: false, noCookie: true, saveCookie: false, browserCredentials: 'omit' })
  },
  loginQrCheck(key) {
    return request('/login/qr/check', { key, timestamp: Date.now(), noCookie: true }, 'GET', null, { noCookie: true, allowErrorBody: true, randomCNIP: false, saveCookie: false, browserCredentials: 'omit' })
  },
  loginCellphone(phone, password) {
    return request('/login/cellphone', { phone, password }, 'GET', null, { randomCNIP: false })
  },
  loginEmail(email, password) {
    return request('/login', { email, password }, 'GET', null, { randomCNIP: false })
  },
  logout() {
    return request('/logout', {}, 'GET', null, { randomCNIP: false })
  },
  loginStatus(cookie) {
    return request('/login/status', { timestamp: Date.now(), ua: 'pc' }, 'POST', cookie ? { cookie } : {}, { randomCNIP: false })
  },

  like(id, like = true, uid) {
    const timestamp = Date.now()
    if (uid) return request('/song/like', { id, uid, like, timestamp })
    return request('/like', { id, like, timestamp })
  },
  likelist(uid) {
    return request('/likelist', { uid })
  },
  songLikeCheck(ids) {
    const list = Array.isArray(ids) ? ids : [ids]
    return request('/song/like/check', { ids: JSON.stringify(list), timestamp: Date.now() }, 'GET', null, { cache: false })
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
