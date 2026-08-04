<script>
  import { player } from '../stores/player.svelte.js';
  import { ncm } from '../api/client.js';
  import { coverUrl } from '../utils/image.js';
  import { QUALITY_ORDER } from '../utils/constants.js';
  import { useLyrics } from '../composables/useLyrics.svelte.js';
  import { useLike } from '../composables/useLike.svelte.js';
  import { scrollLyricIntoView } from '../utils/scroll-lyric.js';
  import AppleMusicControls from './AppleMusicControls.svelte';
  import AppleMusicProgressBar from './AppleMusicProgressBar.svelte';
  import ArtistNames from './ArtistNames.svelte';
  import QueuePanel from './QueuePanel.svelte';
  import SongContextStrip from './SongContextStrip.svelte';
  import Icon from './ui/Icon.svelte';

  let { onClose, onOpenArtist, onOpenAlbum, onOpenPlaylist, onToggleTheme, showLocalQueue = false, toggleLocalQueue } = $props();

  let lyricsMode = $state(false);
  let showMoreMenu = $state(false);
  let menuMessage = $state('');
  let actionBusy = $state('');
  let contextPanelRequest = $state(null);
  let secondaryPanel = $state(null);
  let playerTheme = $state('card');
  let entered = $state(false);
  let closing = $state(false);
  let lyricsEl = $state(null);
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeActive = false;
  let suppressCoverClick = false;

  const lyricState = useLyrics();
  const like = useLike(showMenuMessage);

  let currentArtists = $derived(player.currentTrack?.ar || []);
  let album = $derived(player.currentTrack?.al || player.currentTrack?.album || null);
  let firstArtist = $derived(currentArtists.find(artist => artist?.id));
  let qualityLabels = {
    lossless: '无损',
    exhigh: '极高',
    higher: '较高',
    standard: '标准',
  };
  let playerThemeOptions = [
    { value: 'card', label: '卡片封面', icon: 'music' },
    { value: 'vinyl', label: '黑胶唱片', icon: 'disc' },
  ];

  let moreMenuItems = $derived([
    { label: like.liked ? '取消收藏' : '收藏', icon: like.liked ? 'heart-filled' : 'heart', action: like.toggle, disabled: !player.id || like.busy },
    { label: '分享', icon: 'share', action: shareTrack, disabled: !player.id || actionBusy === 'share' },
    { label: '专辑', icon: 'music', action: openAlbum, disabled: !album?.id },
    { label: '歌手', icon: 'user', action: openArtist, disabled: !firstArtist?.id },
    { label: `音质：${qualityLabels[player.preferredLevel] || '标准'}`, icon: 'settings', action: () => openSecondaryPanel('quality') },
    { label: '热评', icon: 'messages', action: () => openSecondaryPanel('comments'), disabled: !player.id },
    { label: '相似歌单', icon: 'list', action: () => openSecondaryPanel('playlists'), disabled: !player.id },
    { label: '播放器主题', icon: 'sun', action: () => openSecondaryPanel('theme') },
  ]);

  let secondaryTitle = $derived.by(() => {
    if (secondaryPanel === 'quality') return '音质';
    if (secondaryPanel === 'comments') return '热评';
    if (secondaryPanel === 'playlists') return '相似歌单';
    if (secondaryPanel === 'theme') return '播放器主题';
    return '';
  });

  // ---- 定时器管理器 ----
  const timers = new Set();
  function safeTimeout(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  // ---- Enter animation on mount ----
  $effect(() => {
    safeTimeout(() => { entered = true; }, 30);
    return () => timers.forEach(id => clearTimeout(id));
  });

  function handleClose() {
    closing = true;
    safeTimeout(() => { onClose?.(); }, 220);
  }

  // ---- Auto-scroll lyrics ----
  $effect(() => {
    if (!lyricsMode || !lyricsEl) return;
    scrollLyricIntoView(lyricsEl, lyricState.highlightIndex, '.am-lyric-line', 0.25);
  });

  function toggleLyricsMode() {
    lyricsMode = !lyricsMode;
  }

  function handlePlayerPointerDown(event) {
    if (secondaryPanel || showMoreMenu || showLocalQueue) return;
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
    swipeActive = true;
  }

  function handlePlayerPointerUp(event) {
    if (!swipeActive) return;
    swipeActive = false;
    const dx = event.clientX - swipeStartX;
    const dy = event.clientY - swipeStartY;
    swipeStartX = 0;
    swipeStartY = 0;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    suppressCoverClick = true;
    lyricsMode = dx < 0;
    safeTimeout(() => { suppressCoverClick = false; }, 80);
  }

  function handleCoverClick() {
    if (suppressCoverClick) {
      suppressCoverClick = false;
      return;
    }
    toggleLyricsMode();
  }

  function toggleMoreMenu() {
    showMoreMenu = !showMoreMenu;
  }

  function closeMoreMenu() {
    showMoreMenu = false;
  }

  function openSecondaryPanel(panel) {
    showMoreMenu = false;
    secondaryPanel = panel;
    if (panel === 'comments' || panel === 'playlists') contextPanelRequest = panel;
  }

  function closeSecondaryPanel() {
    secondaryPanel = null;
    contextPanelRequest = null;
  }

  function handleToggleLocalQueue() {
    showMoreMenu = false;
    toggleLocalQueue?.();
  }

  function showMenuMessage(text) {
    menuMessage = text;
    safeTimeout(() => {
      if (menuMessage === text) menuMessage = '';
    }, 1600);
  }

  async function shareTrack() {
    if (!player.id) return;
    actionBusy = 'share';
    const url = `https://music.163.com/song?id=${player.id}`;
    const title = player.title || '哲听歌曲';
    const text = player.artist ? `${title} - ${player.artist}` : title;
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else await navigator.clipboard?.writeText(url);
      showMenuMessage(navigator.share ? '已打开分享' : '链接已复制');
    } catch (error) {
      if (error?.name !== 'AbortError') showMenuMessage('分享失败');
    } finally {
      actionBusy = '';
    }
  }

  function closeAndNavigate(fn, id, preview) {
    if (!id) return;
    showMoreMenu = false;
    onClose?.();
    fn?.(id, true, preview);
  }

  function openAlbum() {
    closeAndNavigate(onOpenAlbum, album?.id);
  }

  function openArtist() {
    closeAndNavigate(onOpenArtist, firstArtist?.id);
  }

  function cycleQuality() {
    const index = QUALITY_ORDER.indexOf(player.preferredLevel);
    const next = QUALITY_ORDER[(index + 1) % QUALITY_ORDER.length] || 'standard';
    setQuality(next);
  }

  function setQuality(level) {
    player.setPreferredLevel(level);
  }

  async function openSimilarPlaylist() {
    if (!player.id || actionBusy === 'similar') return;
    actionBusy = 'similar';
    try {
      const res = await ncm.simiPlaylist(player.id);
      const playlist = (res?.playlists || [])[0];
      if (!playlist?.id) {
        showMenuMessage('暂无相似歌单');
        return;
      }
      closeAndNavigate(onOpenPlaylist, playlist.id, playlist);
    } catch {
      showMenuMessage('加载失败');
    } finally {
      actionBusy = '';
    }
  }

  function openHotComments() {
    if (!player.id) return;
    openSecondaryPanel('comments');
  }

  function toggleTheme() {
    onToggleTheme?.();
  }

  function setPlayerTheme(theme) {
    playerTheme = theme;
  }

  function handleMenuItem(item) {
    item.action?.();
  }

  function secondaryContextPanel() {
    if (secondaryPanel === 'comments') return contextPanelRequest || 'comments';
    if (secondaryPanel === 'playlists') return contextPanelRequest || 'playlists';
    return null;
  }
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

<div class="apple-music-player" class:lyrics-mode={lyricsMode} class:entered={entered} class:closing={closing} class:vinyl-theme={playerTheme === 'vinyl'} class:playing={player.playing} role="region" aria-label="播放器" onpointerdown={handlePlayerPointerDown} onpointerup={handlePlayerPointerUp} onpointercancel={() => { swipeActive = false; swipeStartX = 0; swipeStartY = 0; }}>

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
          <button class="am-more-item" type="button" role="menuitem" onclick={() => handleMenuItem(item)} disabled={item.disabled}>
            <Icon name={item.icon} size={18} strokeWidth={1.8} />
            <span>{item.label}</span>
          </button>
        {/each}
        {#if menuMessage}
          <div class="am-more-message" aria-live="polite">{menuMessage}</div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Flying cover -->
  <div class="am-flying-cover" role="button" tabindex="0"
    onclick={handleCoverClick}
    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); toggleLyricsMode(); } }}>
    <img class="am-vinyl-label" src={coverUrl(player.cover, 300)} alt="" referrerpolicy="no-referrer" />
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

  {#if secondaryPanel}
    <div class="am-secondary-backdrop" role="presentation" onclick={closeSecondaryPanel}></div>
    <section class="am-secondary-sheet" class:compact={secondaryPanel === 'quality' || secondaryPanel === 'theme'} class:detail={secondaryPanel === 'comments' || secondaryPanel === 'playlists'} aria-label={secondaryTitle}>
      <div class="am-secondary-header">
        <div class="am-secondary-title">{secondaryTitle}</div>
        <button class="am-secondary-close" type="button" aria-label="关闭" onclick={closeSecondaryPanel}>
          <Icon name="close" size={18} />
        </button>
      </div>

      {#if secondaryPanel === 'quality'}
        <div class="am-secondary-list">
          {#each QUALITY_ORDER as level}
            <button class="am-secondary-row" class:active={player.preferredLevel === level} type="button" onclick={() => setQuality(level)}>
              <Icon name={player.preferredLevel === level ? 'check' : 'music'} size={18} strokeWidth={1.8} />
              <span>{qualityLabels[level] || level}</span>
            </button>
          {/each}
        </div>
      {:else if secondaryPanel === 'theme'}
        <div class="am-secondary-list">
          {#each playerThemeOptions as option}
            <button class="am-secondary-row" class:active={playerTheme === option.value} type="button" onclick={() => setPlayerTheme(option.value)}>
              <Icon name={playerTheme === option.value ? 'check' : option.icon} size={18} strokeWidth={1.8} />
              <span>{option.label}</span>
            </button>
          {/each}
          <button class="am-secondary-row" type="button" onclick={toggleTheme}>
            <Icon name="sun" size={18} strokeWidth={1.8} />
            <span>切换明暗色</span>
          </button>
        </div>
      {:else}
        <div class="am-secondary-context">
          <SongContextStrip variant="mobile" activePanel={secondaryContextPanel()} showCards={false} onActivePanelChange={(value) => { contextPanelRequest = value }} {onOpenArtist} />
        </div>
      {/if}
    </section>
  {/if}

  <!-- Lyrics area -->
  <div class="am-lyrics-area" bind:this={lyricsEl} aria-live="polite" aria-atomic="false">
    <div class="am-lyrics-inner">
      {#if lyricState.loading}
        <div class="am-no-lyric" aria-busy="true">歌词加载中…</div>
      {:else if lyricState.lyrics.length > 0}
        {#each lyricState.lyrics as line, i}
          {@render lyricLine(line, i)}
        {/each}
      {:else}
        <div class="am-no-lyric">暂无歌词</div>
      {/if}
    </div>
  </div>
  <!-- Gradient overlays replace mask-image for better mobile performance -->
  <div class="am-lyrics-fade-top"></div>
  <div class="am-lyrics-fade-bottom"></div>

  <!-- Queue Panel -->
  {#if showLocalQueue}
    <QueuePanel show={true} mobileVisible={true} onClose={handleToggleLocalQueue} onOpenArtist={onOpenArtist} />
  {/if}
</div>

<style>
  .apple-music-player {
    --am-cover-size: 296px;
    --am-cover-half: 148px;
    --am-cover-lift: 52px;
    --am-info-gap: 40px;
    position: absolute;
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
    inset: 0;
    z-index: 0;
    overflow: hidden;
  }
  .am-bg-cover {
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    filter: blur(40px) saturate(1.4);
    transform: scale(1.18);
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
    top: calc(36px + env(safe-area-inset-top));
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
    width: 100%;
    padding: 8px 0 calc(12px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: 18px 18px 0 0;
    background: var(--bg-surface);
    box-shadow: 0 -8px 30px rgba(0,0,0,0.18);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    overflow: hidden;
    animation: queue-slide-up 0.32s var(--ease-out);
  }

  .am-more-item {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    color: inherit;
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    background: transparent;
    transition: background 0.1s;
  }

  .am-more-item :global(svg) {
    flex: 0 0 20px;
    color: var(--text-secondary);
  }

  .am-more-item span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .am-more-item:hover {
    background: var(--bg-hover);
  }

  .am-more-item:active {
    background: var(--accent-bg);
  }

  .am-more-item:disabled {
    opacity: 0.38;
    transform: none;
  }

  .am-more-message {
    min-height: 24px;
    padding: 2px 20px 0;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 650;
  }

  @keyframes queue-slide-up {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .am-secondary-backdrop {
    position: fixed;
    inset: 0;
    z-index: 44;
    background: transparent;
  }

  .am-secondary-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 45;
    width: 100%;
    max-height: min(68vh, 520px);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: 18px 18px 0 0;
    background: var(--bg-surface);
    box-shadow: 0 -8px 30px rgba(0,0,0,0.18);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    overflow: hidden;
    animation: queue-slide-up 0.32s var(--ease-out);
  }

  .am-secondary-sheet.compact {
    height: auto;
  }

  .am-secondary-sheet.detail {
    height: min(68vh, 520px);
  }

  .am-secondary-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--border);
  }

  .am-secondary-title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }

  .am-secondary-close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
    border-radius: 50%;
    transition: all 0.15s;
  }

  .am-secondary-close:active {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }

  .am-secondary-list {
    flex: 0 1 auto;
    overflow-y: auto;
    padding: 8px 0 calc(12px + env(safe-area-inset-bottom));
  }

  .am-secondary-sheet.compact .am-secondary-list {
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }

  .am-secondary-row {
    min-height: 44px;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    color: inherit;
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    transition: background 0.1s;
  }

  .am-secondary-row:hover {
    background: var(--bg-hover);
  }

  .am-secondary-row.active {
    color: var(--accent);
    background: var(--accent-bg);
  }

  .am-secondary-row.active span {
    font-weight: 800;
  }

  .am-secondary-context {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0 0 calc(12px + env(safe-area-inset-bottom));
  }

  .am-secondary-context :global(.ly-context-detail) {
    position: static;
    width: 100%;
    height: 100%;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .am-secondary-context :global(.ly-context-detail-head) {
    display: none;
  }

  .am-secondary-context :global(.ly-context-detail-list),
  .am-secondary-context :global(.ly-context-comment-list),
  .am-secondary-context :global(.ly-context-detail-grid) {
    max-height: none;
    height: 100%;
    overflow-y: auto;
  }

  .am-secondary-context :global(.ly-context-detail-grid) {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 8px 0 18px;
  }

  .am-secondary-context :global(.ly-context-detail-playlist) {
    width: 100%;
    min-height: 64px;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    border-radius: 0;
    color: inherit;
    background: transparent;
    transition: background 0.1s;
  }

  .am-secondary-context :global(.ly-context-detail-playlist:hover),
  .am-secondary-context :global(.ly-context-detail-playlist:active) {
    background: var(--bg-hover);
  }

  .am-secondary-context :global(.ly-context-detail-playlist img),
  .am-secondary-context :global(.ly-context-detail-playlist .ly-context-cover-ph) {
    width: 48px;
    height: 48px;
    aspect-ratio: auto;
    margin: 0;
    border-radius: 6px;
    object-fit: cover;
    background: var(--bg-layer);
    flex-shrink: 0;
  }

  .am-secondary-context :global(.ly-context-detail-playlist strong) {
    display: block;
    min-width: 0;
    color: rgba(255,255,255,0.9);
    font-size: 14px;
    line-height: 1.35;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .am-secondary-context :global(.ly-context-subhead) {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 6px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .am-secondary-context :global(.ly-context-subhead button) {
    flex-shrink: 0;
    color: var(--accent);
    font-size: 14px;
    font-weight: 600;
  }

  .am-secondary-context :global(.ly-context-subhead span) {
    min-width: 0;
    color: rgba(255,255,255,0.9);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .am-secondary-context :global(.ly-context-comment-list) {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 18px 16px 22px;
    scroll-padding-top: 18px;
  }

  .am-secondary-context :global(.ly-context-comment-row) {
    width: 100%;
    height: auto;
    min-height: 0;
    padding: 16px 0 18px;
    border-radius: 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: transparent;
  }

  .am-secondary-context :global(.ly-context-comment-row:last-child) {
    border-bottom: 0;
  }

  .am-secondary-context :global(.ly-context-comment-row strong) {
    display: block;
    margin-bottom: 9px;
    color: rgba(255,255,255,0.9);
    font-size: 14px;
    line-height: 1.35;
    font-weight: 700;
  }

  .am-secondary-context :global(.ly-context-comment-row p) {
    margin: 0;
    color: rgba(255,255,255,0.68);
    font-size: 14px;
    line-height: 1.7;
    overflow-wrap: anywhere;
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
    top: calc(50% - var(--am-cover-half) - var(--am-cover-lift));
    left: calc(50% - var(--am-cover-half));
    width: var(--am-cover-size);
    height: var(--am-cover-size);
  }

  .vinyl-theme .am-flying-cover {
    top: calc(50% - var(--am-cover-half) - var(--am-cover-lift));
    left: calc(50% - var(--am-cover-half));
    width: var(--am-cover-size);
    height: var(--am-cover-size);
    overflow: visible;
    border-radius: 14px;
    box-shadow: 0 16px 42px rgba(0,0,0,0.44);
  }

  .vinyl-theme .am-flying-cover::before {
    content: '';
    position: absolute;
    top: 12px;
    right: -76px;
    width: 272px;
    height: 272px;
    border-radius: 50%;
    background:
      radial-gradient(circle at center, rgba(255,255,255,0.12) 0 2%, #0a0a0b 2.4% 4%, transparent 4.4% 21%, rgba(255,255,255,0.08) 21.3% 21.9%, transparent 22.2% 100%),
      conic-gradient(from 18deg, rgba(255,255,255,0.18), transparent 8%, transparent 35%, rgba(255,255,255,0.08) 43%, transparent 52%, transparent 78%, rgba(255,255,255,0.12), transparent),
      repeating-radial-gradient(circle at center, #202124 0 1px, #111214 2px 4px, #070708 5px 6px),
      radial-gradient(circle at 35% 28%, rgba(255,255,255,0.18), transparent 22%),
      radial-gradient(circle at center, #1a1b1d 0, #070708 70%);
    box-shadow: 0 18px 42px rgba(0,0,0,0.46), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 46px rgba(0,0,0,0.76);
    animation: vinyl-spin 14s linear infinite;
  }

  .vinyl-theme .am-flying-cover::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 3;
    border-radius: 14px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -28px 44px rgba(0,0,0,0.16);
    pointer-events: none;
  }

  .vinyl-theme .am-flying-cover::before,
  .vinyl-theme .am-vinyl-label {
    animation-play-state: paused;
  }

  .vinyl-theme.playing .am-flying-cover::before,
  .vinyl-theme.playing .am-vinyl-label {
    animation-play-state: running;
  }

  @keyframes vinyl-spin {
    to { transform: rotate(360deg); }
  }

  .am-flying-cover:active {
    transform: scale(0.96) !important;
  }
  .lyrics-mode .am-flying-cover {
    top: calc(38px + env(safe-area-inset-top));
    left: 18px;
    width: 62px;
    height: 62px;
    border-radius: 12px;
  }

  .lyrics-mode.vinyl-theme .am-flying-cover {
    overflow: hidden;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.36);
  }

  .lyrics-mode.vinyl-theme .am-flying-cover::before,
  .lyrics-mode.vinyl-theme .am-flying-cover::after {
    display: none;
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
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .vinyl-theme .am-flying-cover-img {
    position: relative;
    inset: auto;
    z-index: 1;
    width: 100%;
    height: 100%;
    border-radius: 14px;
    box-shadow: none;
    animation: none;
  }

  .am-vinyl-label {
    display: none;
  }

  .vinyl-theme .am-vinyl-label {
    position: absolute;
    top: 92px;
    right: -16px;
    z-index: 1;
    display: block;
    width: 112px;
    height: 112px;
    object-fit: cover;
    border-radius: 50%;
    box-shadow: 0 0 0 8px rgba(255,255,255,0.04), 0 0 0 1px rgba(0,0,0,0.52);
    animation: vinyl-spin 14s linear infinite;
  }

  .lyrics-mode.vinyl-theme .am-flying-cover-img {
    position: static;
    width: 100%;
    height: 100%;
    border-radius: 0;
    box-shadow: none;
  }

  /* ---- Track Info ---- */
  .am-track-info {
    position: absolute;
    z-index: 10;
    top: calc(50% + var(--am-cover-half) - var(--am-cover-lift) + var(--am-info-gap));
    left: calc(50% - var(--am-cover-half));
    width: var(--am-cover-size);
    text-align: left;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.35s ease 0.12s, transform 0.35s var(--ease-spring) 0.12s;
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
    top: calc(64px + env(safe-area-inset-top));
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
    top: calc(50% + var(--am-cover-half) - var(--am-cover-lift) + var(--am-info-gap) + 80px);
    left: 14px;
    right: 14px;
    background: transparent;
    backdrop-filter: none;
    border: none;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.35s ease 0.22s, transform 0.35s var(--ease-spring) 0.22s;
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
    top: calc(134px + env(safe-area-inset-top));
    bottom: 0;
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
    padding-top: 26px;
    padding-bottom: 96px;
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
    height: 96px;
    z-index: 6;
    pointer-events: none;
  }
  .am-lyrics-fade-top {
    top: -48px;
    display: none;
  }
  .am-lyrics-fade-bottom {
    bottom: -40px;
    background: linear-gradient(to top, rgba(0,0,0,0.38) 0%, transparent 100%);
  }

  .am-lyrics-inner {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
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
    transition: color 0.3s ease;
  }
  .am-lyric-line.before .am-lyric-text {
    color: rgba(255,255,255,0.6);
  }
  .am-lyric-line.active .am-lyric-text {
    font-weight: 700;
    color: #fff;
    font-size: 20px;
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

  @media (prefers-reduced-motion: reduce) {
    .am-flying-cover,
    .am-lyrics-area,
    .am-lyric-line,
    .am-lyric-text {
      transition-duration: 0.01ms;
    }

    .vinyl-theme .am-flying-cover::before,
    .vinyl-theme .am-vinyl-label {
      animation: none;
    }
  }

</style>
