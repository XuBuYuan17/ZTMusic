/**
 * Router — 导航路由 + 共享详情视图（歌单/专辑/歌手）。
 * 各独立页面（首页、探索、日推等）的数据由页面组件自加载。
 *
 * 使用: import { router } from './stores/router.svelte.ts'
 */
import type { SongId } from '../types/music.ts'
import type { CompactTrackInput } from '../player/queue.ts'
import { ncm } from '../api/client.ts'
import { player } from './player.svelte.ts'
import { auth } from './auth.svelte.ts'
import { extractColor } from '../player/colors.ts'
import {
  loadAlbumDetail,
  loadArtistDetail,
  loadPlaylistDetail,
  loadPlaylistMore,
  type PlaylistDetailRecord,
  type PlaylistDetailResult,
} from '../services/details.ts'
import { isMobileDevice } from '../utils/responsive.ts'
import { createLruCache } from '../utils/lru-cache.ts'

// 详情曲目兼容播放器队列输入，另带歌单内的附加字段
interface DetailTrack extends CompactTrackInput {
  id: SongId
  addTime?: number
  playlistIndex?: number
}

interface PlaylistDetail {
  id: SongId
  name: string
  coverImgUrl: string
  picUrl: string
  creator?: unknown
  trackCount: number
  description: string
  tracks: DetailTrack[]
  trackIds?: Array<{ id: SongId; at?: number; addTime?: number; time?: number }>
  tracksPartial?: boolean
}

interface PlaylistPreviewInput {
  id?: SongId
  name?: string
  coverImgUrl?: string
  picUrl?: string
  cover?: string
  creator?: unknown
  trackCount?: number
  size?: number
  description?: string
  copywriter?: string
  updateFrequency?: string
}

interface ArtistInfo {
  id: SongId
  followed: boolean
  [key: string]: unknown
}

interface PlaylistResult {
  detail: PlaylistDetail | null
  heroColor: string
}

interface ArtistResult {
  artist: ArtistInfo | null
  songs: DetailTrack[]
  albums: unknown[]
}

interface PlaylistRequestEntry {
  promise: Promise<PlaylistResult>
  progressListeners: Set<(partial: PlaylistDetailResult) => void>
}

// 缓存按 key 前缀区分歌单/专辑与歌手，读取处按前缀收窄
type DetailCacheValue = PlaylistResult | ArtistResult

interface RouteEntry {
  view: string
  id: number | null
}

interface BannerTarget {
  targetId?: number
  targetType?: number
}

function pickErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

// 侧边栏可直达的顶层视图；不在这个集合里的（歌单/专辑/歌手/用户/喜欢/听歌报告/历史日推）算二级页
const TOP_LEVEL_VIEWS = new Set(['home', 'explore', 'search', 'library', 'recent', 'localMusic', 'messages', 'settings', 'about'])
const PLAYLIST_CACHE_TTL_MS = 10 * 60 * 1000
const PLAYLIST_REVALIDATE_AFTER_MS = 90 * 1000
const PLAYLIST_PREFETCH_CONCURRENCY = 2
const PLAYLIST_PREFETCH_BURST = 4

// ── 导航状态 ──
let _activeView = $state('home')
let _previousView = $state('home')
let _selectedId = $state<number | null>(null)
let _routeStack = $state<RouteEntry[]>([])
let _routeTransition = $state('soft')
let _refreshKey = $state(Date.now())

// ── 共享详情视图（导航共享） ──
let _heroColor = $state('#141414')
let _playlistDetail = $state<PlaylistDetail | null>(null)
let _playlistDetailLoading = $state(false)
let _playlistLoadingMore = $state(false)
let _playlistDetailError = $state('')

let _artistDetail = $state<ArtistInfo | null>(null)
let _artistSongs = $state<DetailTrack[]>([])
let _artistAlbums = $state<unknown[]>([])
let _artistLoading = $state(false)
let _artistError = $state('')

let _detailRequestId = 0
let _artistRequestId = 0
// 详情缓存覆盖一次常见的“浏览资料库 → 进歌单 → 返回 → 再进入”会话。
// 命中后先展示缓存，再按新鲜度决定是否静默刷新；避免把网络新鲜度和首屏速度绑死。
const detailCache = createLruCache<DetailCacheValue>({ maxEntries: 32, ttlMs: PLAYLIST_CACHE_TTL_MS })
const playlistRequests = new Map<number, PlaylistRequestEntry>()
const playlistPrefetchQueue: number[] = []
const playlistPrefetchQueued = new Set<number>()
let playlistPrefetchActive = 0

// ── 工具 ──
function currentRoute(): RouteEntry { return { view: _activeView, id: _selectedId } }
function pushRoute(): void { _routeStack = [..._routeStack, currentRoute()] }
function invalidateDetailRequests(): void { _detailRequestId++; _artistRequestId++ }

/**
 * 同一歌单只保留一个进行中的详情请求。
 * 预取先发起、随后用户真正进入时，会把页面 progress listener 挂到同一条 Promise 上，
 * 因此请求去重不会牺牲渐进首屏。
 */
function requestPlaylistDetail(
  id: number,
  onProgress?: (partial: PlaylistDetailResult) => void,
): Promise<PlaylistResult> {
  const existing = playlistRequests.get(id)
  if (existing) {
    if (onProgress) existing.progressListeners.add(onProgress)
    return existing.promise
  }

  const progressListeners = new Set<(partial: PlaylistDetailResult) => void>()
  if (onProgress) progressListeners.add(onProgress)
  const notifyProgress = (partial: PlaylistDetailResult) => {
    for (const listener of progressListeners) {
      try { listener(partial) } catch { /* one stale view must not break shared prefetch */ }
    }
  }

  const promise = (loadPlaylistDetail(extractColor, id, notifyProgress) as unknown as Promise<PlaylistResult>)
    .finally(() => { playlistRequests.delete(id) })
  playlistRequests.set(id, { promise, progressListeners })
  return promise
}

function removeQueuedPlaylistPrefetch(id: number): void {
  if (!playlistPrefetchQueued.delete(id)) return
  const index = playlistPrefetchQueue.indexOf(id)
  if (index >= 0) playlistPrefetchQueue.splice(index, 1)
}

function drainPlaylistPrefetchQueue(): void {
  while (playlistPrefetchActive < PLAYLIST_PREFETCH_CONCURRENCY && playlistPrefetchQueue.length) {
    const id = playlistPrefetchQueue.shift()!
    playlistPrefetchQueued.delete(id)
    const cacheKey = 'playlist:' + id
    if (detailCache.age(cacheKey) !== null || playlistRequests.has(id)) continue

    playlistPrefetchActive++
    void requestPlaylistDetail(id)
      .then((data) => { if (data.detail) detailCache.set(cacheKey, data) })
      .catch(() => {})
      .finally(() => {
        playlistPrefetchActive--
        drainPlaylistPrefetchQueue()
      })
  }
}

/**
 * 卡片 hover / focus / pointer-down 触发预热。
 * 后台最多并发两张歌单，避免鼠标扫过卡片时瞬间把首屏详情接口打满。
 */
function prefetchPlaylist(id: SongId | null | undefined): void {
  const numericId = Number(id)
  if (!Number.isFinite(numericId) || numericId <= 0) return
  const cacheKey = 'playlist:' + numericId
  if (detailCache.age(cacheKey) !== null || playlistRequests.has(numericId) || playlistPrefetchQueued.has(numericId)) return
  playlistPrefetchQueued.add(numericId)
  playlistPrefetchQueue.push(numericId)
  drainPlaylistPrefetchQueue()
}

/** 搜索/资料库等批量出现卡片时，只预热最靠前的一小批，避免“预加载”变成全量下载。 */
function prefetchPlaylists(ids: Array<SongId | null | undefined>, limit = PLAYLIST_PREFETCH_BURST): void {
  const unique = [...new Set(ids.map(Number).filter(id => Number.isFinite(id) && id > 0))]
  for (const id of unique.slice(0, Math.max(0, limit))) prefetchPlaylist(id)
}

/** 歌单被改名 / 改描述 / 删除后调用：丢掉详情缓存。
 *  不丢的话缓存窗口内再进详情页看到的还是旧名字。 */
function invalidatePlaylist(id: SongId): void {
  const numericId = Number(id)
  detailCache.clear('playlist:' + id)
  if (Number.isFinite(numericId)) removeQueuedPlaylistPrefetch(numericId)
  if (_playlistDetail && String(_playlistDetail.id) === String(id)) _playlistDetail = null
}

function createPlaylistPreview(p: PlaylistPreviewInput | null, id: number): PlaylistDetail | null {
  if (!p) return null
  return {
    id: p.id || id,
    name: p.name || '加载中',
    coverImgUrl: p.coverImgUrl || p.picUrl || p.cover || '',
    picUrl: p.picUrl || p.coverImgUrl || p.cover || '',
    creator: typeof p.creator === 'string' ? { nickname: p.creator } : p.creator,
    trackCount: p.trackCount || p.size || 0,
    description: p.description || p.copywriter || p.updateFrequency || '',
    tracks: [],
  }
}

// ══════════════════════════════════════════════════
// 页面导航
// ══════════════════════════════════════════════════

async function goPlaylist(id: number | null, shouldPushRoute = true, preview: PlaylistPreviewInput | null = null): Promise<void> {
  if (!id || id <= 0) return
  if (shouldPushRoute) pushRoute(); const rid = ++_detailRequestId; _routeTransition = shouldPushRoute ? 'forward' : 'back'; _previousView = _activeView
  _activeView = 'playlist'; _selectedId = id; _heroColor = '#141414'; _playlistDetail = createPlaylistPreview(preview, id)
  _playlistDetailError = ''; _playlistDetailLoading = true; _playlistLoadingMore = false

  // 用户真的点进来时，不能在后台预取队列里排队；直接加入/发起共享请求。
  removeQueuedPlaylistPrefetch(id)

  const cacheKey = 'playlist:' + id
  const cachedAge = detailCache.age(cacheKey)
  const cached = detailCache.get(cacheKey) as PlaylistResult | null
  if (cached) {
    _playlistDetail = cached.detail; _heroColor = cached.heroColor; _playlistDetailLoading = false
    // 刚刚预热完成的缓存直接用，避免“预加载完 → 点击 → 马上又请求一遍”。
    // 只有缓存经过一段时间后才 SWR 静默刷新。
    if (cachedAge !== null && cachedAge >= PLAYLIST_REVALIDATE_AFTER_MS) {
      void requestPlaylistDetail(id)
        .then((fresh) => {
          if (fresh.detail) detailCache.set(cacheKey, fresh)
          if (rid !== _detailRequestId || _activeView !== 'playlist' || _selectedId !== id) return
          _playlistDetail = fresh.detail; _heroColor = fresh.heroColor
        })
        .catch(() => {})
    }
    return
  }

  let shownProgress = false
  let data: PlaylistResult
  try {
    data = await requestPlaylistDetail(id, (partial: PlaylistDetailResult) => {
      if (rid !== _detailRequestId) return
      _playlistDetail = partial.detail as PlaylistDetail | null; _heroColor = partial.heroColor
      if (!shownProgress && partial.detail) {
        shownProgress = true
        _playlistDetailLoading = false
      }
    })
  } catch (e) {
    if (rid !== _detailRequestId) return
    data = { detail: null, heroColor: '#141414' }; _playlistDetailError = pickErrorMessage(e, '加载失败')
  }
  if (rid !== _detailRequestId) return
  _playlistDetail = data.detail; _heroColor = data.heroColor; _playlistDetailLoading = false; _playlistLoadingMore = false
  if (data.detail) detailCache.set(cacheKey, data)
}

async function goAlbum(id: number | null, shouldPushRoute = true): Promise<void> {
  if (!id || id <= 0) return; if (shouldPushRoute) pushRoute(); const rid = ++_detailRequestId
  _routeTransition = shouldPushRoute ? 'forward' : 'back'; _previousView = _activeView; _activeView = 'album'; _selectedId = id
  _heroColor = '#141414'; _playlistDetail = null; _playlistDetailError = ''; _playlistDetailLoading = true

  const cacheKey = 'album:' + id
  const cached = detailCache.get(cacheKey) as PlaylistResult | null
  if (cached) {
    _playlistDetail = cached.detail; _heroColor = cached.heroColor; _playlistDetailLoading = false
    return
  }

  let data: PlaylistResult
  try { data = await loadAlbumDetail(extractColor, id) as unknown as PlaylistResult } catch (e) {
    if (rid !== _detailRequestId) return
    data = { detail: null, heroColor: '#141414' }; _playlistDetailError = pickErrorMessage(e, '加载失败')
  }
  if (rid !== _detailRequestId) return
  _playlistDetail = data.detail; _heroColor = data.heroColor; _playlistDetailLoading = false
  if (data.detail) detailCache.set(cacheKey, data)
}

async function goArtist(id: number | null, shouldPushRoute = true): Promise<void> {
  if (!id || id <= 0) return; if (shouldPushRoute) pushRoute(); const rid = ++_artistRequestId
  _routeTransition = shouldPushRoute ? 'forward' : 'back'; _previousView = _activeView; _activeView = 'artist'; _selectedId = id
  _heroColor = '#141414'; _artistLoading = true; _artistError = ''; _artistDetail = null; _artistSongs = []; _artistAlbums = []

  const cacheKey = 'artist:' + id
  const cached = detailCache.get(cacheKey) as ArtistResult | null
  if (cached) {
    _artistDetail = cached.artist; _artistSongs = cached.songs; _artistAlbums = cached.albums; _artistLoading = false
    return
  }

  let data: ArtistResult
  try { data = await loadArtistDetail(id) as unknown as ArtistResult } catch (e) {
    if (rid !== _artistRequestId) return
    data = { artist: null, songs: [], albums: [] }; _artistError = pickErrorMessage(e, '加载失败')
  }
  if (rid !== _artistRequestId) return
  _artistDetail = data.artist; _artistSongs = data.songs; _artistAlbums = data.albums; _artistLoading = false
  if (data.artist) detailCache.set(cacheKey, data)
}

function goUser(id: number | null, shouldPushRoute = true): void {
  if (!id || id <= 0) return
  if (shouldPushRoute) pushRoute()
  _routeTransition = shouldPushRoute ? 'forward' : 'back'
  _previousView = _activeView
  _activeView = 'user'
  _selectedId = id
  _heroColor = '#141414'
}

/** 历史日推是二级页但没有共享详情数据（页面自己拉），所以只需要压栈 + 切视图。
 *  走 handleNav 的通用分支会清空 _routeStack，从资料库进去按返回就掉回首页了。 */
function goDailyHistory(): void {
  pushRoute()
  _routeTransition = 'forward'
  _previousView = _activeView
  _activeView = 'dailyHistory'
  _selectedId = null
  _heroColor = '#141414'
}

function handleBannerClick(banner: BannerTarget): void {
  const t = banner.targetId || 0; if (banner.targetType === 10 && t > 0) goAlbum(t); else if (banner.targetType === 1000 && t > 0) goPlaylist(t)
}

async function toggleArtistFollow(): Promise<void> {
  if (!_artistDetail?.id) return; const next = !_artistDetail.followed; _artistDetail = { ..._artistDetail, followed: next }
  try { await ncm.artistSub(_artistDetail.id, next) } catch { _artistDetail = { ..._artistDetail, followed: !next } }
  detailCache.set('artist:' + _artistDetail.id, { artist: _artistDetail, songs: _artistSongs, albums: _artistAlbums })
}

// ── 详情视图播放 wrapper（共享数据） ──
function playlistLoadedCount(): number {
  return _playlistDetail?.tracks?.length || 0
}
function canLoadMorePlaylist(): boolean {
  const trackIds = _playlistDetail?.trackIds
  return !!trackIds?.length && trackIds.length > playlistLoadedCount()
}

/** 加载下一批歌单曲目（滚动触底 / 播放全部补齐共用） */
async function loadMorePlaylist(): Promise<void> {
  if (_playlistLoadingMore || !_playlistDetail || !canLoadMorePlaylist()) return
  const rid = _detailRequestId
  _playlistLoadingMore = true
  try {
    await loadPlaylistMore(_playlistDetail as unknown as PlaylistDetailRecord, (partial) => {
      if (rid !== _detailRequestId) return
      _playlistDetail = partial.detail as PlaylistDetail | null
    })
    if (rid === _detailRequestId && _playlistDetail) {
      detailCache.set('playlist:' + _playlistDetail.id, { detail: _playlistDetail, heroColor: _heroColor })
    }
  } catch (e) {
    if (rid === _detailRequestId) _playlistDetailError = pickErrorMessage(e, '加载更多失败')
  } finally {
    if (rid === _detailRequestId) _playlistLoadingMore = false
  }
}

function playTrack(id: SongId, visibleTracks?: DetailTrack[] | null): void {
  const tracks = visibleTracks?.length ? visibleTracks : _playlistDetail?.tracks || []
  const i = tracks.findIndex(x => x.id === id); if (i >= 0) player.playQueue(tracks, i); else player.playTrack(tracks.find(x => x.id === id) || { id }, 0)
}
function playAll(visibleTracks?: DetailTrack[] | null): void {
  const t = visibleTracks?.length ? visibleTracks : _playlistDetail?.tracks || []
  if (!t.length) return
  // 歌单内搜索过滤出的子集，或没有更多可加载 → 播传入的这批
  if (!canLoadMorePlaylist() || (visibleTracks?.length ?? 0) < playlistLoadedCount()) {
    player.playQueue(t, 0)
    return
  }
  // 播放全部：先补齐剩余曲目，再播整张
  void (async () => {
    if (_playlistLoadingMore) return
    const rid = _detailRequestId
    _playlistLoadingMore = true
    try {
      let guard = 0
      while (canLoadMorePlaylist() && guard++ < 64) {
        const before = playlistLoadedCount()
        await loadPlaylistMore(_playlistDetail as unknown as PlaylistDetailRecord, (partial) => {
          if (rid !== _detailRequestId) return
          _playlistDetail = partial.detail as PlaylistDetail | null
        })
        if (playlistLoadedCount() <= before) break // 拉不到新数据，避免死循环
      }
      if (rid === _detailRequestId && _playlistDetail?.tracks?.length) {
        detailCache.set('playlist:' + _playlistDetail.id, { detail: _playlistDetail, heroColor: _heroColor })
        player.playQueue(_playlistDetail.tracks, 0)
      }
    } catch (e) {
      if (rid === _detailRequestId) _playlistDetailError = pickErrorMessage(e, '加载歌单失败')
    } finally {
      if (rid === _detailRequestId) _playlistLoadingMore = false
    }
  })()
}
function playArtistTrack(t: DetailTrack | null | undefined): void { if (!t) return; const i = _artistSongs.findIndex(x => x.id === t.id); if (i >= 0) player.playQueue(_artistSongs, i); else player.playTrack(t, 0) }
function playArtistAll(): void { if (_artistSongs.length) player.playQueue(_artistSongs, 0) }
function playExploreSong(t: DetailTrack | null | undefined): void { if (t) player.playTrack(t, 0) }

function handleNav(view: string, extra?: number | null, preserveSource = false): void {
  invalidateDetailRequests()
  if (view === 'profile') view = 'home'
  if (isMobileDevice() && view === 'home') view = 'library'
  if (view === 'playlist' && extra) { goPlaylist(extra); return }
  if (view === 'album' && extra) { goAlbum(extra); return }
  if (view === 'artist' && extra) { goArtist(extra); return }
  if (view === 'user' && extra) { goUser(extra); return }
  if (view === 'dailyHistory') { goDailyHistory(); return }
  if (preserveSource && view !== _activeView) pushRoute()
  else if (!preserveSource) _routeStack = []
  _routeTransition = preserveSource ? 'forward' : 'soft'; _previousView = _activeView; _activeView = view; _selectedId = null
  _heroColor = '#141414'; _playlistDetail = null; _artistDetail = null; _artistSongs = []; _artistAlbums = []
  _playlistDetailError = ''; _playlistDetailLoading = false; _artistError = ''; _artistLoading = false
}

function goBack(): void {
  invalidateDetailRequests(); const prev = _routeStack[_routeStack.length - 1]; _routeStack = _routeStack.slice(0, -1)
  if (!prev) { handleNav(isMobileDevice() ? 'explore' : 'home'); return }
  if (prev.view === 'playlist') { goPlaylist(prev.id, false); return }
  if (prev.view === 'album') { goAlbum(prev.id, false); return }
  if (prev.view === 'artist') { goArtist(prev.id, false); return }
  if (prev.view === 'user') { goUser(prev.id, false); return }
  const bv = prev.view || 'home'; _routeTransition = 'back'; _previousView = _activeView; _activeView = bv
  _selectedId = null; _heroColor = '#141414'; _playlistDetail = null; _artistDetail = null; _artistSongs = []; _artistAlbums = []
}

// ══════════════════════════════════════════════════
/** 歌单元数据变更广播。歌单对象在侧边栏、PC/移动端列表、歌单选择面板里各存了一份，
 *  不广播就会出现「改完名别处还是旧的」 */
export const PLAYLIST_CHANGE = 'playlist-change'
export function notifyPlaylistChange(id: SongId): void {
  invalidatePlaylist(id)
  window.dispatchEvent(new CustomEvent(PLAYLIST_CHANGE, { detail: { id } }))
}

export const router = {
  get activeView() { return _activeView }, set activeView(v: string) { _activeView = v },
  get previousView() { return _previousView }, get selectedId() { return _selectedId },
  get isSecondaryView() { return !TOP_LEVEL_VIEWS.has(_activeView) },
  get routeStack() { return _routeStack }, get routeTransition() { return _routeTransition },
  get refreshKey() { return _refreshKey },

  // 共享详情
  get heroColor() { return _heroColor },
  get playlistDetail() { return _playlistDetail }, get playlistDetailLoading() { return _playlistDetailLoading },
  get playlistLoadingMore() { return _playlistLoadingMore }, get playlistDetailError() { return _playlistDetailError },
  get playlistHasMore() { return canLoadMorePlaylist() },
  get artistDetail() { return _artistDetail }, get artistSongs() { return _artistSongs },
  get artistAlbums() { return _artistAlbums }, get artistLoading() { return _artistLoading }, get artistError() { return _artistError },

  // 导航
  handleNav, goBack, goPlaylist, goAlbum, goArtist, goUser, handleBannerClick, prefetchPlaylist, prefetchPlaylists,

  // 详情播放 wrapper
  playAll, playTrack, playArtistAll, playArtistTrack, playExploreSong, toggleArtistFollow,
  loadMorePlaylist,
}
