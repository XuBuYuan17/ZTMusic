/**
 * usePlaylist — composable for playlist/album detail logic
 *
 * Pure logic, no UI. Handles data fetching, loading states,
 * error handling, and playback actions.
 */
import { player } from '../stores/player.svelte.js'
import { ncm } from '../api/client.js'
import { extractColor } from '../player/colors.js'
import { loadPlaylistDetail, loadAlbumDetail } from '../services/details.js'

/**
 * @param {Function} [extractColorFn] — optional color extraction, defaults to import
 */
export function usePlaylist() {
  let detail = $state(null)
  let loading = $state(false)
  let loadingMore = $state(false)
  let error = $state('')
  let heroColor = $state('#141414')
  let selectedId = $state(null)
  let requestId = 0

  function createPreview(playlist, id) {
    if (!playlist) return null
    return {
      id: playlist.id || id,
      name: playlist.name || '加载中',
      coverImgUrl: playlist.coverImgUrl || playlist.picUrl || playlist.cover || '',
      picUrl: playlist.picUrl || playlist.coverImgUrl || playlist.cover || '',
      creator: typeof playlist.creator === 'string' ? { nickname: playlist.creator } : playlist.creator,
      trackCount: playlist.trackCount || playlist.size || 0,
      description: playlist.description || playlist.copywriter || playlist.updateFrequency || '',
      tracks: [],
    }
  }

  async function fetchPlaylist(id, preview = null) {
    if (!id || id <= 0) return
    const reqId = ++requestId
    selectedId = id
    error = ''
    heroColor = '#141414'
    detail = createPreview(preview, id)
    loading = true
    let loadedFirstBatch = false
    let data
    try {
      data = await loadPlaylistDetail(ncm, extractColor, id, (partial) => {
        if (reqId === requestId) {
          detail = partial.detail
          heroColor = partial.heroColor
          if (!loadedFirstBatch) {
            loadedFirstBatch = true
            loading = false
            const total = partial.detail?.trackIds?.length || 0
            const have = partial.detail?.tracks?.length || 0
            if (have < total) loadingMore = true
          }
        }
      })
    } catch (err) {
      data = { detail: null, heroColor: '#141414' }
      error = err?.message || '歌单详情加载失败'
    }
    if (reqId !== requestId) return
    detail = data.detail
    heroColor = data.heroColor
    loading = false
    loadingMore = false
  }

  async function fetchAlbum(id) {
    if (!id || id <= 0) return
    const reqId = ++requestId
    selectedId = id
    error = ''
    heroColor = '#141414'
    detail = null
    loading = true
    let data
    try {
      data = await loadAlbumDetail(ncm, extractColor, id)
    } catch (err) {
      data = { detail: null, heroColor: '#141414' }
      error = err?.message || '专辑详情加载失败'
    }
    if (reqId !== requestId) return
    detail = data.detail
    heroColor = data.heroColor
    loading = false
  }

  function playAll(visibleTracks) {
    const tracks = visibleTracks?.length ? visibleTracks : detail?.tracks || []
    if (tracks.length) player.playQueue(tracks, 0)
  }

  function playTrack(id, visibleTracks) {
    const tracks = visibleTracks?.length ? visibleTracks : detail?.tracks || []
    const idx = tracks.findIndex(t => t.id === id)
    if (idx >= 0) player.playQueue(tracks, idx)
    else player.playTrack(tracks.find(t => t.id === id) || { id }, 0)
  }

  function invalidate() {
    requestId++
  }

  return {
    get detail() { return detail },
    get loading() { return loading },
    get loadingMore() { return loadingMore },
    get error() { return error },
    get heroColor() { return heroColor },
    get selectedId() { return selectedId },
    fetchPlaylist,
    fetchAlbum,
    playAll,
    playTrack,
    invalidate,
    createPreview,
  }
}
