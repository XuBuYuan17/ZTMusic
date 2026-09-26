<script lang="ts">
  import type { SongId } from '../types/music.ts';
  import type { CompactTrack, CompactAlbum } from '../player/queue.ts';
  import { player } from '../stores/player.svelte.ts';
  import { coverUrl } from '../utils/image.ts';
  import { useLyrics } from '../composables/useLyrics.svelte.ts';
  import { useLike } from '../composables/useLike.svelte.ts';
  import { scrollLyricIntoView } from '../utils/scroll-lyric.ts';
  import PlaybackControls from './PlaybackControls.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import ArtistNames from './ArtistNames.svelte';
  import QueuePanel from './QueuePanel.svelte';
  import SongContextStrip from './SongContextStrip.svelte';
  import Icon from './ui/Icon.svelte';
  import { QUALITY_ORDER } from '../utils/constants.ts';

  type ContextPanel = 'songs' | 'playlists' | 'comments';

  let { onClose, onOpenArtist, onOpenAlbum, onOpenPlaylist, onToggleTheme, showLocalQueue = false, toggleLocalQueue }: {
    onClose?: () => void
    onOpenArtist?: (id: number | null) => void
    onOpenAlbum?: (id: number | null) => void
    onOpenPlaylist?: (id: number | null, push?: boolean, preview?: unknown) => void
    onToggleTheme?: (event?: MouseEvent) => void
    showLocalQueue?: boolean
    toggleLocalQueue?: () => void
  } = $props();

  const lyricState = useLyrics();
  const like = useLike();

  let currentArtists = $derived(player.currentTrack?.ar || []);
  // ponytail: CompactTrack 类型无 album 字段，历史 localStorage 队列缓存可能携带，保留原 JS 的运行时回退读取
  let album = $derived(player.currentTrack?.al
    || (player.currentTrack as (CompactTrack & { album?: CompactAlbum }) | null)?.album
    || null);
  let firstArtist = $derived(currentArtists.find(artist => artist?.id));
  let lyricsEl = $state<HTMLDivElement | null>(null);
  let contextPanelRequest = $state<ContextPanel | null>(null);
  let showLyricsVolume = $state(false);
  let showLyricTools = $state(false);
  let menuMessage = $state('');
  let actionBusy = $state('');

  $effect(() => {
    if (!lyricsEl) return;
    scrollLyricIntoView(lyricsEl, lyricState.highlightIndex, '.ly-line', 0.5);
  });

  function closeLyricTools(): void {
    showLyricTools = false;
  }

  function openContextPanel(type: ContextPanel): void {
    contextPanelRequest = type;
    closeLyricTools();
  }

  function toggleLyricTools(): void {
    showLyricTools = !showLyricTools;
  }

  const qualityLabels: Record<string, string> = {
    lossless: '无损',
    exhigh: '极高',
    higher: '较高',
    standard: '标准',
  };

  function showMenuMessage(text: string): void {
    menuMessage = text;
    setTimeout(() => {
      if (menuMessage === text) menuMessage = '';
    }, 1600);
  }

  async function shareTrack(): Promise<void> {
    if (!player.id || actionBusy === 'share') return;
    actionBusy = 'share';
    const url = `https://music.163.com/song?id=${player.id}`;
    const title = player.title || '哲听歌曲';
    const text = player.artist ? `${title} - ${player.artist}` : title;
    // typeof 守卫：lib.dom 把 navigator.share 声明成必选，但旧 WebView 运行时可能没有
    const canShare = typeof navigator.share === 'function';
    try {
      if (canShare) await navigator.share({ title, text, url });
      else await navigator.clipboard?.writeText(url);
      showMenuMessage(canShare ? '已打开分享' : '链接已复制');
    } catch (error) {
      if ((error as { name?: string } | null | undefined)?.name !== 'AbortError') showMenuMessage('分享失败');
    } finally {
      actionBusy = '';
    }
  }

  function closeAndNavigate(
    fn: ((id: number | null, push?: boolean, preview?: unknown) => void) | undefined,
    id: SongId | null | undefined,
    preview: unknown,
  ): void {
    if (!id) return;
    closeLyricTools();
    onClose?.();
    fn?.(id as number, true, preview);
  }

  function openAlbum(): void {
    closeAndNavigate(onOpenAlbum, album?.id, album);
  }

  function openArtist(): void {
    closeAndNavigate(onOpenArtist, firstArtist?.id, firstArtist);
  }

  // 接缝：下游 ArtistNames/SongContextStrip 收 SongId，上游 LyricsPageV2 透传的 router 回调收 number|null（在线 id 恒为 number）
  function handleOpenArtist(id: SongId): void {
    onOpenArtist?.(id as number | null);
  }

  function cycleQuality(): void {
    const index = QUALITY_ORDER.indexOf(player.preferredLevel);
    const next = QUALITY_ORDER[(index + 1) % QUALITY_ORDER.length] || 'standard';
    player.setPreferredLevel(next);
    showMenuMessage(`音质：${qualityLabels[next] || '标准'}`);
  }

  function toggleQueueFromCover(): void {
    closeLyricTools();
    toggleLocalQueue?.();
  }
</script>

<!-- PC Layout: Two Columns -->
<div class="ly-pc-player">
  <div class="ly-system-actions" aria-label="歌词页工具">
    <div class="ly-volume-control" class:open={showLyricsVolume} role="button" tabindex="0" aria-label="音量" onclick={(event) => { event.stopPropagation(); showLyricsVolume = !showLyricsVolume }} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showLyricsVolume = !showLyricsVolume } }}>
      <span class="ly-volume-shell">
        <button class="ly-glass-icon-btn" type="button" onclick={(event) => { event.stopPropagation(); if (showLyricsVolume) player.setVolume(player.volume === 0 ? 0.8 : 0); else showLyricsVolume = true }} aria-label={player.volume === 0 ? '取消静音' : '音量'}>
          <Icon name={player.volume > 0 ? 'volume-full' : 'volume-off'} size={19} strokeWidth={2.2} />
        </button>
        {#if showLyricsVolume}
          <span class="ly-volume-track">
            <input type="range" min="0" max="1" step="0.01" value={player.volume} onclick={(event) => event.stopPropagation()} oninput={(event) => player.setVolume(event.currentTarget.value)} aria-label="音量" />
            <span class="ly-volume-fill" style={`width:${Math.round(player.volume * 100)}%`}></span>
          </span>
        {/if}
      </span>
    </div>
  </div>

  <!-- LEFT COLUMN: Cover + Controls -->
  <div class="ly-left" class:tools-open={showLyricTools}>
    <div class="ly-left-cover" class:tools-open={showLyricTools}>
      <div class="ly-cover-wrap">
        <button class="ly-cover-button" type="button" onclick={toggleLyricTools} aria-label="展开歌曲操作" aria-expanded={showLyricTools}>
          <img class="ly-cover" src={coverUrl(player.cover, 600)} alt="" referrerpolicy="no-referrer" />
        </button>
      </div>
      <div class="ly-track-wrap">
        <div class="ly-track-top">
          <div class="ly-track-title">{player.title || '未在播放'}</div>
        </div>
        <div class="ly-track-sub">
          <div class="ly-track-info">
            <span class="ly-artist"><ArtistNames artists={currentArtists} onOpenArtist={handleOpenArtist} fallback={player.artist || ''} /></span>
            {#if player.artist && album?.name}<span class="ly-sep">—</span>{/if}
            <span class="ly-album">{album?.name || player.title || ''}</span>
          </div>
          <div class="ly-track-actions">
            <button class="ly-star-btn" class:active={like.liked} onclick={like.toggle} disabled={like.busy} aria-label="喜欢">
              {#if like.liked}
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              {:else}
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
              {/if}
            </button>
            <button class="ly-star-btn" class:active={showLyricTools} type="button" onclick={toggleLyricTools} aria-label="更多" aria-expanded={showLyricTools}>
              <Icon name="more" size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
      <div class="ly-cover-tool-panel" class:open={showLyricTools} role="menu" aria-label="歌曲更多操作" aria-hidden={!showLyricTools}>
          <div class="ly-cover-tool-primary">
            <button class="primary" type="button" role="menuitem" onclick={like.toggle} disabled={!showLyricTools || !player.id || like.busy}>
              <Icon name={like.liked ? 'heart-filled' : 'heart'} size={20} strokeWidth={2} />
              <span>{like.liked ? '取消收藏' : '收藏'}</span>
            </button>
            <button class="primary" type="button" role="menuitem" onclick={toggleQueueFromCover} disabled={!showLyricTools || !player.id}>
              <Icon name="list" size={20} strokeWidth={2.2} />
              <span>播放队列</span>
            </button>
            <button class="primary" type="button" role="menuitem" onclick={shareTrack} disabled={!showLyricTools || !player.id || actionBusy === 'share'}>
              <Icon name="share" size={20} strokeWidth={2} />
              <span>分享</span>
            </button>
          </div>
          <div class="ly-cover-tool-secondary">
            <button type="button" role="menuitem" onclick={openAlbum} disabled={!showLyricTools || !album?.id}>
              <Icon name="music" size={16} strokeWidth={2} />
              <span>专辑</span>
            </button>
            <button type="button" role="menuitem" onclick={openArtist} disabled={!showLyricTools || !firstArtist?.id}>
              <Icon name="user" size={16} strokeWidth={2} />
              <span>歌手</span>
            </button>
            <button type="button" role="menuitem" onclick={cycleQuality} disabled={!showLyricTools || !player.id}>
              <Icon name="settings" size={16} strokeWidth={2} />
              <span>{qualityLabels[player.preferredLevel] || '标准'}</span>
            </button>
            <button type="button" role="menuitem" onclick={() => openContextPanel('comments')} disabled={!showLyricTools || !player.id}>
              <Icon name="messages" size={16} strokeWidth={2} />
              <span>热评</span>
            </button>
            <button class="wide" type="button" role="menuitem" onclick={() => openContextPanel('songs')} disabled={!showLyricTools || !player.id}>
              <Icon name="lyrics" size={16} strokeWidth={2} />
              <span>相似歌曲</span>
            </button>
            <button class="wide" type="button" role="menuitem" onclick={() => openContextPanel('playlists')} disabled={!showLyricTools || !player.id}>
              <Icon name="list" size={16} strokeWidth={2.2} />
              <span>相似歌单</span>
            </button>
            <button type="button" role="menuitem" onclick={() => { closeLyricTools(); onToggleTheme?.(); }} disabled={!showLyricTools}>
              <Icon name="moon" size={16} strokeWidth={2} />
              <span>外观</span>
            </button>
          </div>
          {#if menuMessage}
            <div class="ly-cover-menu-message" aria-live="polite">{menuMessage}</div>
          {/if}
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
          {#if lyricState.loading}
            <div class="ly-no-lyric" aria-busy="true">歌词加载中…</div>
          {:else if lyricState.lyrics.length > 0}
            {#each lyricState.lyrics as line, i}
              <button class="ly-line" class:active={i === lyricState.highlightIndex} class:sung={i < lyricState.highlightIndex}
                aria-current={i === lyricState.highlightIndex ? 'true' : undefined}
                onclick={() => { if (player.duration) player.seek(Math.max(0, Math.min(player.duration, Number(line.time)))); }}>
                <span class="ly-line-text">{line.text || '...'}</span>
                {#if line.translation}<span class="ly-line-trans">{line.translation}</span>{/if}
              </button>
            {/each}
          {:else}
            <div class="ly-no-lyric">暂无歌词</div>
          {/if}
        </div>
      </div>
      <SongContextStrip variant="desktop" activePanel={contextPanelRequest} showCards={false} onActivePanelChange={(value) => { contextPanelRequest = value }} onOpenArtist={handleOpenArtist} {onClose} />
    </div>
  </div>

  <!-- PC Queue Panel -->
  {#if showLocalQueue}
    <div class="ly-local-queue" role="presentation" onclick={(e) => e.stopPropagation()}>
      <QueuePanel show={true} onClose={toggleLocalQueue} onOpenArtist={onOpenArtist} />
    </div>
  {/if}
</div>
