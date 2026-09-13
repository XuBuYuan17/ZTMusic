/**
 * useLyrics — shared lyrics state & fetching
 *
 * Centralises lyric parsing, yrc loading, and current-line tracking
 * so both mobile (AppleMusicPlayer) and PC (PCPlayer) stay in sync.
 */
import type { DisplayLyricLine } from '../services/lyrics-loader.ts'
import { player } from '../stores/player.svelte.ts'
import { getCachedLyrics, loadLyrics } from '../services/lyrics-loader.ts'
import { debugLog } from '../utils/error.ts'

export function useLyrics() {
  let lyrics = $state<DisplayLyricLine[]>([])
  let loading = $state(false)
  let requestId = 0

  let highlightIndex = $derived.by((): number => {
    if (lyrics.length === 0) return -1
    const now = player.currentTime
    for (let i = lyrics.length - 1; i >= 0; i--) if (now >= Number(lyrics[i]!.time)) return i
    return -1
  })

  async function refresh(): Promise<void> {
    const id = player.id
    if (!id || player.currentTrack?.source === 'local') { lyrics = []; loading = false; return }
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
    } catch (err) {
      const message = (err as { message?: unknown } | null | undefined)?.message
      debugLog('useLyrics', 'fetch-error', { id, error: message || String(err) })
    }

    if (reqId === requestId) loading = false
  }

  function clear(): void {
    requestId++
    lyrics = []
    loading = false
  }

  // Auto-fetch when the playing track changes
  $effect(() => {
    const id = player.id
    const isLocal = player.currentTrack?.source === 'local'
    if (!id || isLocal) { clear(); return }
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
