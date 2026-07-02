/**
 * Router — 导航路由 + 共享详情视图（歌单/专辑/歌手）。
 * 各独立页面（首页、探索、日推等）的数据由页面组件自加载。
 *
 * 使用: import { router } from './stores/router.svelte.js'
 */
import { ncm } from '../api/client.js'
import { player } from './player.svelte.js'
import { auth } from './auth.svelte.js'
import { extractColor } from '../player/colors.js'
import { loadAlbumDetail, loadArtistDetail, loadPlaylistDetail } from '../services/details.js'

// ── 导航状态 ──
let _activeView = $state('home')
let _previousView = $state('home')
let _selectedId = $state(null)
let _routeStack = $state([])
let _routeTransition = $state('soft')
let _refreshKey = $state(Date.now())

// ── 共享详情视图（导航共享） ──
let _heroColor = $state('#141414')
let _playlistDetail = $state(null)
let _playlistDetailLoading = $state(false)
let _playlistLoadingMore = $state(false)
let _playlistDetailError = $state('')

let _artistDetail = $state(null)
let _artistSongs = $state([])
let _artistAlbums = $state([])
let _artistLoading = $state(false)
let _artistError = $state('')

let _detailRequestId = 0
let _artistRequestId = 0

// ── 工具 ──
function currentRoute() { return { view: _activeView, id: _selectedId } }
function pushRoute() { _routeStack = [..._routeStack, currentRoute()] }
function invalidateDetailRequests() { _detailRequestId++; _artistRequestId++ }

function createPlaylistPreview(p, id) {
  if (!p) return null
  return { id: p.id || id, name: p.name || '加载中', coverImgUrl: p.coverImgUrl || p.picUrl || p.cover || '', picUrl: p.picUrl || p.coverImgUrl || p.cover || '', creator: typeof p.creator === 'string' ? { nickname: p.creator } : p.creator, trackCount: p.trackCount || p.size || 0, description: p.description || p.copywriter || p.updateFrequency || '', tracks: [] }
}

// ══════════════════════════════════════════════════
// 页面导航
// ══════════════════════════════════════════════════

async function goPlaylist(id, shouldPushRoute = true, preview = null) {
  if (!id || id <= 0) return
  if (shouldPushRoute) pushRoute(); const rid = ++_detailRequestId; _routeTransition = 'book-turn'; _previousView = _activeView
  _activeView = 'playlist'; _selectedId = id; _heroColor = '#141414'; _playlistDetail = createPlaylistPreview(preview, id)
  _playlistDetailError = ''; _playlistDetailLoading = true; let loadedFirstBatch = false, data
  try {
    data = await loadPlaylistDetail(ncm, extractColor, id, (partial) => {
      if (rid !== _detailRequestId) return
      _playlistDetail = partial.detail; _heroColor = partial.heroColor
      if (!loadedFirstBatch) { loadedFirstBatch = true; _playlistDetailLoading = false; if ((partial.detail?.trackIds?.length || 0) > (partial.detail?.tracks?.length || 0)) _playlistLoadingMore = true }
    })
  } catch (e) { data = { detail: null, heroColor: '#141414' }; _playlistDetailError = e?.message || '加载失败' }
  if (rid !== _detailRequestId) return; _playlistDetail = data.detail; _heroColor = data.heroColor; _playlistDetailLoading = false; _playlistLoadingMore = false
}

async function goAlbum(id, shouldPushRoute = true) {
  if (!id || id <= 0) return; if (shouldPushRoute) pushRoute(); const rid = ++_detailRequestId
  _routeTransition = 'book-turn'; _previousView = _activeView; _activeView = 'album'; _selectedId = id
  _heroColor = '#141414'; _playlistDetail = null; _playlistDetailError = ''; _playlistDetailLoading = true
  let data; try { data = await loadAlbumDetail(ncm, extractColor, id) } catch (e) { data = { detail: null, heroColor: '#141414' }; _playlistDetailError = e?.message || '加载失败' }
  if (rid !== _detailRequestId) return; _playlistDetail = data.detail; _heroColor = data.heroColor; _playlistDetailLoading = false
}

async function goArtist(id, shouldPushRoute = true) {
  if (!id || id <= 0) return; if (shouldPushRoute) pushRoute(); const rid = ++_artistRequestId
  _routeTransition = 'book-turn'; _previousView = _activeView; _activeView = 'artist'; _selectedId = id
  _heroColor = '#141414'; _artistLoading = true; _artistError = ''; _artistDetail = null; _artistSongs = []; _artistAlbums = []
  let data; try { data = await loadArtistDetail(ncm, id) } catch (e) { data = { artist: null, songs: [], albums: [] }; _artistError = e?.message || '加载失败' }
  if (rid !== _artistRequestId) return; _artistDetail = data.artist; _artistSongs = data.songs; _artistAlbums = data.albums; _artistLoading = false
}

function handleBannerClick(banner) {
  const t = banner.targetId || 0; if (banner.targetType === 10 && t > 0) goAlbum(t); else if (banner.targetType === 1000 && t > 0) goPlaylist(t)
}

async function toggleArtistFollow() {
  if (!_artistDetail?.id) return; const next = !_artistDetail.followed; _artistDetail = { ..._artistDetail, followed: next }
  try { await ncm.artistSub(_artistDetail.id, next) } catch { _artistDetail = { ..._artistDetail, followed: !next } }
}

// ── 详情视图播放 wrapper（共享数据） ──
function playTrack(id, visibleTracks) {
  const tracks = visibleTracks?.length ? visibleTracks : _playlistDetail?.tracks || []
  const i = tracks.findIndex(x => x.id === id); if (i >= 0) player.playQueue(tracks, i); else player.playTrack(tracks.find(x => x.id === id) || { id }, 0)
}
function playAll(visibleTracks) { const t = visibleTracks?.length ? visibleTracks : _playlistDetail?.tracks || []; if (t.length) player.playQueue(t, 0) }
function playArtistTrack(t) { if (!t) return; const i = _artistSongs.findIndex(x => x.id === t.id); if (i >= 0) player.playQueue(_artistSongs, i); else player.playTrack(t, 0) }
function playArtistAll() { if (_artistSongs.length) player.playQueue(_artistSongs, 0) }
function playExploreSong(t) { if (t) player.playTrack(t, 0) }

function handleNav(view, extra) {
  invalidateDetailRequests()
  if (view === 'profile') view = 'home'
  if (view === 'playlist' && extra) { goPlaylist(extra); return }
  if (view === 'album' && extra) { goAlbum(extra); return }
  if (view === 'artist' && extra) { goArtist(extra); return }
  _routeTransition = 'soft'; _routeStack = []; _previousView = _activeView; _activeView = view; _selectedId = null
  _heroColor = '#141414'; _playlistDetail = null; _artistDetail = null; _artistSongs = []; _artistAlbums = []
  _playlistDetailError = ''; _playlistDetailLoading = false; _artistError = ''; _artistLoading = false
}

function goBack() {
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
  get activeView() { return _activeView }, set activeView(v) { _activeView = v },
  get previousView() { return _previousView }, get selectedId() { return _selectedId },
  get routeStack() { return _routeStack }, get routeTransition() { return _routeTransition },
  get refreshKey() { return _refreshKey },

  get recommendPlaylists() { return _recommendPlaylists },

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
