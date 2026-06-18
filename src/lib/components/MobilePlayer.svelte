<script>
  import { player } from '../stores/player.svelte.js';
  import { coverUrl } from '../utils/image.js';
  import PlaybackControls from './PlaybackControls.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import ArtistNames from './ArtistNames.svelte';
  import QueuePanel from './QueuePanel.svelte';

  let { onClose, onOpenArtist, showLocalQueue = false, toggleLocalQueue, lyricsMode = false, toggleLyricsMode } = $props();

  let coverEl = $state(null);
  let currentArtists = $derived(player.currentTrack?.ar || []);

  // 点击封面切换歌词模式
  function handleCoverClick() {
    toggleLyricsMode?.();
  }
</script>

<div class="ly-mobile-player" class:lyrics-mode={lyricsMode}>
  <!-- Mobile Close Button -->
  <button class="ly-mobile-close-btn" onclick={onClose} aria-label="关闭">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  </button>

  <!-- Cover + Track Info -->
  <div class="ly-left-cover">
    <div class="ly-cover-wrap" bind:this={coverEl} role="button" tabindex="0" onclick={handleCoverClick}>
      <img class="ly-cover" src={coverUrl(player.cover, 600)} alt="" referrerpolicy="no-referrer" />
    </div>
    <div class="ly-track-wrap">
      <div class="ly-track-top"><div class="ly-track-title">{player.title || '未在播放'}</div></div>
      <div class="ly-track-sub">
        <div class="ly-track-info">
          <span class="ly-artist"><ArtistNames artists={currentArtists} onOpenArtist={onOpenArtist} fallback={player.artist || ''} /></span>
          {#if player.artist && player.album}<span class="ly-sep">—</span>{/if}
          <span class="ly-album">{player.album || player.title || ''}</span>
        </div>
      </div>
      <!-- Apple Music style badge (only visible in lyrics mode) -->
      <div class="ly-playing-badge">正在播放</div>
    </div>
  </div>

  <!-- Controls -->
  <div class="ly-left-controls">
    <ProgressBar currentTime={player.currentTime} duration={player.duration} disabled={!player.id} onseek={(t) => { player.seek(t) }} />
    <PlaybackControls
      variant="lyrics"
      mode={player.mode}
      playing={player.playing}
      loading={player.loading}
      disabled={!player.id}
      onshuffle={() => player.setMode(player.mode === 'shuffle' ? 'list' : 'shuffle')}
      onprev={() => player.prev()}
      onplaypause={() => player.togglePlay()}
      onnext={() => player.next()}
      onrepeat={() => player.setMode(player.mode === 'repeat' ? 'list' : 'repeat')}
      onqueue={toggleLocalQueue}
      showQueue={showLocalQueue}
    />

    <!-- Mobile Action Buttons -->
    <div class="ly-mobile-action-row">
      <button class="ly-mobile-action-btn" aria-label="喜欢">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </button>
    </div>
  </div>

  <!-- Mobile Queue Panel -->
  {#if showLocalQueue}
    <div class="ly-local-queue" role="presentation" onclick={(e) => e.stopPropagation()}>
      <QueuePanel show={true} mobileVisible={true} onClose={toggleLocalQueue} onOpenArtist={onOpenArtist} />
    </div>
  {/if}

  <!-- Mobile Lyrics (shown in lyrics-mode) -->
  {#if lyricsMode}
    <div class="ly-mobile-lyrics">
      <div class="ly-lyrics-inner">
        <div class="ly-no-lyric">歌词模式</div>
      </div>
    </div>
  {/if}
</div>
