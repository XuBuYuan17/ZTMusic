<script>
  import { player } from '../stores/player.svelte.js';
  import { coverUrl } from '../utils/image.js';
  import { useLyrics } from '../composables/useLyrics.svelte.js';
  import AppleMusicControls from './AppleMusicControls.svelte';
  import AppleMusicProgressBar from './AppleMusicProgressBar.svelte';
  import ArtistNames from './ArtistNames.svelte';
  import QueuePanel from './QueuePanel.svelte';
  import Icon from './ui/Icon.svelte';

  let { onClose, onOpenArtist, showLocalQueue = false, toggleLocalQueue } = $props();

  let lyricsMode = $state(false);
  let showMoreMenu = $state(false);
  let entered = $state(false);
  let closing = $state(false);
  let lyricsEl = $state(null);

  const lyricState = useLyrics();

  let currentArtists = $derived(player.currentTrack?.ar || []);

  // ---- Enter animation on mount ----
  $effect(() => {
    setTimeout(() => { entered = true; }, 30);
  });

  function handleClose() {
    closing = true;
    setTimeout(() => { onClose?.(); }, 220);
  }

  // ---- Auto-scroll lyrics ----
  $effect(() => {
    if (!lyricsMode || !lyricsEl) return;
    const idx = lyricState.highlightIndex;
    if (idx < 0) return;
    const lines = lyricsEl.querySelectorAll('.am-lyric-line');
    const target = lines[idx];
    if (target) {
      const container = lyricsEl;
      const offset = target.offsetTop - container.clientHeight * 0.25 + target.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
    }
  });

  function toggleLyricsMode() {
    lyricsMode = !lyricsMode;
  }

  function toggleMoreMenu() {
    showMoreMenu = !showMoreMenu;
  }

  function closeMoreMenu() {
    showMoreMenu = false;
  }

  function handleToggleLocalQueue() {
    showMoreMenu = false;
    toggleLocalQueue?.();
  }

  const moreMenuItems = [
    { label: '收藏', icon: 'heart' },
    { label: '分享', icon: 'share' },
    { label: '专辑', icon: 'music' },
    { label: '歌手', icon: 'user' },
    { label: '音质', icon: 'settings' },
    { label: '相似歌单', icon: 'list' },
    { label: '播放器主题', icon: 'sun' },
  ];
</script>

{#snippet lyricLine(line, i)}
  <button class="am-lyric-line" class:active={i === lyricState.highlightIndex} class:before={i < lyricState.highlightIndex}
    aria-current={i === lyricState.highlightIndex ? 'true' : undefined}
    onclick={() => { if (player.duration) player.seek(Math.max(0, Math.min(player.duration, line.time))); }}>
    <span class="am-lyric-text">{line.text || '...'}</span>
    {#if line.translation}
      <span class="am-lyric-trans">{line.translation}</span>
    {/if}
  </button>
{/snippet}

<div class="apple-music-player" class:lyrics-mode={lyricsMode} class:entered={entered} class:closing={closing}>

  <!-- Blurred background -->
  <div class="am-bg">
    <div class="am-bg-cover" style="background-image: url({coverUrl(player.cover, 600)})"></div>
    <div class="am-bg-overlay"></div>
  </div>

  <div class="am-more-shell">
    <button class="am-more-btn" class:active={showMoreMenu} type="button" aria-label="更多操作" aria-expanded={showMoreMenu} onclick={toggleMoreMenu}>
      <span class="am-more-dots" aria-hidden="true"><span></span><span></span><span></span></span>
    </button>
    {#if showMoreMenu}
      <div class="am-more-backdrop" role="presentation" onclick={closeMoreMenu}></div>
      <div class="am-more-menu" role="menu" aria-label="更多操作菜单">
        {#each moreMenuItems as item}
          <button class="am-more-item" type="button" role="menuitem" onclick={closeMoreMenu}>
            <Icon name={item.icon} size={18} strokeWidth={1.8} />
            <span>{item.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Flying cover -->
  <div class="am-flying-cover" role="button" tabindex="0"
    onclick={toggleLyricsMode}
    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); toggleLyricsMode(); } }}>
    <img class="am-flying-cover-img" src={coverUrl(player.cover, 400)} alt="" referrerpolicy="no-referrer" />
  </div>

  <!-- Track info (controls mode, left-aligned with cover) -->
  <div class="am-track-info">
    <div class="am-track-title">{player.title || '未在播放'}</div>
    <div class="am-track-artist">
      <ArtistNames artists={currentArtists} onOpenArtist={onOpenArtist} fallback={player.artist || ''} />
    </div>
  </div>

  <!-- Corner info (lyrics mode only, top-left) -->
  <div class="am-corner-info">
    <div class="am-corner-title">{player.title || ''}</div>
    <div class="am-corner-artist">
      <ArtistNames artists={currentArtists} onOpenArtist={onOpenArtist} fallback={player.artist || ''} />
    </div>
  </div>

  <!-- Bottom controls (no background) -->
  <div class="am-bottom-controls">
    <div class="am-bottom-progress">
      <AppleMusicProgressBar currentTime={player.currentTime} duration={player.duration} disabled={!player.id} onseek={(t) => { player.seek(t) }} />
    </div>
    <AppleMusicControls onqueue={handleToggleLocalQueue} showQueue={showLocalQueue} />
  </div>

  <!-- Lyrics area -->
  <div class="am-lyrics-area" bind:this={lyricsEl}>
    <!-- Gradient overlays replace mask-image for better mobile performance -->
    <div class="am-lyrics-fade-top"></div>
    <div class="am-lyrics-fade-bottom"></div>
    <div class="am-lyrics-inner">
      {#if lyricState.lyrics.length > 0}
        {#each lyricState.lyrics as line, i}
          {@render lyricLine(line, i)}
        {/each}
      {:else}
        <div class="am-no-lyric">暂无歌词</div>
      {/if}
    </div>
  </div>

  <!-- Queue Panel -->
  {#if showLocalQueue}
    <QueuePanel show={true} mobileVisible={true} onClose={handleToggleLocalQueue} onOpenArtist={onOpenArtist} />
  {/if}
</div>

<style>
  .apple-music-player {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: block;
    overflow: hidden;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    opacity: 1;
    transition: opacity 0.25s cubic-bezier(0.32, 0.94, 0.6, 1), transform 0.25s cubic-bezier(0.32, 0.94, 0.6, 1);
    transform: scale(1);
  }
  .apple-music-player.closing {
    opacity: 0;
    transform: scale(0.96);
  }

  .am-bg {
    position: absolute;
    inset: -40px;
    z-index: 0;
    overflow: hidden;
  }
  .am-bg-cover {
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    filter: blur(40px) saturate(1.4);
    transform: scale(1.1);
    transition: background-image 0.6s ease;
  }
  .am-bg-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.85) 100%);
  }

  /* ---- More Menu ---- */
  .am-more-shell {
    position: absolute;
    top: calc(14px + env(safe-area-inset-top));
    right: 14px;
    z-index: 40;
  }

  .am-more-btn {
    position: relative;
    z-index: 42;
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    opacity: 0.48;
    color: rgba(255,255,255,0.74);
    background: rgba(255,255,255,0.045);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    transition: transform 0.16s var(--ease-out), background 0.16s var(--ease-out), color 0.16s var(--ease-out), opacity 0.16s var(--ease-out);
  }

  .am-more-btn:hover,
  .am-more-btn:focus-visible {
    opacity: 0.88;
    background: rgba(255,255,255,0.1);
  }

  .am-more-btn:active {
    transform: scale(0.94);
  }

  .am-more-btn.active {
    opacity: 1;
    color: #fff;
    background: rgba(255,255,255,0.16);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 24px rgba(0,0,0,0.18);
  }

  .am-more-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }

  .am-more-dots span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px rgba(255,255,255,0.14);
  }

  .am-more-backdrop {
    position: fixed;
    inset: 0;
    z-index: 41;
    background: transparent;
  }

  .am-more-menu {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 43;
    width: auto;
    padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: 18px 18px 0 0;
    background: var(--bg-surface);
    box-shadow: 0 -8px 30px rgba(0,0,0,0.18);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    animation: am-sheet-up 0.32s var(--ease-out);
  }

  .am-more-item {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 0 12px;
    border-radius: 12px;
    color: var(--text);
    font-size: 14px;
    font-weight: 760;
    text-align: left;
    background: transparent;
    transition: background 0.14s var(--ease-out), transform 0.14s var(--ease-out);
  }

  .am-more-item:active {
    background: var(--bg-hover);
    transform: scale(0.985);
  }

  @keyframes am-sheet-up {
    from { opacity: 0; transform: translateY(22px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ---- Flying Cover ---- */
  .am-flying-cover {
    position: absolute;
    z-index: 10;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 8px 30px rgba(0,0,0,0.6);
    cursor: pointer;
    transition: transform 0.45s cubic-bezier(0.25, 0.1, 0.25, 1), opacity 0.45s ease, top 0.45s cubic-bezier(0.25, 0.1, 0.25, 1), left 0.45s cubic-bezier(0.25, 0.1, 0.25, 1), width 0.45s cubic-bezier(0.25, 0.1, 0.25, 1), height 0.45s cubic-bezier(0.25, 0.1, 0.25, 1), border-radius 0.45s ease;
    -webkit-tap-highlight-color: transparent;
    top: calc(50% - 148px - 92px);
    left: calc(50% - 148px);
    width: 296px;
    height: 296px;
  }
  .am-flying-cover:active {
    transform: scale(0.96) !important;
  }
  .lyrics-mode .am-flying-cover {
    top: 18px;
    left: 18px;
    width: 62px;
    height: 62px;
    border-radius: 12px;
  }
  .am-flying-cover {
    opacity: 0;
    transform: scale(0.85);
  }
  .entered .am-flying-cover {
    opacity: 1;
    transform: scale(1);
  }
  .closing .am-flying-cover {
    opacity: 0 !important;
    transform: scale(0.7) translateY(40px) !important;
    transition: transform 0.18s ease, opacity 0.18s ease !important;
  }
  .am-flying-cover-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* ---- Track Info ---- */
  .am-track-info {
    position: absolute;
    z-index: 10;
    top: calc(50% + 120px - 40px + 16px);
    left: calc(50% - 148px);
    width: 296px;
    text-align: left;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.35s ease 0.12s, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.12s;
  }
  .entered .am-track-info {
    opacity: 1;
    transform: translateY(0);
  }
  .lyrics-mode .am-track-info {
    opacity: 0;
    pointer-events: none;
  }
  .am-track-title {
    font-size: 24px;
    font-weight: 800;
    color: #fff;
    margin-bottom: 4px;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .am-track-artist {
    font-size: 16px;
    font-weight: 500;
    color: #b3b3b7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ---- Corner Info ---- */
  .am-corner-info {
    position: absolute;
    top: 20px;
    left: 92px;
    right: 56px;
    z-index: 11;
    text-align: left;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }
  .lyrics-mode .am-corner-info {
    opacity: 1;
    pointer-events: auto;
  }
  .am-corner-title {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .am-corner-artist {
    font-size: 14px;
    color: #b3b3b7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  /* ---- Bottom Controls ---- */
  .am-bottom-controls {
    position: absolute;
    z-index: 10;
    top: calc(50% + 120px - 40px + 16px + 60px + 20px);
    left: 14px;
    right: 14px;
    background: transparent;
    backdrop-filter: none;
    border: none;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.35s ease 0.22s, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.22s;
  }
  .entered .am-bottom-controls {
    opacity: 1;
    transform: translateY(0);
  }
  .lyrics-mode .am-bottom-controls {
    opacity: 0;
    transform: translateY(15px);
    pointer-events: none;
  }
  .am-bottom-progress {
    width: 100%;
  }

  /* ---- Lyrics Area ---- */
  .am-lyrics-area {
    position: absolute;
    top: 100px;
    bottom: 40px;
    left: 0;
    right: 0;
    z-index: 5;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
    /* Removed mask-image for performance — using padding + overflow instead */
    padding-top: 60px;
    padding-bottom: 60px;
  }
  .lyrics-mode .am-lyrics-area {
    opacity: 1;
    pointer-events: auto;
  }
  .am-lyrics-area::-webkit-scrollbar { display: none; }

  /* Gradient fade overlays — GPU-friendly alternative to mask-image */
  .am-lyrics-fade-top,
  .am-lyrics-fade-bottom {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 60px;
    z-index: 6;
    pointer-events: none;
  }
  .am-lyrics-fade-top {
    top: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%);
  }
  .am-lyrics-fade-bottom {
    bottom: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%);
  }

  .am-lyrics-inner {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 100%;
    padding: 20px 28px;
  }

  .am-lyric-line {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 10px 0;
    cursor: pointer;
    transition: transform 0.25s ease, opacity 0.25s ease;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }
  .am-lyric-text {
    display: block;
    font-size: 20px;
    font-weight: 500;
    color: rgba(255,255,255,0.3);
    line-height: 1.6;
    transform-origin: left center;
    transition: transform 0.3s ease, color 0.3s ease;
  }
  .am-lyric-line.before .am-lyric-text {
    color: rgba(255,255,255,0.6);
  }
  .am-lyric-line.active .am-lyric-text {
    font-weight: 700;
    color: #fff;
    transform: scale(1.3); /* 26/20 = 1.3, GPU-accelerated, no layout */
  }
  .am-lyric-trans {
    display: block;
    font-size: 13px;
    font-weight: 400;
    color: rgba(255,255,255,0.25);
    margin-top: 4px;
    transition: color 0.3s ease;
  }
  .am-lyric-line.active .am-lyric-trans {
    color: rgba(255,255,255,0.5);
  }
  .am-no-lyric {
    font-size: 15px;
    color: rgba(255,255,255,0.3);
    text-align: center;
    padding: 40px 0;
  }

</style>
