<script lang="ts">
  import { tick } from 'svelte'
  import { fly } from 'svelte/transition'
  import type { MobilePlayerDrag } from '../app/mobile-player-motion.ts'
  import { player } from '../stores/player.svelte.ts'
  import { coverUrl, progressiveCover } from '../utils/image.ts'
  import Icon from './ui/Icon.svelte'

  let { onOpenSheet, onToggleQueue, showQueuePanel = false }: {
    onOpenSheet: (origin: Element, drag?: MobilePlayerDrag) => void
    onToggleQueue: () => void
    showQueuePanel?: boolean
  } = $props()
  let artwork = $state<HTMLElement>()
  let coverFailed = $state(false)
  let start: { x: number; y: number; id: number; time: number } | null = null
  let moved = false
  let gesture: MobilePlayerDrag | null = null
  let axis: 'horizontal' | 'vertical' | null = null
  let swipeX = $state(0)
  let draggingTrack = $state(false)
  let switchingTrack = $state(false)
  let trackDirection = $state(1)
  let cover = $derived(coverUrl(player.cover, 88))
  let status = $derived(player.error || (player.webdavDownloading
    ? `正在下载 ${player.webdavDownloading.name}${player.webdavDownloading.percent >= 0 ? ` ${player.webdavDownloading.percent}%` : ''}`
    : player.loading ? '正在载入…' : ''))
  $effect(() => { cover; coverFailed = false })

  function down(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return
    start = { x: event.clientX, y: event.clientY, id: event.pointerId, time: event.timeStamp }
    moved = false
    gesture = null
    axis = null
    swipeX = 0
    draggingTrack = false
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent) {
    if (start?.id !== event.pointerId) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    moved ||= Math.max(Math.abs(dx), Math.abs(dy)) >= 10
    if (!axis && moved) {
      if (Math.abs(dx) > Math.abs(dy) * 1.4) axis = 'horizontal'
      else if (Math.abs(dy) > Math.abs(dx) * 1.4) axis = 'vertical'
    }
    if (axis === 'horizontal') {
      draggingTrack = true
      swipeX = Math.max(-42, Math.min(42, dx * .55))
    }
    if (gesture) { gesture.currentY = event.clientY; gesture.time = event.timeStamp; return }
    if (axis === 'vertical' && dy < -10 && player.id) {
      gesture = { pointerId: event.pointerId, startY: start.y, currentY: event.clientY, startTime: start.time, time: event.timeStamp }
      onOpenSheet(artwork!, gesture)
    }
  }
  function finish(event: PointerEvent) {
    if (start?.id !== event.pointerId) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    move(event)
    start = null
    if (gesture) {
      gesture.currentY = event.clientY
      gesture.released = true
      gesture.cancelled = event.type !== 'pointerup'
      moved = true
      return
    }
    draggingTrack = false
    if (event.type !== 'pointerup') { moved = true; swipeX = 0; return }
    if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      void switchTrack(dx < 0 ? 1 : -1)
      return
    }
    swipeX = 0
  }
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
  function open(event: MouseEvent) {
    if (event.detail !== 0 && moved) { event.preventDefault(); return }
    if (player.id) onOpenSheet(artwork!)
  }
</script>

<div class="player-bar mobile-mini-player" role="group" aria-label="迷你播放器">
  <button class="mini-player-open" class:dragging={draggingTrack} class:switching={switchingTrack} style={`--mini-track-x:${swipeX}px`} type="button" aria-label={`打开播放器：${player.title || '未在播放'}`} disabled={!player.id}
    onclick={open} onpointerdown={down} onpointermove={move} onpointerup={finish} onpointercancel={finish}>
    {#key player.id}
      <span class="mini-player-track" in:fly={{ x: trackDirection * 22, duration: 190 }}>
        <span class="mini-player-artwork lcd-artwork" bind:this={artwork}>
          {#if cover && !coverFailed}<img class="lcd-artwork__img" use:progressiveCover={{ source: player.cover, size: 88 }} alt="" referrerpolicy="no-referrer" onerror={() => coverFailed = true} />
          {:else}<Icon name="music" size={22} />{/if}
        </span>
        <span class="mini-player-info"><strong class:error={!!player.error} aria-live={player.error || player.loading ? 'polite' : 'off'}>{status || player.title || '未在播放'}</strong></span>
      </span>
    {/key}
  </button>
  <button class="mini-player-play" class:playing={player.playing} type="button" disabled={!player.id} aria-label={player.playing ? '暂停' : '播放'} onclick={() => player.togglePlay()}>
    <span class="mini-player-play-icon" aria-hidden="true"><Icon name="play" size={24} fill="currentColor" /></span>
    <span class="mini-player-pause-icon" aria-hidden="true"><Icon name="pause" size={24} fill="currentColor" /></span>
  </button>
  <button class="mini-player-queue" class:active={showQueuePanel} type="button" disabled={!player.id} aria-label="播放列表" aria-expanded={showQueuePanel} onclick={onToggleQueue}><Icon name="queue" size={26} aria-hidden="true" /></button>
</div>
