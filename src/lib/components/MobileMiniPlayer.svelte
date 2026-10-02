<script lang="ts">
  import type { DisplayLyricLine } from '../services/lyrics-loader.ts'
  import { getCachedLyrics, loadLyrics } from '../services/lyrics-loader.ts'
  import { player } from '../stores/player.svelte.ts'
  import { coverUrl } from '../utils/image.ts'
  import Icon from './ui/Icon.svelte'
  import { miniLyricMotion } from '../app/mobile-player-motion.ts'

  let { onOpenSheet, onToggleQueue, showQueuePanel = false }: {
    onOpenSheet: (origin: Element) => void
    onToggleQueue: () => void
    showQueuePanel?: boolean
  } = $props()
  let artwork: HTMLElement
  let lyrics = $state<DisplayLyricLine[]>([])
  let lyricLoading = $state(false)
  let coverFailed = $state(false)
  let start: { x: number; y: number; id: number } | null = null
  let moved = false
  let cover = $derived(coverUrl(player.cover, 88))
  let currentLyric = $derived.by(() => {
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (player.currentTime >= Number(lyrics[i]!.time)) return lyrics[i]!.text
    }
    return ''
  })
  let secondary = $derived(player.error || (player.webdavDownloading
    ? `正在下载 ${player.webdavDownloading.name}${player.webdavDownloading.percent >= 0 ? ` ${player.webdavDownloading.percent}%` : ''}`
    : player.loading ? '正在载入…' : lyricLoading ? '正在同步歌词…' : currentLyric || player.artist || '打开播放器'))
  let progress = $derived(player.duration > 0 ? Math.max(0, Math.min(100, player.currentTime / player.duration * 100)) : 0)
  let showingLyric = $derived(!!currentLyric && !player.error && !player.webdavDownloading && !player.loading && !lyricLoading)

  $effect(() => { cover; coverFailed = false })
  $effect(() => {
    const id = player.id
    const local = player.currentTrack?.source === 'local'
    let cancelled = false
    const cached = id && !local ? getCachedLyrics(id) || [] : []
    lyrics = cached
    lyricLoading = !!id && !local && !cached.length
    if (id && !local) {
      loadLyrics(id).then(lines => { if (!cancelled) lyrics = lines })
        .catch(() => { if (!cancelled) lyrics = [] })
        .finally(() => { if (!cancelled) lyricLoading = false })
    }
    return () => { cancelled = true }
  })

  function down(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return
    start = { x: event.clientX, y: event.clientY, id: event.pointerId }
    moved = false
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent) {
    if (start?.id !== event.pointerId) return
    moved ||= Math.max(Math.abs(event.clientX - start.x), Math.abs(event.clientY - start.y)) >= 10
  }
  function finish(event: PointerEvent) {
    if (start?.id !== event.pointerId) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    move(event)
    start = null
    if (event.type !== 'pointerup') { moved = true; return }
    if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) player.next()
      else player.prev()
    } else if (dy <= -56 && Math.abs(dy) > Math.abs(dx) * 1.4 && player.id) onOpenSheet(artwork)
  }
  function open(event: MouseEvent) {
    if (event.detail !== 0 && moved) { event.preventDefault(); return }
    if (player.id) onOpenSheet(artwork)
  }
</script>

<div class="player-bar mobile-mini-player" role="group" aria-label="迷你播放器">
  <button class="mini-player-open" type="button" aria-label={`打开播放器：${player.title || '未在播放'}`} disabled={!player.id}
    onclick={open} onpointerdown={down} onpointermove={move} onpointerup={finish} onpointercancel={finish}>
    <span class="mini-player-artwork lcd-artwork" bind:this={artwork}>
      {#if cover && !coverFailed}<img class="lcd-artwork__img" src={cover} alt="" referrerpolicy="no-referrer" onerror={() => coverFailed = true} />
      {:else}<Icon name="music" size={22} />{/if}
    </span>
    <span class="mini-player-info"><strong>{player.title || '未在播放'}</strong><small class:error={!!player.error} use:miniLyricMotion={{ text: secondary, lyric: showingLyric, song: player.id }}>{secondary}</small></span>
  </button>
  <button class="mini-player-play" class:playing={player.playing} type="button" disabled={!player.id} aria-label={player.playing ? '暂停' : '播放'} onclick={() => player.togglePlay()}>
    <span class="mini-player-play-icon" aria-hidden="true"><Icon name="play" size={24} fill="currentColor" /></span>
    <span class="mini-player-pause-icon" aria-hidden="true"><Icon name="pause" size={24} fill="currentColor" /></span>
  </button>
  <button class="mini-player-queue" type="button" class:active={showQueuePanel} aria-label="播放列表" aria-expanded={showQueuePanel} onclick={onToggleQueue}>
    <Icon name="list" size={22} />
  </button>
  <span class="mini-player-progress" aria-hidden="true"><span style={`width:${progress}%`}></span></span>
</div>
