<script lang="ts">
  import { router } from '../../stores/router.svelte.ts'
  import type { AccentThemeName } from '../../theme/accent.ts'
  import { lazyModule } from '../../app/lazy-module.ts'
  import { openAlbumRef, openArtistRef, openPlaylistRef } from '../../app/nav-refs.ts'
  import HomePage from '../../pages/pc/Home.svelte'

  let {
    theme,
    accentTheme,
    onOpenLogin,
    onSetTheme,
    onSetAccentTheme,
    targetUser = null,
    onUnreadChange,
  }: {
    theme: string
    accentTheme: AccentThemeName
    onOpenLogin: () => void
    onSetTheme: (value: string) => void
    onSetAccentTheme: (value: string) => void
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
</script>

<div class="content-scroll" id="main-content">
  <div class="content-inner">
    <div class="page-enter">
      {#if router.activeView === 'home'}
        <HomePage
          onNavigate={router.handleNav}
          onOpenLogin={onOpenLogin}
          onOpenPlaylist={openPlaylistRef}
          onOpenArtist={openArtistRef}
          onOpenAlbum={openAlbumRef}
        />
      {:else if router.activeView === 'playlist' || router.activeView === 'album'}
        {#await loadPlaylistPage() then module}
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
        {#await loadSearchPage() then module}
          <module.default onOpenArtist={openArtistRef} onOpenAlbum={openAlbumRef} onOpenPlaylist={openPlaylistRef} />
        {/await}
      {:else if router.activeView === 'artist'}
        {#await loadArtistPage() then module}
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
            onToggleFollow={router.toggleArtistFollow}
          />
        {/await}
      {:else if router.activeView === 'explore'}
        {#await loadExplorePage() then module}
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
        {#await loadDailyHistoryPage() then module}<module.default onOpenArtist={openArtistRef} onOpenAlbum={openAlbumRef} />{/await}
      {:else if router.activeView === 'library'}
        {#await loadLibraryPage() then module}
          <module.default onOpenLogin={onOpenLogin} onOpenPlaylist={openPlaylistRef} onNavigate={router.handleNav} />
        {/await}
      {:else if router.activeView === 'recent'}
        {#await loadRecentPage() then module}<module.default onOpenArtist={openArtistRef} onOpenAlbum={openAlbumRef} />{/await}
      {:else if router.activeView === 'localMusic'}
        {#await loadLocalMusicPage() then module}<module.default />{/await}
      {:else if router.activeView === 'listeningStats'}
        {#await loadListeningStatsPage() then module}<module.default />{/await}
      {:else if router.activeView === 'messages'}
        {#await loadMessagesPage() then module}
          <module.default onNavigate={router.handleNav} {targetUser} {onUnreadChange} />
        {/await}
      {:else if router.activeView === 'liked'}
        {#await loadLikedPage() then module}
          <module.default
            onOpenArtist={openArtistRef}
            onOpenAlbum={openAlbumRef}
          />
        {/await}
      {:else if router.activeView === 'settings'}
        {#await loadSettingsPage() then module}<module.default {theme} {accentTheme} {onSetTheme} {onSetAccentTheme} />{/await}
      {:else if router.activeView === 'about'}
        {#await loadAboutPage() then module}
          <module.default />
        {/await}
      {/if}
    </div>
  </div>
</div>
