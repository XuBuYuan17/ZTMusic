<script>
  import { player } from '../stores/player.svelte.js'
  import { auth } from '../stores/auth.svelte.js'
  import { coverUrl } from '../utils/image.js'

  import MobileHome from '../pages/mobile/Home.svelte'
  import MobileBrowse from '../pages/mobile/Browse.svelte'
  import MobileLibrary from '../pages/mobile/Library.svelte'
  import MobileSettings from '../pages/mobile/Settings.svelte'
  import PlaylistPage from '../pages/PlaylistPage.svelte'
  import SearchPage from '../pages/SearchPage.svelte'
  import ArtistPage from '../pages/ArtistPage.svelte'

  let {
    activeView = 'home',
    theme = 'dark',

    // Page data
    recentTracks = [],
    recommendPlaylists = [],
    explorePersonalized = [],
    exploreTopPlaylists = [],
    exploreNewAlbums = [],
    exploreLoading = false,
    libraryPlaylists = [],
    libraryLoading = false,
    loading = false,

    // Detail view data
    playlistDetail = null,
    playlistDetailLoading = false,
    playlistLoadingMore = false,
    playlistDetailError = '',
    selectedId = null,
    heroColor = '#141414',
    artistDetail = null,
    artistSongs = [],
    artistAlbums = [],
    artistLoading = false,
    artistError = '',

    // Callbacks
    onNavigate,
    onOpenPlayer,
    onOpenPlaylist,
    onOpenAlbum,
    onOpenArtist,
    onPlaySong,
    onSearch,
    onOpenLogin,
    onSetTheme,
    onPlayAll,
    onPlayTrack,
    onPlayArtistAll,
    onPlayArtistTrack,
    onToggleArtistFollow,
  } = $props()

  const tabViews = ['home', 'browse', 'library', 'settings']
  const isTabView = $derived(tabViews.includes(activeView))
  const isDetailView = $derived(['playlist', 'album', 'artist', 'search'].includes(activeView))

  function handleTabClick(id) {
    onNavigate?.(id)
  }
</script>

<div class="mobile-shell">
  <!-- Nav Bar -->
  <!-- Content Area -->
  <main class="ms-content" class:ms-content-detail={isDetailView}>
    {#if activeView === 'home'}
      <MobileHome
        {recentTracks}
        {recommendPlaylists}
        onOpenPlaylist={(id) => onOpenPlaylist?.(id, true)}
        onPlaySong={(track) => onPlaySong?.(track)}
        onOpenAlbum={(id) => onOpenAlbum?.(id)}
        onOpenArtist={(id) => onOpenArtist?.(id)}
      />
    {:else if activeView === 'browse'}
      <MobileBrowse
        {explorePersonalized}
        {exploreTopPlaylists}
        {exploreNewAlbums}
        {exploreLoading}
        onOpenPlaylist={(id) => onOpenPlaylist?.(id, true)}
        onSearch={() => onSearch?.()}
      />
    {:else if activeView === 'library'}
      <MobileLibrary
        {libraryPlaylists}
        {libraryLoading}
        {auth}
        onOpenPlaylist={(id) => onOpenPlaylist?.(id, true)}
        onOpenLogin={() => onOpenLogin?.()}
      />
    {:else if activeView === 'settings'}
      <MobileSettings
        {theme}
        {onSetTheme}
      />
    {:else if activeView === 'playlist' || activeView === 'album'}
      <PlaylistPage
        {playlistDetail}
        loading={playlistDetailLoading}
        loadingMore={playlistLoadingMore}
        error={playlistDetailError}
        {selectedId}
        {heroColor}
        detailType={activeView === 'album' ? '专辑' : '歌单'}
        onBack={onBack}
        onPlayAll={onPlayAll}
        onPlayTrack={onPlayTrack}
        onOpenArtist={onOpenArtist}
        onOpenAlbum={onOpenAlbum}
      />
    {:else if activeView === 'search'}
      <SearchPage onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onOpenPlaylist={onOpenPlaylist} />
    {:else if activeView === 'artist'}
      <ArtistPage
        artist={artistDetail}
        songs={artistSongs}
        albums={artistAlbums}
        loading={artistLoading}
        error={artistError}
        onBack={onBack}
        onPlayAll={onPlayArtistAll}
        onPlayTrack={onPlayArtistTrack}
        onOpenAlbum={onOpenAlbum}
        onOpenArtist={onOpenArtist}
        onToggleFollow={onToggleArtistFollow}
      />
    {:else}
      <div class="ms-content-blank"></div>
    {/if}
  </main>

  <!-- Mini Player (hidden when in detail view) -->
  {#if player.id && (isTabView || activeView === 'settings')}
    <div class="ms-mini" role="button" tabindex="0" onclick={() => onOpenPlayer?.()} onkeydown={(e) => { if (e.key === 'Enter') onOpenPlayer?.() }}>
      <div class="ms-mini-progress">
        <div class="ms-mini-progress-bar" style="width: {player.duration ? (player.currentTime / player.duration * 100) : 0}%"></div>
      </div>
      <div class="ms-mini-inner">
        <img class="ms-mini-cover" src={coverUrl(player.cover, 100)} alt="" referrerpolicy="no-referrer" />
        <div class="ms-mini-info">
          <div class="ms-mini-title">{player.title || '未在播放'}</div>
          <div class="ms-mini-artist">{player.artist || ''}</div>
        </div>
        <button class="ms-mini-play" onclick={(e) => { e.stopPropagation(); player.togglePlay() }} aria-label={player.playing ? '暂停' : '播放'}>
          {#if player.playing}
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          {/if}
        </button>
      </div>
    </div>
  {/if}

  <!-- Bottom Tab Bar (hidden when in detail view) -->
  {#if !isDetailView || activeView === 'search'}
    <nav class="ms-tabs" aria-label="主导航">
      <button class="ms-tab" class:active={activeView === 'home'} onclick={() => handleTabClick('home')} aria-label="首页">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3L4 9v12h5v-7h6v7h5V9z"/></svg>
        <span>首页</span>
      </button>
      <button class="ms-tab" class:active={activeView === 'browse'} onclick={() => handleTabClick('browse')} aria-label="浏览">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 4h7v7H4zm9 0h7v7h-7zm-9 9h7v7H4zm9 0h7v7h-7z"/></svg>
        <span>浏览</span>
      </button>
      <button class="ms-tab" class:active={activeView === 'library'} onclick={() => handleTabClick('library')} aria-label="资料库">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        <span>资料库</span>
      </button>
      <button class="ms-tab" class:active={activeView === 'settings'} onclick={() => handleTabClick('settings')} aria-label="设置">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>设置</span>
      </button>
    </nav>
  {/if}
</div>

<style>
  .mobile-shell {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #121212;
    color: #fff;
    z-index: 10;
    overflow: hidden;
  }

  /* ===== Content Area ===== */
  .ms-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 6px 0 190px;
  }

  .ms-content-blank {
    min-height: 100%;
  }

  .ms-content-detail {
    padding-bottom: 20px;
  }

  /* ===== Mini Player ===== */
  .ms-mini {
    position: fixed;
    bottom: calc(80px + env(safe-area-inset-bottom, 0px) + 10px);
    left: 12px;
    right: 12px;
    height: 54px;
    border-radius: 14px;
    background: rgba(40,40,42,0.92);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    backdrop-filter: blur(20px) saturate(180%);
    cursor: pointer;
    z-index: 30;
    overflow: hidden;
    box-shadow: 0 2px 16px rgba(0,0,0,0.5);
  }

  .ms-mini-progress {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: rgba(255,255,255,0.1);
  }

  .ms-mini-progress-bar {
    height: 100%;
    background: #fc3c44;
    transition: width 0.3s linear;
  }

  .ms-mini-inner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    height: 100%;
  }

  .ms-mini-cover {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .ms-mini-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ms-mini-title {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ms-mini-artist {
    font-size: 11px;
    color: #8e8e93;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ms-mini-play {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.12);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .ms-mini-play:active {
    background: rgba(255,255,255,0.2);
  }

  /* ===== Bottom Tab Bar ===== */
  .ms-tabs {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: calc(80px + env(safe-area-inset-bottom, 0px));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    display: flex;
    align-items: stretch;
    background: rgba(18,18,18,0.92);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    border-top: 0.5px solid rgba(255,255,255,0.08);
    z-index: 25;
  }

  .ms-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    border: none;
    background: none;
    color: #8e8e93;
    font-size: 10px;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
    transition: color 0.12s;
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }

  .ms-tab.active {
    color: #fc3c44;
  }

  .ms-tab svg {
    display: block;
  }

  .ms-tab:focus-visible {
    outline: 2px solid #fc3c44;
    outline-offset: -2px;
    border-radius: 4px;
  }
</style>
