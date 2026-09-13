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
import { loadAlbumDetail, loadArtistDetail, loadPlaylistDetail, type PlaylistDetailResult } from '../services/details.ts'
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
const detailCache = createLruCache<DetailCacheValue>({ maxEntries: 24, ttlMs: 3 * 60 * 1000 })

// ── 工具 ──
function currentRoute(): RouteEntry { return { view: _activeView, id: _selectedId } }
function pushRoute(): void { _routeStack = [..._routeStack, currentRoute()] }
function invalidateDetailRequests(): void { _detailRequestId++; _artistRequestId++ }

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
  if (shouldPushRoute) pushRoute(); const rid = ++_detailRequestId; _routeTransition = 'book-turn'; _previousView = _activeView
  _activeView = 'playlist'; _selectedId = id; _heroColor = '#141414'; _playlistDetail = createPlaylistPreview(preview, id)
  _playlistDetailError = ''; _playlistDetailLoading = true; _playlistLoadingMore = false

  const cacheKey = 'playlist:' + id
  const cached = detailCache.get(cacheKey) as PlaylistResult | null
  if (cached) {
    _playlistDetail = cached.detail; _heroColor = cached.heroColor; _playlistDetailLoading = false
    return
  }

  let loadedFirstBatch = false
  let data: PlaylistResult
  try {
    data = await loadPlaylistDetail(extractColor, id, (partial: PlaylistDetailResult) => {
      if (rid !== _detailRequestId) return
      _playlistDetail = partial.detail as PlaylistDetail | null; _heroColor = partial.heroColor
      if (!loadedFirstBatch) { loadedFirstBatch = true; _playlistDetailLoading = false; if ((partial.detail?.trackIds?.length || 0) > (partial.detail?.tracks?.length || 0)) _playlistLoadingMore = true }
    }) as unknown as PlaylistResult
  } catch (e) { data = { detail: null, heroColor: '#141414' }; _playlistDetailError = pickErrorMessage(e, '加载失败') }
  if (rid !== _detailRequestId) return
  _playlistDetail = data.detail; _heroColor = data.heroColor; _playlistDetailLoading = false; _playlistLoadingMore = false
  if (data.detail) detailCache.set(cacheKey, data)
}

async function goAlbum(id: number | null, shouldPushRoute = true): Promise<void> {
  if (!id || id <= 0) return; if (shouldPushRoute) pushRoute(); const rid = ++_detailRequestId
  _routeTransition = 'book-turn'; _previousView = _activeView; _activeView = 'album'; _selectedId = id
  _heroColor = '#141414'; _playlistDetail = null; _playlistDetailError = ''; _playlistDetailLoading = true

  const cacheKey = 'album:' + id
  const cached = detailCache.get(cacheKey) as PlaylistResult | null
  if (cached) {
    _playlistDetail = cached.detail; _heroColor = cached.heroColor; _playlistDetailLoading = false
    return
  }

  let data: PlaylistResult
  try { data = await loadAlbumDetail(extractColor, id) as unknown as PlaylistResult } catch (e) { data = { detail: null, heroColor: '#141414' }; _playlistDetailError = pickErrorMessage(e, '加载失败') }
  if (rid !== _detailRequestId) return
  _playlistDetail = data.detail; _heroColor = data.heroColor; _playlistDetailLoading = false
  if (data.detail) detailCache.set(cacheKey, data)
}

async function goArtist(id: number | null, shouldPushRoute = true): Promise<void> {
  if (!id || id <= 0) return; if (shouldPushRoute) pushRoute(); const rid = ++_artistRequestId
  _routeTransition = 'book-turn'; _previousView = _activeView; _activeView = 'artist'; _selectedId = id
  _heroColor = '#141414'; _artistLoading = true; _artistError = ''; _artistDetail = null; _artistSongs = []; _artistAlbums = []

  const cacheKey = 'artist:' + id
  const cached = detailCache.get(cacheKey) as ArtistResult | null
  if (cached) {
    _artistDetail = cached.artist; _artistSongs = cached.songs; _artistAlbums = cached.albums; _artistLoading = false
    return
  }

  let data: ArtistResult
  try { data = await loadArtistDetail(id) as unknown as ArtistResult } catch (e) { data = { artist: null, songs: [], albums: [] }; _artistError = pickErrorMessage(e, '加载失败') }
  if (rid !== _artistRequestId) return
  _artistDetail = data.artist; _artistSongs = data.songs; _artistAlbums = data.albums; _artistLoading = false
  if (data.artist) detailCache.set(cacheKey, data)
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
function playTrack(id: SongId, visibleTracks?: DetailTrack[] | null): void {
  const tracks = visibleTracks?.length ? visibleTracks : _playlistDetail?.tracks || []
  const i = tracks.findIndex(x => x.id === id); if (i >= 0) player.playQueue(tracks, i); else player.playTrack(tracks.find(x => x.id === id) || { id }, 0)
}
function playAll(visibleTracks?: DetailTrack[] | null): void { const t = visibleTracks?.length ? visibleTracks : _playlistDetail?.tracks || []; if (t.length) player.playQueue(t, 0) }
function playArtistTrack(t: DetailTrack | null | undefined): void { if (!t) return; const i = _artistSongs.findIndex(x => x.id === t.id); if (i >= 0) player.playQueue(_artistSongs, i); else player.playTrack(t, 0) }
function playArtistAll(): void { if (_artistSongs.length) player.playQueue(_artistSongs, 0) }
function playExploreSong(t: DetailTrack | null | undefined): void { if (t) player.playTrack(t, 0) }

function handleNav(view: string, extra?: number | null): void {
  invalidateDetailRequests()
  if (view === 'profile') view = 'home'
  if (view === 'playlist' && extra) { goPlaylist(extra); return }
  if (view === 'album' && extra) { goAlbum(extra); return }
  if (view === 'artist' && extra) { goArtist(extra); return }
  _routeTransition = 'soft'; _routeStack = []; _previousView = _activeView; _activeView = view; _selectedId = null
  _heroColor = '#141414'; _playlistDetail = null; _artistDetail = null; _artistSongs = []; _artistAlbums = []
  _playlistDetailError = ''; _playlistDetailLoading = false; _artistError = ''; _artistLoading = false
}

function goBack(): void {
  invalidateDetailRequests(); const prev = _routeStack[_routeStack.length - 1]; _routeStack = _routeStack.slice(0, -1)
  if (!prev) { handleNav('home'); return }
  if (prev.view === 'playlist') { goPlaylist(prev.id, false); return }
  if (prev.view === 'album') { goAlbum(prev.id, false); return }
  if (prev.view === 'artist') { goArtist(prev.id, false); return }
  const bv = prev.view || 'home'; _routeTransition = 'soft'; _previousView = _activeView; _activeView = bv
  _selectedId = null; _heroColor = '#141414'; _playlistDetail = null; _artistDetail = null; _artistSongs = []; _artistAlbums = []
}

// ══════════════════════════════════════════════════
export const router = {
  get activeView() { return _activeView }, set activeView(v: string) { _activeView = v },
  get previousView() { return _previousView }, get selectedId() { return _selectedId },
  get routeStack() { return _routeStack }, get routeTransition() { return _routeTransition },
  get refreshKey() { return _refreshKey },

  // 共享详情
  get heroColor() { return _heroColor },
  get playlistDetail() { return _playlistDetail }, get playlistDetailLoading() { return _playlistDetailLoading },
  get playlistLoadingMore() { return _playlistLoadingMore }, get playlistDetailError() { return _playlistDetailError },
  get artistDetail() { return _artistDetail }, get artistSongs() { return _artistSongs },
  get artistAlbums() { return _artistAlbums }, get artistLoading() { return _artistLoading }, get artistError() { return _artistError },

  // 导航
  handleNav, goBack, goPlaylist, goAlbum, goArtist, handleBannerClick,

  // 详情播放 wrapper
  playAll, playTrack, playArtistAll, playArtistTrack, playExploreSong, toggleArtistFollow,
}
