/**
 * useLyrics — shared lyrics state & fetching
 *
 * Centralises lyric parsing, yrc loading, and current-line tracking
 * so both mobile (AppleMusicPlayer) and PC (PCPlayer) stay in sync.
 */
import { player } from '../stores/player.svelte.js'
import { ncm } from '../api/client.js'
import { parseLyricResponse, parseYrc } from '../utils/lyrics.js'

function splitWords(text = '') {
  return (text || '').trim().split(/\s+/).map(w => w.trim()).filter(Boolean)
}

export function useLyrics() {
  let lyrics = $state([])
  let yrcLines = $state([])
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
    if (!id) { lyrics = []; yrcLines = []; loading = false; return }
    const reqId = ++requestId
    loading = true

    try {
      const res = await ncm.lyric(id).catch(() => null)
      if (reqId !== requestId || player.id !== id) return
      const base = parseLyricResponse(res || {})
      lyrics = base.lines.map(l => ({
        time: l.time,
        text: l.content,
        translation: l.translation,
        words: l.content ? splitWords(l.content) : [],
      }))
    } catch {}

    try {
      const newRes = await ncm.lyricNew(id).catch(() => null)
      if (reqId !== requestId || player.id !== id) return
      if (newRes?.yrc?.lyric) {
        const yrc = parseYrc(newRes.yrc.lyric)
        if (yrc.length > 0) yrcLines = yrc
      }
    } catch {}

    if (reqId === requestId) loading = false
  }

  function clear() {
    requestId++
    lyrics = []
    yrcLines = []
    loading = false
  }

  // Auto-fetch when the playing track changes
  $effect(() => {
    const id = player.id
    if (!id) { clear(); return }
    lyrics = []
    yrcLines = []
    refresh()
  })

  return {
    get lyrics() { return lyrics },
    get yrcLines() { return yrcLines },
    get loading() { return loading },
    get highlightIndex() { return highlightIndex },
    refresh,
    clear,
  }
}
