<script>
  import { player } from '../stores/player.svelte.js';
  import { coverUrl } from '../utils/image.js';
  import { useLyrics } from '../composables/useLyrics.svelte.js';
  import { useLike } from '../composables/useLike.svelte.js';
  import { scrollLyricIntoView } from '../utils/scroll-lyric.js';
  import PlaybackControls from './PlaybackControls.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import ArtistNames from './ArtistNames.svelte';
  import QueuePanel from './QueuePanel.svelte';
  import SongContextStrip from './SongContextStrip.svelte';

  let { onClose, onOpenArtist, showLocalQueue = false, toggleLocalQueue } = $props();

  const lyricState = useLyrics();
  const like = useLike();

  let currentArtists = $derived(player.currentTrack?.ar || []);
  let lyricsEl = $state(null);

  $effect(() => {
    if (!lyricsEl) return;
    scrollLyricIntoView(lyricsEl, lyricState.highlightIndex, '.ly-line', 0.5);
  });
</script>

<!-- PC Layout: Two Columns -->
<div class="ly-pc-player">
  <!-- LEFT COLUMN: Cover + Controls -->
  <div class="ly-left">
    <div class="ly-left-cover">
      <div class="ly-cover-wrap">
        <img class="ly-cover" src={coverUrl(player.cover, 600)} alt="" referrerpolicy="no-referrer" />
      </div>
      <div class="ly-track-wrap">
        <div class="ly-track-top">
          <div class="ly-track-title">{player.title || '未在播放'}</div>
        </div>
        <div class="ly-track-sub">
          <div class="ly-track-info">
            <span class="ly-artist"><ArtistNames artists={currentArtists} onOpenArtist={onOpenArtist} fallback={player.artist || ''} /></span>
            {#if player.artist && player.album}<span class="ly-sep">—</span>{/if}
            <span class="ly-album">{player.album || player.title || ''}</span>
          </div>
          <div class="ly-track-actions">
            <button class="ly-star-btn" class:active={like.liked} onclick={like.toggle} disabled={like.busy} aria-label="喜欢">
              {#if like.liked}
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              {:else}
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
              {/if}
            </button>
          </div>
        </div>
      </div>
    </div>

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
    </div>
  </div>

  <!-- RIGHT COLUMN: Lyrics + Context -->
  <div class="ly-right">
    <div class="ly-right-panel">
      <div class="ly-lyrics-scroll" bind:this={lyricsEl}>
        <div class="ly-lyrics-inner">
          {#if lyricState.lyrics.length > 0}
            {#each lyricState.lyrics as line, i}
              <button class="ly-line" class:active={i === lyricState.highlightIndex} class:sung={i < lyricState.highlightIndex}
                aria-current={i === lyricState.highlightIndex ? 'true' : undefined}
                onclick={() => { if (player.duration) player.seek(Math.max(0, Math.min(player.duration, line.time))); }}>
                <span class="ly-line-text">{line.text || '...'}</span>
                {#if line.translation}<span class="ly-line-trans">{line.translation}</span>{/if}
              </button>
            {/each}
          {:else}
            <div class="ly-no-lyric">暂无歌词</div>
          {/if}
        </div>
      </div>
      <SongContextStrip variant="desktop" {onOpenArtist} {onClose} />
    </div>
  </div>

  <!-- PC Queue Panel -->
  {#if showLocalQueue}
    <div class="ly-local-queue" role="presentation" onclick={(e) => e.stopPropagation()}>
      <QueuePanel show={true} onClose={toggleLocalQueue} onOpenArtist={onOpenArtist} />
    </div>
  {/if}
</div>
