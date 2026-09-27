<script lang="ts">
  import { router } from '../../stores/router.svelte.ts'
  import { pageMotion } from '../../app/desktop-motion.ts'
  import type { AccentThemeName } from '../../theme/accent.ts'
  import { lazyModule } from '../../app/lazy-module.ts'
  import { openAlbumRef, openArtistRef, openPlaylistRef, openUserRef } from '../../app/nav-refs.ts'
  import HomePage from '../../pages/pc/Home.svelte'

  let {
    theme,
    accentTheme,
    onOpenLogin,
    onSetTheme,
    onSetAccentTheme,
    onOpenMessage,
    targetUser = null,
    onUnreadChange,
  }: {
    theme: string
    accentTheme: AccentThemeName
    onOpenLogin: () => void
    onSetTheme: (value: string) => void
    onSetAccentTheme: (value: string) => void
    onOpenMessage?: (user: { userId: string | number; nickname?: unknown; avatarUrl?: unknown }) => void
    targetUser?: unknown
    onUnreadChange?: (count: number) => void
  } = $props()

  const loadExplorePage = lazyModule(() => import('../../pages/pc/Explore.svelte'))
  const loadDailyHistoryPage = lazyModule(() => import('../../pages/pc/DailyHistory.svelte'))
  const loadSearchPage = lazyModule(() => import('../../pages/SearchPage.svelte'))
  const loadArtistPage = lazyModule(() => import('../../pages/ArtistPage.svelte'))
  const loadMessagesPage = lazyModule(() => import('../../pages/pc/Messages.svelte'))
  const loadLibraryPage = lazyModule(() => import('../../pages/pc/Library.svelte'))
  const loadRecentPage = lazyModule(() => import('../../pages/pc/Recent.svelte'))
  const loadLocalMusicPage = lazyModule(() => import('../../pages/LocalMusicPage.svelte'))
  const loadListeningStatsPage = lazyModule(() => import('../../pages/ListeningStatsPage.svelte'))
  const loadSettingsPage = lazyModule(() => import('../../pages/pc/Settings.svelte'))
  const loadLikedPage = lazyModule(() => import('../../pages/pc/Liked.svelte'))
  const loadPlaylistPage = lazyModule(() => import('../../pages/PlaylistPage.svelte'))
  const loadAboutPage = lazyModule(() => import('../../pages/AboutPage.svelte'))
  const loadUserProfilePage = lazyModule(() => import('../../pages/UserProfilePage.svelte'))
</script>

<div class="content-scroll" id="main-content">
  <div class="content-inner">
    <div class="page-enter" class:desktop-page={true} use:pageMotion={{ identity: `${router.activeView}:${router.selectedId}`, direction: router.routeTransition }}>
      {#if router.activeView === 'home'}
        <HomePage
          onNavigate={router.handleNav}
          onOpenLogin={onOpenLogin}
          onOpenPlaylist={openPlaylistRef}
          onOpenArtist={openArtistRef}
          onOpenAlbum={openAlbumRef}
          onOpenUser={openUserRef}
        />
      {:else if router.activeView === 'playlist' || router.activeView === 'album'}
        {#await loadPlaylistPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}
          <module.default
            playlistDetail={router.playlistDetail}
            loading={router.playlistDetailLoading}
            loadingMore={router.playlistLoadingMore}
            error={router.playlistDetailError}
            selectedId={router.selectedId}
            heroColor={router.heroColor}
            detailType={router.activeView === 'album' ? '专辑' : '歌单'}
            onBack={router.goBack}
            onPlayAll={router.playAll}
            onPlayTrack={router.playTrack}
            onOpenArtist={openArtistRef}
            onOpenAlbum={openAlbumRef}
          />
        {/await}
      {:else if router.activeView === 'search'}
        {#await loadSearchPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}
          <module.default onOpenArtist={openArtistRef} onOpenAlbum={openAlbumRef} onOpenPlaylist={openPlaylistRef} />
        {/await}
      {:else if router.activeView === 'artist'}
        {#await loadArtistPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}
          <module.default
            artist={router.artistDetail}
            songs={router.artistSongs}
            albums={router.artistAlbums}
            loading={router.artistLoading}
            error={router.artistError}
            onBack={router.goBack}
            onPlayAll={router.playArtistAll}
            onPlayTrack={router.playArtistTrack}
            onOpenAlbum={openAlbumRef}
            onOpenArtist={openArtistRef}
            onOpenUser={openUserRef}
            onToggleFollow={router.toggleArtistFollow}
          />
        {/await}
      {:else if router.activeView === 'user'}
        {#await loadUserProfilePage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}
          <module.default
            userId={router.selectedId}
            onBack={router.goBack}
            onOpenUser={openUserRef}
            onOpenPlaylist={openPlaylistRef}
            onOpenArtist={openArtistRef}
            {onOpenMessage}
          />
        {/await}
      {:else if router.activeView === 'explore'}
        {#await loadExplorePage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}
          <module.default
            onSearch={() => router.handleNav('search')}
            onBannerClick={router.handleBannerClick}
            onOpenPlaylist={openPlaylistRef}
            onOpenAlbum={openAlbumRef}
            onPlaySong={router.playExploreSong as (track: unknown) => void}
            onOpenArtist={openArtistRef}
          />
        {/await}
      {:else if router.activeView === 'dailyHistory'}
        {#await loadDailyHistoryPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}<module.default onOpenArtist={openArtistRef} onOpenAlbum={openAlbumRef} />{/await}
      {:else if router.activeView === 'library'}
        {#await loadLibraryPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}
          <module.default onOpenLogin={onOpenLogin} onOpenPlaylist={openPlaylistRef} onNavigate={router.handleNav} />
        {/await}
      {:else if router.activeView === 'recent'}
        {#await loadRecentPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}<module.default onOpenArtist={openArtistRef} onOpenAlbum={openAlbumRef} />{/await}
      {:else if router.activeView === 'localMusic'}
        {#await loadLocalMusicPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}<module.default />{/await}
      {:else if router.activeView === 'listeningStats'}
        {#await loadListeningStatsPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}<module.default />{/await}
      {:else if router.activeView === 'messages'}
        {#await loadMessagesPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}
          <module.default onNavigate={router.handleNav} {targetUser} {onUnreadChange} />
        {/await}
      {:else if router.activeView === 'liked'}
        {#await loadLikedPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}
          <module.default
            onOpenArtist={openArtistRef}
            onOpenAlbum={openAlbumRef}
          />
        {/await}
      {:else if router.activeView === 'settings'}
        {#await loadSettingsPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}<module.default {theme} {accentTheme} {onSetTheme} {onSetAccentTheme} />{/await}
      {:else if router.activeView === 'about'}
        {#await loadAboutPage()}<div class="desktop-page-loading" role="status" aria-label="正在加载页面"><div class="skeleton-block"></div><div class="skeleton-block"></div></div>{:then module}
          <module.default />
        {/await}
      {/if}
    </div>
  </div>
</div>
