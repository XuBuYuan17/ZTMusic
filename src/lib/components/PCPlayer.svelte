<script lang="ts">
  import { tick } from 'svelte';
  import type { SongId } from '../types/music.ts';
  import type { CompactTrack, CompactAlbum } from '../player/queue.ts';
  import { player } from '../stores/player.svelte.ts';
  import { auth } from '../stores/auth.svelte.ts';
  import { toast } from '../stores/toast.svelte.ts';
  import { coverUrl } from '../utils/image.ts';
  import { useLyrics } from '../composables/useLyrics.svelte.ts';
  import { useLike } from '../composables/useLike.svelte.ts';
  import { QUALITY_LABELS } from '../composables/useSettings.svelte.ts';
  import { scrollLyricIntoView } from '../utils/scroll-lyric.ts';
  import PlaybackControls from './PlaybackControls.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import ArtistNames from './ArtistNames.svelte';
  import QueuePanel from './QueuePanel.svelte';
  import SongContextStrip from './SongContextStrip.svelte';
  import SongPlaylistPanel from './SongPlaylistPanel.svelte';
  import Icon from './ui/Icon.svelte';
  import { dialogFocus, reducedMotion } from '../app/desktop-motion.ts';
  import { closeDrag } from '../app/close-drag.ts';
  import { playerMorph } from '../stores/player-morph.svelte.ts';
  import { lyricMenu, lyricMenuTransition } from '../app/lyric-menu.ts';
  import { QUALITY_ORDER } from '../utils/constants.ts';

  type ContextPanel = 'songs' | 'playlists' | 'comments';
  type MenuView = 'main' | 'add' | 'remove' | 'quality';

  let { onClose, onOpenArtist, onOpenAlbum, onOpenPlaylist, showLocalQueue = false, toggleLocalQueue }: {
    onClose?: () => void
    onOpenArtist?: (id: number | null) => void
    onOpenAlbum?: (id: number | null) => void
    onOpenPlaylist?: (id: number | null, push?: boolean, preview?: unknown) => void
    showLocalQueue?: boolean
    toggleLocalQueue?: () => void
  } = $props();

  const lyricState = useLyrics();
  const like = useLike((text) => toast.show(text));

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
  let menuView = $state<MenuView>('main');
  let menuWidth = $derived(menuView === 'main' ? 240 : 300);
  let menuMessage = $state('');
  let actionBusy = $state('');
  let showTranslation = $state(true);
  let menuAnchor = $state<HTMLButtonElement | null>(null);
  let menuEl = $state<HTMLDivElement | null>(null);
  let messageTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    void player.id;
    void playerMorph.phase;
    closeLyricTools();
  });
  $effect(() => () => clearTimeout(messageTimer));

  // 切视图会卸载刚点的那颗按钮，焦点掉到 <body>，lyricMenu 的方向键就找不到落点了。
  // 切完送回菜单里第一个「看得见」的可点项，不用先按 Tab 也能继续用方向键。
  // 必须按可见性过滤：两个子面板是 hidden 常驻的，不过滤会命中隐藏面板里的按钮
  // ponytail: 回主菜单时落点是第一项而不是刚才那颗按钮 —— {#if} 会重建按钮节点，
  // 存旧引用没意义。真要精确还原得给按钮加 data-menu 标记再按名查找
  $effect(() => {
    void menuView;
    if (!showLyricTools) return;
    tick().then(() => {
      const items = [...(menuEl?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      items.find(el => el.getClientRects().length > 0)?.focus({ preventScroll: true });
    });
  });

  $effect(() => {
    if (!lyricsEl) return;
    const index = lyricState.highlightIndex;
    void showTranslation;
    let cancelled = false;
    tick().then(() => {
      if (!cancelled) scrollLyricIntoView(lyricsEl, index, '.ly-line', 0.32, reducedMotion() ? 'instant' : 'smooth');
    });
    return () => { cancelled = true };
  });

  $effect(() => {
    if (!lyricsEl) return;
    const observer = new ResizeObserver(() => {
      scrollLyricIntoView(lyricsEl, lyricState.highlightIndex, '.ly-line', 0.32, 'instant');
    });
    observer.observe(lyricsEl);
    return () => observer.disconnect();
  });

  function closeLyricTools(): void {
    showLyricTools = false;
    menuView = 'main';
  }

  // 只有 Escape 走这条：子面板打开时先退回主菜单，再按一次才关掉整个菜单
  function dismissMenu(): void {
    if (menuView !== 'main') { menuView = 'main'; return }
    closeLyricTools();
  }

  function openMenuView(view: MenuView): void {
    // 歌单面板要账号态。不在这里挡的话 SongPlaylistPanel 会先弹「请先登录」再显示
    // 「没有可用歌单」，两句互相打架
    if (view !== 'quality' && !auth.isLoggedIn) { showMenuMessage('请先登录'); return }
    menuView = view;
  }

  function openContextPanel(type: ContextPanel): void {
    contextPanelRequest = type;
    closeLyricTools();
  }

  function toggleLyricTools(): void {
    menuAnchor?.focus({ preventScroll: true });
    menuMessage = '';
    menuView = 'main';
    showLyricTools = !showLyricTools;
  }

  function showMenuMessage(text: string): void {
    menuMessage = text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
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
      else {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url);
      }
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

  // QUALITY_ORDER 是 string[]，{#each} 出来的 level 收窄不到 QualityLevel，用 Record 别名索引
  const qualityLabels: Record<string, string> = QUALITY_LABELS;

  function pickQuality(level: string): void {
    player.setPreferredLevel(level);
    menuView = 'main';
    showMenuMessage(`音质：${qualityLabels[level] || '标准'}`);
  }

</script>

<!-- PC Layout: Two Columns -->
<div class="ly-pc-player">
  <div class="ly-system-actions morph-in" style="--s:0.2;--d:0.55" aria-label="歌词页工具">
    <div class="ly-volume-control" class:open={showLyricsVolume} role="button" tabindex="0" aria-label="音量" aria-expanded={showLyricsVolume} onclick={(event) => { event.stopPropagation(); showLyricsVolume = !showLyricsVolume }} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showLyricsVolume = !showLyricsVolume } }}>
      <span class="ly-volume-shell">
        <button class="ly-glass-icon-btn" type="button" onclick={(event) => { event.stopPropagation(); showLyricsVolume = !showLyricsVolume }} aria-label={showLyricsVolume ? '收起音量调节' : '展开音量调节'}>
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

  <div class="ly-back-rail morph-in" style="--s:0.2;--d:0.55">
    <button class="ly-back-capsule" type="button" onclick={() => onClose?.()} aria-label="返回">
      <span class="ly-back-icon"><Icon name="arrow-left" size={20} strokeWidth={2} /></span>
      <span class="ly-back-label">返回</span>
    </button>
  </div>

  <!-- LEFT COLUMN: Cover + Controls -->
  <div class="ly-left" use:closeDrag>
    <div class="ly-left-cover">
      <div class="ly-cover-wrap">
          {#if player.cover}<img class="ly-cover" src={coverUrl(player.cover, 600)} alt="" referrerpolicy="no-referrer" />{:else}<span class="ly-cover ly-cover-placeholder"><Icon name="music" size={64} /></span>{/if}

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
            <button class="ly-star-btn" class:active={like.liked} onclick={like.toggle} disabled={like.busy} aria-label={like.liked ? '取消收藏' : '收藏'} aria-pressed={like.liked}>
              {#if like.liked}
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              {:else}
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
              {/if}
            </button>
            <button class="ly-star-btn" class:active={showLyricTools} type="button" bind:this={menuAnchor} onclick={toggleLyricTools} aria-label="更多" aria-haspopup="menu" aria-controls={showLyricTools ? "pc-lyric-menu" : undefined} aria-expanded={showLyricTools}>
              <Icon name="more" size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

    </div>

    <div class="ly-left-controls">
      <div class="morph-in" style="--s:0.2;--d:0.55">
        <ProgressBar currentTime={player.currentTime} duration={player.duration} disabled={!player.id} onseek={(t) => { player.seek(t) }} />
      </div>
      <div class="morph-in" style="--s:0.2;--d:0.55">
        <PlaybackControls
          variant="lyrics"
          mode={player.mode}
          playing={player.playing}
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
  </div>

  <!-- RIGHT COLUMN: Lyrics + Context -->
  <div class="ly-right">
    <div class="ly-right-panel">
      <div class="ly-lyrics-scroll" class:empty={lyricState.loading || !lyricState.lyrics.length} bind:this={lyricsEl}>
        <div class="ly-lyrics-inner">
          {#if lyricState.loading}
            <div class="ly-no-lyric" aria-busy="true">歌词加载中…</div>
          {:else if lyricState.lyrics.length > 0}
            {#each lyricState.lyrics as line, i}
              <button class="ly-line" style="--distance:{Math.abs(i - lyricState.highlightIndex)}" class:active={i === lyricState.highlightIndex} class:sung={i < lyricState.highlightIndex}
                aria-current={i === lyricState.highlightIndex ? 'true' : undefined}
                onclick={() => { if (player.duration) player.seek(Math.max(0, Math.min(player.duration, Number(line.time)))); }}>
                <span class="ly-line-text">{line.text || '...'}</span>
                {#if showTranslation && line.translation}<span class="ly-line-trans">{line.translation}</span>{/if}
              </button>
            {/each}
          {:else}
            <div class="ly-no-lyric">暂无歌词</div>
          {/if}
        </div>
      </div>
      <div class="morph-in" style="--s:0.2;--d:0.55">
        <SongContextStrip variant="desktop" activePanel={contextPanelRequest} showCards={false} onActivePanelChange={(value) => { contextPanelRequest = value }} onOpenArtist={handleOpenArtist} {onClose} />
      </div>
    </div>
  </div>


  {#if showLyricTools && menuAnchor}
    <div id="pc-lyric-menu" class="ly-song-menu" role="menu" aria-label="歌曲更多操作" tabindex="-1" bind:this={menuEl}
      use:lyricMenu={{ anchor: menuAnchor, close: closeLyricTools, width: menuWidth }} use:dialogFocus={dismissMenu} transition:lyricMenuTransition>
      <!-- 子面板是「次级菜单」：进子面板时主菜单整段撤掉，而不是追加在它下面 -->
      {#if menuView === 'main'}
      <button type="button" role="menuitem" onclick={shareTrack} disabled={!showLyricTools || !player.id || actionBusy === 'share'}><Icon name="share" size={16} /><span>分享</span></button>
      <button type="button" role="menuitem" onclick={() => openMenuView('add')} disabled={!showLyricTools || !player.id}><Icon name="add" size={16} /><span>添加到歌单</span></button>
      <button type="button" role="menuitem" onclick={() => openMenuView('remove')} disabled={!showLyricTools || !player.id}><Icon name="trash" size={16} /><span>从歌单移除</span></button>
      <button type="button" role="menuitem" onclick={openAlbum} disabled={!showLyricTools || !album?.id}><Icon name="music" size={16} /><span>查看专辑</span></button>
      <button type="button" role="menuitem" onclick={openArtist} disabled={!showLyricTools || !firstArtist?.id}><Icon name="user" size={16} /><span>查看歌手</span></button>
      <div class="ly-song-menu-divider" role="separator"></div>
      <button type="button" role="menuitem" onclick={() => openMenuView('quality')} disabled={!showLyricTools || !player.id}><Icon name="settings" size={16} /><span>音质</span><span class="ly-song-menu-value">{qualityLabels[player.preferredLevel] || '标准'}</span></button>
      {#if lyricState.lyrics.some(line => line.translation)}
        <button type="button" role="menuitemcheckbox" aria-checked={showTranslation} disabled={!showLyricTools} onclick={() => { showTranslation = !showTranslation }}><span class="ly-song-menu-icon">译</span><span>显示译文</span><span class="ly-song-menu-value">{showTranslation ? '开' : '关'}</span></button>
      {/if}
      <div class="ly-song-menu-divider" role="separator"></div>
      <button type="button" role="menuitem" onclick={() => openContextPanel('comments')} disabled={!showLyricTools || !player.id}><Icon name="messages" size={16} /><span>歌曲评论</span></button>
      <button type="button" role="menuitem" onclick={() => openContextPanel('songs')} disabled={!showLyricTools || !player.id}><Icon name="music" size={16} /><span>相似歌曲</span></button>
      <button type="button" role="menuitem" onclick={() => openContextPanel('playlists')} disabled={!showLyricTools || !player.id}><Icon name="list" size={16} /><span>相似歌单</span></button>
      {/if}
      <!-- 两个面板都用 hidden 常驻：SongPlaylistPanel 内部缓存用户歌单，切走再切回来不该重拉一次 -->
      <div hidden={menuView !== 'quality'}>
        <button class="ly-song-menu-back" type="button" onclick={() => menuView = 'main'}><Icon name="chevron-left" size={16} /><span>音质</span></button>
        {#each QUALITY_ORDER as level}
          <button type="button" role="menuitemradio" aria-checked={player.preferredLevel === level} onclick={() => pickQuality(level)}>
            <Icon name={player.preferredLevel === level ? 'check' : 'music'} size={16} /><span>{qualityLabels[level] || level}</span>
          </button>
        {/each}
      </div>
      <div hidden={menuView !== 'add' && menuView !== 'remove'}>
        <SongPlaylistPanel
          active={menuView === 'add' || menuView === 'remove'}
          mode={menuView === 'remove' ? 'remove' : 'add'}
          trackId={player.id ?? null}
          trackName={player.title}
          onBack={() => menuView = 'main'}
          onToast={showMenuMessage}
        />
      </div>
      {#if menuMessage}<div class="ly-song-menu-message" role="status">{menuMessage}</div>{/if}
    </div>
  {/if}

  <!-- PC Queue Panel -->
  {#if showLocalQueue}
    <div class="ly-local-queue" role="presentation" onclick={(e) => e.stopPropagation()}>
      <QueuePanel show={true} onClose={toggleLocalQueue} onOpenArtist={onOpenArtist} />
    </div>
  {/if}
</div>
