<script lang="ts">
  import { tick } from 'svelte'
  import { fly } from 'svelte/transition'
  import type { PlayerSurfaceController } from '../player-motion/controller.ts'
  import { playerSurfaceGesture } from '../player-motion/gesture.ts'
  import { player } from '../stores/player.svelte.ts'
  import { getStartupTrack } from '../app/startup-track.ts'
  import { coverUrl, progressiveCover } from '../utils/image.ts'
  import Icon from './ui/Icon.svelte'

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

  async function switchTrack(direction: 1 | -1) {
    if (switchingTrack || !player.id) return
    switchingTrack = true
    trackDirection = direction
    swipeX = direction > 0 ? -72 : 72
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await new Promise<void>((resolve) => setTimeout(resolve, 110))
    }
    if (direction > 0) player.next()
    else player.prev()
    await tick()
    swipeX = direction > 0 ? 24 : -24
    switchingTrack = false
    requestAnimationFrame(() => { swipeX = 0 })
  }
  function open() {
    if (player.id || initialTrack) onOpenSheet(artwork!)
  }
  function play(): void {
    if (player.id) player.togglePlay()
    else if (initialTrack) player.playTrack(initialTrack, 0)
  }
</script>

<div class="player-bar mobile-mini-player" role="group" aria-label="迷你播放器" aria-busy={playbackLoading}>
  <button class="mini-player-open" class:dragging={draggingTrack} class:switching={switchingTrack} style={`--mini-track-x:${swipeX}px`} type="button" aria-label={`打开播放器：${title}`} disabled={!player.id && !initialTrack}
    onclick={open} use:playerSurfaceGesture={{ controller, opening: true, blocked: () => !player.id && !initialTrack,
      horizontal: (x) => { draggingTrack = x !== 0; swipeX = Math.max(-42, Math.min(42, x * .55)) },
      changeTrack: (direction) => { draggingTrack = false; void switchTrack(direction) } }}>
    {#key player.id}
      <span class="mini-player-track" in:fly={{ x: trackDirection * 22, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 190 }}>
        <span class="mini-player-artwork lcd-artwork" bind:this={artwork}>
          {#if cover && !coverFailed}<img class="lcd-artwork__img" use:progressiveCover={{ source: coverSource, size: 88 }} alt="" referrerpolicy="no-referrer" onerror={() => coverFailed = true} />
          {:else}<Icon name="music" size={22} />{/if}
        </span>
        <span class="mini-player-info"><strong class:error={!!player.error} aria-live={player.error || playbackLoading ? 'polite' : 'off'}>{status || title}</strong></span>
      </span>
    {/key}
  </button>
  <button class="mini-player-play" class:playing={player.playing} type="button" disabled={!player.id && !initialTrack} aria-label={player.playing ? '暂停' : '播放'} onclick={play}>
    <span class="mini-player-play-icon" aria-hidden="true"><Icon name="play" size={24} fill="currentColor" /></span>
    <span class="mini-player-pause-icon" aria-hidden="true"><Icon name="pause" size={24} fill="currentColor" /></span>
  </button>
  <button class="mini-player-queue" class:active={showQueuePanel} type="button" disabled={!player.id} aria-label="播放列表" aria-expanded={showQueuePanel} onclick={onToggleQueue}><Icon name="queue" size={26} aria-hidden="true" /></button>
</div>