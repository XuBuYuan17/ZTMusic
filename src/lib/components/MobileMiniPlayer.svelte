<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { fly } from 'svelte/transition'
  import type { PlayerSurfaceController } from '../player-motion/controller.ts'
  import { playerSurfaceGesture } from '../player-motion/gesture.ts'
  import { player } from '../stores/player.svelte.ts'
  import { getStartupTrack } from '../app/startup-track.ts'
  import { coverUrl, progressiveCover } from '../utils/image.ts'
  import Icon from './ui/Icon.svelte'
  import { engine } from '../player/engine.ts'
  import { miniTrackPreview } from '../player/mini-track-preview.ts'

  let { controller, onOpenSheet, onToggleQueue, showQueuePanel = false }: {
    controller: PlayerSurfaceController
    onOpenSheet: (origin: Element) => void
    onToggleQueue: () => void
    showQueuePanel?: boolean
  } = $props()
  let artwork = $state<HTMLElement>()
  let coverFailed = $state(false)
  let swipeX = $state(0)
  let draggingTrack = $state(false)
  let switchingTrack = $state(false)
  let trackDirection = $state(1)
  let switchTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let previewDirection = $derived<1 | -1>(swipeX < 0 ? 1 : -1)
  let previewProgress = $derived(Math.min(1, Math.abs(swipeX) / 56))
  let previewTrack = $derived(miniTrackPreview(player.queue, player.queueIndex, player.id, player.mode, player.shuffleState, engine.native === true, previewDirection))
  let previewArtist = $derived(previewTrack?.ar.map(artist => artist.name).filter(Boolean).join(' / ') || '')
  let initialTrack = $derived(getStartupTrack(player))
  let coverSource = $derived(player.cover || initialTrack?.picUrl || '')
  let title = $derived(player.title || initialTrack?.name || '未在播放')
  let cover = $derived(coverUrl(coverSource, 88))
  // Android native state can briefly report loading=true after playback is already active.
  // Once playing=true, playback is the stronger UI truth and the mini player must not
  // remain stuck on “正在载入…”.
  let playbackLoading = $derived(player.loading && !player.playing)
  let status = $derived(player.error || (player.webdavDownloading
    ? `正在下载 ${player.webdavDownloading.name}${player.webdavDownloading.percent >= 0 ? ` ${player.webdavDownloading.percent}%` : ''}`
    : playbackLoading ? '正在载入…' : ''))
  $effect(() => { cover; coverFailed = false })

  function switchTrack(direction: 1 | -1) {
    if (switchingTrack || !player.id) return
    switchingTrack = true
    trackDirection = direction
    swipeX = direction > 0 ? -72 : 72
    const currentId = player.id
    const queueRevision = player.queueRevision
    const currentIndex = player.queueIndex
    const currentMode = player.mode
    const commit = async () => {
      switchTimer = null
      if (disposed) return
      if (player.id !== currentId || player.queueRevision !== queueRevision || player.queueIndex !== currentIndex || player.mode !== currentMode) { switchingTrack = false; swipeX = 0; return }
      if (direction > 0) player.next()
      else player.prev()
      await tick()
      if (disposed) return
      swipeX = direction > 0 ? 24 : -24
      switchingTrack = false
      requestAnimationFrame(() => { if (!disposed) swipeX = 0 })
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) void commit()
    else switchTimer = setTimeout(() => void commit(), 120)
  }
  onDestroy(() => { disposed = true; if (switchTimer) clearTimeout(switchTimer) })
  function open() {
    if (player.id || initialTrack) onOpenSheet(artwork!)
  }
  function play(): void {
    if (player.id) player.togglePlay()
    else if (initialTrack) player.playTrack(initialTrack, 0)
  }
</script>

<div class="player-bar mobile-mini-player" role="group" aria-label="迷你播放器" aria-busy={playbackLoading}>
  <button class="mini-player-open" class:dragging={draggingTrack} class:switching={switchingTrack} style={`--mini-track-x:${swipeX}px; --mini-preview-opacity:${previewProgress}; --mini-preview-x:${(previewDirection === 1 ? 1 : -1) * (1 - previewProgress) * 28}px; --mini-current-opacity:${Math.max(0, 1 - previewProgress * 2)}`} type="button" aria-label={`打开播放器：${title}`} disabled={!player.id && !initialTrack}
    onclick={open} use:playerSurfaceGesture={{ controller, opening: true, blocked: () => switchingTrack || (!player.id && !initialTrack),
      horizontal: (x) => { draggingTrack = x !== 0; swipeX = Math.max(-72, Math.min(72, x * .8)) },
      changeTrack: (direction) => { draggingTrack = false; void switchTrack(direction) } }}>
    <span class="mini-player-viewport">
      <span class="mini-player-current">
        {#key player.id}
          <span class="mini-player-track" in:fly={{ x: trackDirection * 22, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 190 }}>
            <span class="mini-player-artwork lcd-artwork" bind:this={artwork}>
              {#if cover && !coverFailed}<img class="lcd-artwork__img" use:progressiveCover={{ source: coverSource, size: 88 }} alt="" referrerpolicy="no-referrer" onerror={() => coverFailed = true} />
              {:else}<Icon name="music" size={22} />{/if}
            </span>
            <span class="mini-player-info"><strong class:error={!!player.error} aria-live={player.error || playbackLoading ? 'polite' : 'off'}>{status || title}</strong></span>
          </span>
        {/key}
      </span>
      {#if (draggingTrack || switchingTrack) && swipeX !== 0}
        <span class="mini-player-preview" aria-hidden="true">
          <span class="mini-player-preview__art">{#if previewTrack?.picUrl}<img src={coverUrl(previewTrack.picUrl, 88)} alt="" referrerpolicy="no-referrer" />{:else}<Icon name="music" size={20} />{/if}</span>
          <span class="mini-player-preview__copy"><small>{previewDirection === 1 ? '下一首' : '上一首'}</small><strong>{previewTrack?.name || '松开切换'}</strong>{#if previewArtist}<span>{previewArtist}</span>{/if}</span>
        </span>
      {/if}
    </span>
  </button>
  <button class="mini-player-play" class:playing={player.playing} type="button" disabled={!player.id && !initialTrack} aria-label={player.playing ? '暂停' : '播放'} onclick={play}>
    <span class="mini-player-play-icon" aria-hidden="true"><Icon name="play" size={28} fill="currentColor" /></span>
    <span class="mini-player-pause-icon" aria-hidden="true"><Icon name="pause" size={28} fill="currentColor" /></span>
  </button>
  <button class="mini-player-queue" class:active={showQueuePanel} type="button" disabled={!player.id} aria-label="播放列表" aria-expanded={showQueuePanel} onclick={onToggleQueue}><Icon name="queue" size={30} aria-hidden="true" /></button>
</div>

<style>
  :global(html.mobile-runtime) .mini-player-open { position: relative; overflow: hidden; transform: none; opacity: 1; }
  :global(html.mobile-runtime) .mini-player-open.switching { opacity: 1; }
  .mini-player-viewport { position: relative; display: block; width: 100%; min-width: 0; height: 100%; overflow: hidden; }
  .mini-player-current, .mini-player-preview { position: absolute; inset: 0; display: flex; align-items: center; width: 100%; min-width: 0; }
  .mini-player-current { transform: translateX(var(--mini-track-x)); opacity: var(--mini-current-opacity); transition: transform 220ms cubic-bezier(.2,.7,.2,1), opacity 160ms ease; }
  .dragging .mini-player-current { transition: none; }
  .mini-player-preview { gap: 10px; opacity: var(--mini-preview-opacity); transform: translateX(var(--mini-preview-x)); pointer-events: none; }
  .mini-player-preview__art { flex: none; width: 44px; height: 44px; display: grid; place-items: center; overflow: hidden; border-radius: var(--radius-sm); background: var(--bg-elevated); color: var(--text-secondary); }
  .mini-player-preview__art img { width: 100%; height: 100%; object-fit: cover; }
  .mini-player-preview__copy { min-width: 0; display: grid; gap: 1px; }
  .mini-player-preview__copy :is(small, strong, span) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini-player-preview__copy small { color: var(--accent); font-size: 10px; }
  .mini-player-preview__copy strong { font-size: 13px; line-height: 1.2; }
  .mini-player-preview__copy span { color: var(--text-secondary); font-size: 11px; }
  :global(html.mobile-runtime) :is(.mini-player-play, .mini-player-queue) { border-radius: 50%; transition: scale 180ms ease-out, background-color 180ms ease-out; }
  :global(html.mobile-runtime) :is(.mini-player-play, .mini-player-queue):global([data-mobile-pressed="control"]) { scale: .92; background: color-mix(in srgb, var(--text) 10%, transparent); transition-duration: 80ms; }
  @media (prefers-reduced-motion: reduce) { :global(html.mobile-runtime) :is(.mini-player-play, .mini-player-queue):global([data-mobile-pressed="control"]) { scale: 1; } }
  @media (prefers-reduced-motion: reduce) { .mini-player-current { transition: none; } }
</style>
