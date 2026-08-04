/**
 * useLyrics — shared lyrics state & fetching
 *
 * Centralises lyric parsing, yrc loading, and current-line tracking
 * so both mobile (AppleMusicPlayer) and PC (PCPlayer) stay in sync.
 */
import { player } from '../stores/player.svelte.js'
import { getCachedLyrics, loadLyrics } from '../services/lyrics-loader.js'
import { debugLog } from '../utils/error.js'

export function useLyrics() {
  let lyrics = $state([])
  let loading = $state(false)
  let requestId = 0

  let highlightIndex = $derived.by(() => {
    if (lyrics.length === 0) return -1
    const now = player.currentTime
    for (let i = lyrics.length - 1; i >= 0; i--) if (now >= lyrics[i].time) return i
    return -1
  })

  async function refresh() {
    const id = player.id
    if (!id) { lyrics = []; loading = false; return }
    const reqId = ++requestId
    const cached = getCachedLyrics(id)
    if (cached) {
      lyrics = cached
      loading = false
      return
    }
    loading = true

    try {
      const lines = await loadLyrics(id)
      if (reqId !== requestId || player.id !== id) return
      lyrics = lines
    } catch (err) { debugLog('useLyrics', 'fetch-error', { id, error: err?.message || String(err) }) }

    if (reqId === requestId) loading = false
  }

  function clear() {
    requestId++
    lyrics = []
    loading = false
  }

  // Auto-fetch when the playing track changes
  $effect(() => {
    const id = player.id
    if (!id) { clear(); return }
    lyrics = []
    refresh()
  })

  return {
    get lyrics() { return lyrics },
    get loading() { return loading },
    get highlightIndex() { return highlightIndex },
    refresh,
    clear,
  }
}
