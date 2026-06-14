<script>
  import { player } from '../stores/player.svelte.js'
  import { coverUrl } from '../utils/image.js'
  import ArtistNames from './ArtistNames.svelte'
  import Spinner from './Spinner.svelte'

  let { showQueuePanel = false, onOpenSheet, onToggleQueue, onOpenArtist } = $props()

  const playPath = 'M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z'
  const pausePath = 'M9 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m8 0h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2'

  let currentTrack = $derived(player.currentTrack || player.queue?.find(track => track?.id === player.id) || player.queue?.[player.queueIndex])
  let currentArtists = $derived(currentTrack?.ar || currentTrack?.artists || [])

  function openSheet(event) {
    if (!player.id) return
    event.currentTarget.classList.add('pressing')
    setTimeout(() => event.currentTarget?.classList.remove('pressing'), 180)
    onOpenSheet?.(event.currentTarget.querySelector('.mobile-mini-player__art') || event.currentTarget)
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openSheet(event)
    }
  }

  function togglePlay(event) {
    event.stopPropagation()
    player.togglePlay()
  }

  function toggleQueue(event) {
    event.stopPropagation()
    onToggleQueue?.()
  }
</script>

<div class="mobile-mini-player" class:empty={!player.id} role="button" tabindex="0" aria-label="打开歌词页" onclick={openSheet} onkeydown={handleKeydown}>
  <div class="mobile-mini-player__art">
    {#if player.cover}
      <img src={coverUrl(player.cover, 96)} alt="" referrerpolicy="no-referrer" />
    {:else}
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
    {/if}
  </div>

  <div class="mobile-mini-player__meta">
    <div class="mobile-mini-player__title">{player.title || '未在播放'}</div>
    <div class="mobile-mini-player__artist">
      {#if player.error}
        {player.error}
      {:else if player.artist && !player.loading}
        <ArtistNames artists={currentArtists} {onOpenArtist} fallback={player.artist} />
      {:else}
        {player.loading ? '正在载入…' : player.artist || '选择一首歌开始'}
      {/if}
    </div>
  </div>

  <button class="mobile-mini-player__play" onclick={togglePlay} aria-label={player.playing ? '暂停' : '播放'} disabled={!player.id && !player.loading}>
    {#if player.loading}
      <Spinner size="sm" />
    {:else if player.playing}
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d={pausePath}/></svg>
    {:else}
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d={playPath} fill-rule="evenodd" clip-rule="evenodd"/></svg>
    {/if}
  </button>

  <button class="mobile-mini-player__queue" class:active={showQueuePanel} onclick={toggleQueue} aria-label="播放列表">
    <svg viewBox="0 0 48 48" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round">
      <path stroke-linecap="round" d="M24 19h16m-16-9h16M8 38h32M8 28h32" />
      <path fill="currentColor" d="m8 10l8 5l-8 5z" />
    </svg>
  </button>
</div>
