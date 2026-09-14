<script lang="ts">
  import type { SongId } from '../types/music.ts';
  import type { CompactTrack, CompactAlbum } from '../player/queue.ts';
  import { player } from '../stores/player.svelte.ts';
  import { ncm } from '../api/client.ts';
  import { coverUrl } from '../utils/image.ts';
  import { QUALITY_ORDER } from '../utils/constants.ts';
  import { useLike } from '../composables/useLike.svelte.ts';
  import AppleMusicControls from './AppleMusicControls.svelte';
  import AppleMusicProgressBar from './AppleMusicProgressBar.svelte';
  import ArtistNames from './ArtistNames.svelte';
  import QueuePanel from './QueuePanel.svelte';
  import PlayerMoreMenu from './PlayerMoreMenu.svelte';
  import PlayerSecondarySheet, { type Panel, type StripPanel } from './PlayerSecondarySheet.svelte';
  import PlayerLyrics from './PlayerLyrics.svelte';

  interface MenuItem {
    label: string;
    icon: string;
    action?: () => void;
    disabled?: boolean;
  }

  type SafeTimer = ReturnType<typeof setTimeout>;

  let {
    onClose,
    onOpenArtist,
    onOpenAlbum,
    onOpenPlaylist,
    onToggleTheme,
    showLocalQueue = false,
    toggleLocalQueue,
  }: {
    onClose?: () => void;
    onOpenArtist?: (id: number | null) => void;
    onOpenAlbum?: (id: number | null) => void;
    onOpenPlaylist?: (id: number | null) => void;
    onToggleTheme?: (event?: MouseEvent) => void;
    showLocalQueue?: boolean;
    toggleLocalQueue?: () => void;
  } = $props();

  let lyricsMode = $state(false);
  let showMoreMenu = $state(false);
  let menuMessage = $state('');
  let actionBusy = $state('');
  let contextPanelRequest = $state<StripPanel | null>(null);
  let secondaryPanel = $state<Panel | null>(null);
  let playerTheme = $state('card');
  let entered = $state(false);
  let closing = $state(false);
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeActive = false;
  let suppressCoverClick = false;

  const like = useLike(showMenuMessage);

  let currentArtists = $derived(player.currentTrack?.ar || []);
  let album = $derived(
    player.currentTrack?.al
      || (player.currentTrack as (CompactTrack & { album?: CompactAlbum }) | null)?.album
      || null,
  );
  let firstArtist = $derived(currentArtists.find(artist => artist?.id));
  const qualityLabels: Record<string, string> = {
    lossless: '无损',
    exhigh: '极高',
    higher: '较高',
    standard: '标准',
  };
  let moreMenuItems = $derived<MenuItem[]>([
    { label: like.liked ? '取消收藏' : '收藏', icon: like.liked ? 'heart-filled' : 'heart', action: like.toggle, disabled: !player.id || like.busy },
    { label: '播放队列', icon: 'list', action: handleToggleLocalQueue, disabled: !player.id },
    { label: '分享', icon: 'share', action: shareTrack, disabled: !player.id || actionBusy === 'share' },
    { label: '专辑', icon: 'music', action: openAlbum, disabled: !album?.id },
    { label: '歌手', icon: 'user', action: openArtist, disabled: !firstArtist?.id },
    { label: `音质：${qualityLabels[player.preferredLevel] || '标准'}`, icon: 'settings', action: () => openSecondaryPanel('quality') },
    { label: '热评', icon: 'messages', action: () => openSecondaryPanel('comments'), disabled: !player.id },
    { label: '相似歌单', icon: 'list', action: () => openSecondaryPanel('playlists'), disabled: !player.id },
    { label: '播放器主题', icon: 'sun', action: () => openSecondaryPanel('theme') },
    { label: '切换应用外观', icon: 'moon', action: toggleTheme },
  ]);

  // ---- 定时器管理器 ----
  const timers = new Set<SafeTimer>();
  function safeTimeout(fn: () => void, ms: number): SafeTimer {
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

  function toggleLyricsMode(): void {
    lyricsMode = !lyricsMode;
  }

  function handlePlayerPointerDown(event: PointerEvent): void {
    if (secondaryPanel || showMoreMenu || showLocalQueue) return;
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
    swipeActive = true;
  }

  function handlePlayerPointerUp(event: PointerEvent): void {
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

  function handleCoverClick(): void {
    if (suppressCoverClick) {
      suppressCoverClick = false;
      return;
    }
    toggleLyricsMode();
  }

  function toggleMoreMenu(): void {
    showMoreMenu = !showMoreMenu;
  }

  function closeMoreMenu(): void {
    showMoreMenu = false;
  }

  function openSecondaryPanel(panel: Panel): void {
    showMoreMenu = false;
    secondaryPanel = panel;
    if (panel === 'comments' || panel === 'playlists') contextPanelRequest = panel;
  }

  function closeSecondaryPanel(): void {
    secondaryPanel = null;
    contextPanelRequest = null;
  }

  function handleToggleLocalQueue(): void {
    showMoreMenu = false;
    toggleLocalQueue?.();
  }

  // LyricsPageV2 传入的导航函数收 number|null，ArtistNames/SongContextStrip 收 SongId；
  // 组件内统一在这一层 cast（QueuePanel 同款接缝）。
  function handleOpenArtist(id: SongId): void {
    onOpenArtist?.(id as number | null);
  }

  function showMenuMessage(text: string): void {
    menuMessage = text;
    safeTimeout(() => {
      if (menuMessage === text) menuMessage = '';
    }, 1600);
  }

  function rec(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  async function shareTrack(): Promise<void> {
    if (!player.id) return;
    actionBusy = 'share';
    const url = `https://music.163.com/song?id=${player.id}`;
    const title = player.title || '哲听歌曲';
    const text = player.artist ? `${title} - ${player.artist}` : title;
    // typeof 守卫：lib.dom 把 navigator.share 声明成必选，但旧 WebView 运行时可能没有（PCPlayer 同款）
    const canShare = typeof navigator.share === 'function';
    try {
      if (canShare) await navigator.share({ title, text, url });
      else await navigator.clipboard?.writeText(url);
      showMenuMessage(canShare ? '已打开分享' : '链接已复制');
    } catch (error) {
      const name = (error as { name?: unknown } | null | undefined)?.name;
      if (name !== 'AbortError') showMenuMessage('分享失败');
    } finally {
      actionBusy = '';
    }
  }

  type NavigateFn = (id: number, push?: boolean, preview?: unknown) => void;

  function closeAndNavigate(fn: NavigateFn | undefined, id: SongId | null | undefined, preview?: unknown): void {
    if (!id) return;
    showMoreMenu = false;
    onClose?.();
    fn?.(id as number, true, preview);
  }

  function openAlbum(): void {
    closeAndNavigate(onOpenAlbum, album?.id);
  }

  function openArtist(): void {
    closeAndNavigate(onOpenArtist, firstArtist?.id);
  }

  function cycleQuality(): void {
    const index = QUALITY_ORDER.indexOf(player.preferredLevel);
    const next = QUALITY_ORDER[(index + 1) % QUALITY_ORDER.length] || 'standard';
    setQuality(next);
  }

  function setQuality(level: string): void {
    player.setPreferredLevel(level);
  }

  async function openSimilarPlaylist(): Promise<void> {
    if (!player.id || actionBusy === 'similar') return;
    actionBusy = 'similar';
    try {
      const res = await ncm.simiPlaylist(player.id);
      const list = rec(res)?.playlists;
      const playlist = rec(Array.isArray(list) ? list[0] : null);
      if (!playlist?.id) {
        showMenuMessage('暂无相似歌单');
        return;
      }
      closeAndNavigate(onOpenPlaylist, playlist.id as SongId, playlist);
    } catch {
      showMenuMessage('加载失败');
    } finally {
      actionBusy = '';
    }
  }

  function openHotComments(): void {
    if (!player.id) return;
    openSecondaryPanel('comments');
  }

  function toggleTheme(): void {
    onToggleTheme?.();
  }

  function setPlayerTheme(theme: string): void {
    playerTheme = theme;
  }

</script>

<div class="apple-music-player" class:lyrics-mode={lyricsMode} class:entered={entered} class:closing={closing} class:vinyl-theme={playerTheme === 'vinyl'} class:playing={player.playing} role="region" aria-label="播放器" onpointerdown={handlePlayerPointerDown} onpointerup={handlePlayerPointerUp} onpointercancel={() => { swipeActive = false; swipeStartX = 0; swipeStartY = 0; }}>

  <!-- Blurred background -->
  <div class="am-bg">
    <div class="am-bg-cover" style="background-image: url({coverUrl(player.cover, 600)})"></div>
    <div class="am-bg-overlay"></div>
  </div>

  <PlayerMoreMenu
    open={showMoreMenu}
    onToggle={toggleMoreMenu}
    onClose={closeMoreMenu}
    items={moreMenuItems}
    message={menuMessage}
    cover={player.cover ? coverUrl(player.cover, 96) : ''}
    title={player.title || '未在播放'}
    artist={player.artist || ''}
  />

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
      <ArtistNames artists={currentArtists} onOpenArtist={handleOpenArtist} fallback={player.artist || ''} />
    </div>
  </div>

  <!-- Corner info (lyrics mode only, top-left) -->
  <div class="am-corner-info">
    <div class="am-corner-title">{player.title || ''}</div>
    <div class="am-corner-artist">
      <ArtistNames artists={currentArtists} onOpenArtist={handleOpenArtist} fallback={player.artist || ''} />
    </div>
  </div>

  <!-- Bottom controls (no background) -->
  <div class="am-bottom-controls">
    <div class="am-bottom-progress">
      <AppleMusicProgressBar currentTime={player.currentTime} duration={player.duration} disabled={!player.id} onseek={(t) => { player.seek(t) }} />
    </div>
    <AppleMusicControls onqueue={handleToggleLocalQueue} showQueue={showLocalQueue} />
  </div>

  <PlayerSecondarySheet
    panel={secondaryPanel}
    onClose={closeSecondaryPanel}
    {playerTheme}
    onSetPlayerTheme={setPlayerTheme}
    onToggleTheme={toggleTheme}
    onSetQuality={setQuality}
    contextPanel={contextPanelRequest}
    onContextPanelChange={(value) => { contextPanelRequest = value }}
    onOpenArtist={handleOpenArtist}
  />

  <PlayerLyrics active={lyricsMode} />

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

  /* ---- Flying Cover ---- */
  .am-flying-cover {
    position: absolute;
    z-index: 10;
    border-radius: var(--radius-lg);
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
    border-radius: var(--radius-lg);
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
    border-radius: var(--radius-lg);
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
    border-radius: var(--radius-md);
  }

  .lyrics-mode.vinyl-theme .am-flying-cover {
    overflow: hidden;
    border-radius: var(--radius-md);
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
    border-radius: var(--radius-lg);
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
    font-weight: 700;
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

  @media (prefers-reduced-motion: reduce) {
    .am-flying-cover {
      transition-duration: 0.01ms;
    }

    .vinyl-theme .am-flying-cover::before,
    .vinyl-theme .am-vinyl-label {
      animation: none;
    }
  }

</style>
