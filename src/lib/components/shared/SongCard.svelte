<script>
  /**
   * SongCard — cross-platform song list item
   *
   * Props:
   * - song: { id, name, picUrl?, cover?, ar?, artists?, dt?, duration? }
   * - variant: 'pc' | 'mobile' (default 'pc')
   * - onPlay: (song) => void
   * - onOpenArtist: (artist) => void
   */
  import ArtistNames from '../ArtistNames.svelte'
  import { coverUrl } from '../../utils/image.js'
  import { formatDuration } from '../../format.js'
  import { extractCover } from '../../utils/normalize.js'

  let { song, variant = 'pc', onPlay, onOpenArtist } = $props()

  const coverSrc = $derived(coverUrl(extractCover(song) || song.picUrl || song.cover, variant === 'mobile' ? 96 : 112))
  const duration = $derived(song.dt || song.duration || 0)
  const artists = $derived(song.ar || song.artists || [])
</script>

<div class="song-card" class:mobile={variant === 'mobile'} role="button" tabindex="0"
  onclick={() => onPlay?.(song)}
  onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onPlay?.(song) } }}>

  {#if variant === 'pc'}
    <div class="sc-cover">
      {#if song.picUrl || song.cover}
        <img src={coverSrc} alt={song.name} loading="lazy" referrerpolicy="no-referrer" />
      {:else}
        <div class="sc-placeholder">♪</div>
      {/if}
    </div>
    <div class="sc-body">
      <span class="sc-name">{song.name}</span>
      <span class="sc-artist">
        <ArtistNames artists={artists} {onOpenArtist} fallback="未知" />
      </span>
    </div>
    <span class="sc-duration">{formatDuration(duration)}</span>
  {:else}
    <div class="sc-cover">
      {#if song.picUrl || song.cover}
        <img src={coverSrc} alt={song.name} loading="lazy" referrerpolicy="no-referrer" />
      {:else}
        <div class="sc-placeholder">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
      {/if}
    </div>
    <div class="sc-body">
      <span class="sc-name">{song.name}</span>
      <span class="sc-artist">
        <ArtistNames artists={artists} {onOpenArtist} fallback="未知" />
      </span>
    </div>
  {/if}
</div>

<style>
  .song-card {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    padding: 8px 0;
    -webkit-tap-highlight-color: transparent;
  }
  .song-card:active {
    opacity: 0.7;
  }

  /* ===== Cover ===== */
  .sc-cover {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    background: rgba(255,255,255,0.06);
  }
  .sc-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .sc-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.3);
  }
  .song-card.mobile .sc-cover {
    width: 40px;
    height: 40px;
    border-radius: 6px;
  }

  /* ===== Body ===== */
  .sc-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sc-name {
    font-size: 14px;
    font-weight: 500;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sc-artist {
    font-size: 12px;
    color: rgba(255,255,255,0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ===== Duration (PC only) ===== */
  .sc-duration {
    font-size: 12px;
    color: rgba(255,255,255,0.35);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
