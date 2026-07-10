<script>
  import { tick } from 'svelte'
  import { player } from './lib/stores/player.svelte.js'
  import { auth } from './lib/stores/auth.svelte.js'
  import { router } from './lib/stores/router.svelte.js'
  import { ncm } from './lib/api/client.js'
  import { getStorage, setStorage } from './lib/utils/storage.js'
  import { getSetting, migrateSettings } from './lib/utils/settings.js'
  import { countUnreadMessages, loadMessageReadState } from './lib/services/message-read-state.js'
  import { coverUrl } from './lib/utils/image.js'
  import { getAppBackAction } from './lib/app/back.js'
  import { installAndroidEdgeBack, installAndroidHistoryBack } from './lib/app/mobile-back.js'
  import { createThemeTransition } from './lib/app/theme-transition.js'
  import { initDB } from './lib/db/init.js'
  import Icon from './lib/components/ui/Icon.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import PlayerBar from './lib/components/PlayerBar.svelte'
  import QueuePanel from './lib/components/QueuePanel.svelte'
  import FollowDialog from './lib/components/FollowDialog.svelte'
  import LyricsPageV2 from './lib/components/LyricsPageV2.svelte'
  import LoginOverlay from './lib/components/LoginOverlay.svelte'
  import SearchOverlay from './lib/components/SearchOverlay.svelte'
  import MobileApp from './lib/components/MobileApp.svelte'
  import { responsive } from './lib/utils/responsive.js'
  import HomePage from './lib/pages/pc/Home.svelte'
  import ExplorePage from './lib/pages/pc/Explore.svelte'
  import DailyHistoryPage from './lib/pages/pc/DailyHistory.svelte'
  import SearchPage from './lib/pages/SearchPage.svelte'
  import ArtistPage from './lib/pages/ArtistPage.svelte'
  import MessagesPage from './lib/pages/pc/Messages.svelte'
  import LibraryPage from './lib/pages/pc/Library.svelte'
  import RecentPage from './lib/pages/pc/Recent.svelte'
  import SettingsPage from './lib/pages/pc/Settings.svelte'
  import LikedPage from './lib/pages/pc/Liked.svelte'
  import PlaylistPage from './lib/pages/PlaylistPage.svelte'
  import AboutPage from './lib/pages/AboutPage.svelte'

  const isMobileRuntime = () => typeof document !== 'undefined' && document.documentElement.classList.contains('mobile-runtime')

  // ── UI 状态 ──
  let sidebarCollapsed = $state(isMobileRuntime())
  let contentScrollEl = $state(null)
  let showSheet = $state(false)
  let showLogin = $state(false)
  let showSearch = $state(false)
  let showFollowDialog = $state(false)
  let showQueuePanel = $state(false)
  let showMobileDrawer = $state(false)
  let mobileTabsHidden = $state(false)
  let lyricsOrigin = $state(null)
  let messageTargetUser = $state(null)
  let notificationUnread = $state(0)
  let isMobile = $state(false)

  // ── 主题 ──
  migrateSettings()
  function normalizeTheme(value) { return value === 'light' || value === 'dark' ? value : 'dark' }
  let theme = $state(normalizeTheme(getStorage('zheting-theme', 'dark')))

  function syncSystemTheme(value) {
    const nextTheme = normalizeTheme(value)
    const dark = nextTheme === 'dark'
    document.documentElement.setAttribute('data-theme', nextTheme)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0a0a' : '#e8e8ed')
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', dark ? 'dark light' : 'light dark')
  }

  auth.init()
  initDB()

  $effect(() => { player.restore() })

  $effect(() => { const u = responsive.subscribe(r => { isMobile = r.isMobile }); return () => u() })

  $effect(() => { if (!auth.cookieOk && auth.isLoggedIn) showLogin = true })

  // Tauri 关闭拦截
  $effect(() => {
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().onCloseRequested(async (event) => { if (handleAppBack()) event.preventDefault() })
      })
    }
  })

  // Android 返回键
  $effect(() => installAndroidHistoryBack(handleAppBack))

  // Android 侧滑手势
  $effect(() => installAndroidEdgeBack({ hasBackTarget: hasAppBackTarget, onBack: handleAppBack }))

  $effect(() => { document.documentElement.style.backgroundColor = isMobileRuntime() ? (normalizeTheme(theme) === 'dark' ? '#0a0a0a' : '#e8e8ed') : router.heroColor })
  $effect(() => { const nextTheme = normalizeTheme(theme); if (nextTheme !== theme) theme = nextTheme; syncSystemTheme(nextTheme); setStorage('zheting-theme', nextTheme) })

  $effect(() => {
    if (!auth.isLoggedIn) { notificationUnread = 0; return }
    let cancelled = false
    Promise.all([ncm.msgPrivate(30, 0), loadMessageReadState()])
      .then(([res, readState]) => {
        if (cancelled) return
        const messages = res?.msgs || res?.messages || res?.data || []
        notificationUnread = countUnreadMessages(messages, readState)
      })
      .catch(() => { if (!cancelled) notificationUnread = 0 })
    return () => { cancelled = true }
  })

  // ── UI 函数 ──
  function resetContentScroll() { tick().then(() => contentScrollEl?.scrollTo({ top: 0, left: 0 })) }

  function openSheet(originEl) {
    const source = originEl || document.querySelector('.lcd-artwork__img') || document.querySelector('.m-avatar-btn') || document.querySelector('.player-bar')
    if (source) { const r = source.getBoundingClientRect(); lyricsOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 } } else { lyricsOrigin = null }
    showSheet = true
  }
  function closeSheet() { showSheet = false }
  function toggleQueue() { showQueuePanel = !showQueuePanel }
  function closeQueue() { showQueuePanel = false }
  function setTheme(value) { theme = normalizeTheme(value) }

  function openFollows() {
    if (!auth.isLoggedIn) { showLogin = true; return }
    showFollowDialog = true
  }
  function openMessageWithUser(user) {
    if (!auth.isLoggedIn) { showLogin = true; return }
    showFollowDialog = false; messageTargetUser = user; router.handleNav('messages')
  }

  function handleAppBack() {
    const action = getAppBackAction(getBackState())
    if (!action) return false
    if (action === 'mobileDrawer') showMobileDrawer = false
    else if (action === 'sheet') closeSheet()
    else if (action === 'queue') closeQueue()
    else if (action === 'search') showSearch = false
    else if (action === 'login') showLogin = false
    else if (action === 'followDialog') showFollowDialog = false
    else if (action === 'routeBack') router.goBack()
    else if (action === 'homeView') router.handleNav(isMobile ? 'explore' : 'home')
    return true
  }

  function getBackState() {
    return {
      showMobileDrawer,
      showSheet,
      showQueuePanel,
      showSearch,
      showLogin,
      showFollowDialog,
      routeStackLength: router.routeStack.length,
      activeView: router.activeView,
      isMobile,
    }
  }

  function hasAppBackTarget() {
    return getAppBackAction(getBackState()) !== null
  }

  const toggleTheme = createThemeTransition({ getTheme: () => theme, setTheme: (value) => theme = value, tick })

  const defaultPage = getSetting('default_page', 'home')
  if (defaultPage === 'library') { router.handleNav('library') }
  else if (defaultPage === 'explore') { router.activeView = 'explore' }
  else if (defaultPage === 'browse') { router.activeView = 'explore' }
  else if (isMobileRuntime()) { router.activeView = 'explore' }
  else { router.handleNav('home') }
</script>

<main class="app-shell" data-theme={theme}>
  <Sidebar
    activeView={router.activeView}
    bind:collapsed={sidebarCollapsed}
    {theme}
    notificationUnread={notificationUnread}
    refreshKey={router.refreshKey}
    onNavigate={(view, extra) => { router.handleNav(view, extra) }}
    onToggleTheme={toggleTheme}
    onOpenLogin={() => { showLogin = true }}
  />

  <div class="main-area">
    {#if isMobile}
      <MobileApp
        activeView={router.activeView}
        {theme}
        bind:drawerOpen={showMobileDrawer}
        onNavigate={router.handleNav}
        onOpenPlayer={openSheet}
        onOpenPlaylist={router.goPlaylist}
        onOpenAlbum={router.goAlbum}
        onOpenArtist={router.goArtist}
        onSearch={() => showSearch = true}
        onOpenLogin={() => showLogin = true}
        onSetTheme={setTheme}
        onBack={router.goBack}
        onTabsHiddenChange={(hidden) => mobileTabsHidden = hidden}
        targetUser={messageTargetUser}
        {notificationUnread}
        onUnreadChange={(count) => notificationUnread = count}
      />
    {:else}
    <button class="global-search-btn" type="button" onclick={() => showSearch = true} aria-label="搜索">
      <Icon name="search" size={18} />
    </button>

    <div class="content-scroll" bind:this={contentScrollEl}>
      <div class="content-inner">
        {#key router.activeView}
        <div class="page-enter" class:book-turn={router.routeTransition === 'book-turn'}>
          {#if router.activeView === 'home'}
            <HomePage
              onNavigate={router.handleNav}
              onOpenLogin={() => showLogin = true}
              onOpenPlaylist={router.goPlaylist}
              onOpenArtist={router.goArtist}
              onOpenAlbum={router.goAlbum}
              onOpenFollows={openFollows}
            />

          {:else if router.activeView === 'playlist' || router.activeView === 'album'}
            <PlaylistPage
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
              onOpenArtist={router.goArtist}
              onOpenAlbum={router.goAlbum}
            />

          {:else if router.activeView === 'search'}
            <SearchPage onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} onOpenPlaylist={router.goPlaylist} />

          {:else if router.activeView === 'artist'}
            <ArtistPage
              artist={router.artistDetail}
              songs={router.artistSongs}
              albums={router.artistAlbums}
              loading={router.artistLoading}
              error={router.artistError}
              onBack={router.goBack}
              onPlayAll={router.playArtistAll}
              onPlayTrack={router.playArtistTrack}
              onOpenAlbum={router.goAlbum}
              onOpenArtist={router.goArtist}
              onToggleFollow={router.toggleArtistFollow}
            />

          {:else if router.activeView === 'explore'}
            <ExplorePage
              onSearch={() => showSearch = true}
              onBannerClick={router.handleBannerClick}
              onOpenPlaylist={router.goPlaylist}
              onOpenAlbum={router.goAlbum}
              onPlaySong={router.playExploreSong}
              onOpenArtist={router.goArtist}
            />

          {:else if router.activeView === 'dailyHistory'}
            <DailyHistoryPage
              onOpenArtist={router.goArtist}
              onOpenAlbum={router.goAlbum}
            />

          {:else if router.activeView === 'library'}
            <LibraryPage
              onOpenLogin={() => showLogin = true}
              onOpenPlaylist={router.goPlaylist}
            />

          {:else if router.activeView === 'recent'}
            <RecentPage
              onOpenArtist={router.goArtist}
              onOpenAlbum={router.goAlbum}
            />

          {:else if router.activeView === 'messages'}
            <MessagesPage onNavigate={router.handleNav} targetUser={messageTargetUser} onUnreadChange={(count) => notificationUnread = count} />

          {:else if router.activeView === 'liked'}
            <LikedPage
              onPlayAll={router.playAll}
              onPlayTrack={router.playTrack}
              onOpenArtist={router.goArtist}
              onOpenAlbum={router.goAlbum}
            />

          {:else if router.activeView === 'settings'}
            <SettingsPage {theme} onSetTheme={(value) => theme = value} />

          {:else if router.activeView === 'about'}
            <AboutPage />
          {/if}
        </div>
        {/key}
      </div>
    </div>

  {/if}
  </div>
</main>

<!-- PlayerBar: 两端共享，PC 由 app-pc.css 定位，移动端由 app-mobile.css 覆盖 -->
<div class="player-bar-wrap" class:queue-open={showQueuePanel} class:sidebar-collapsed={sidebarCollapsed} class:m-runtime={isMobileRuntime()} class:tabs-hidden={mobileTabsHidden} class:drawer-open={showMobileDrawer} aria-hidden={showMobileDrawer} inert={showMobileDrawer}>
  <PlayerBar onOpenSheet={openSheet} onToggleQueue={toggleQueue} {showQueuePanel} onOpenArtist={router.goArtist} />
</div>

<LyricsPageV2 show={showSheet} origin={lyricsOrigin} onClose={closeSheet} onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} onOpenPlaylist={router.goPlaylist} onToggleTheme={toggleTheme} />
<SearchOverlay show={showSearch} onClose={() => showSearch = false} onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} onOpenPlaylist={router.goPlaylist} />
<LoginOverlay showLogin={showLogin} onClose={() => showLogin = false} />
<FollowDialog show={showFollowDialog} user={auth.user} onClose={() => showFollowDialog = false} onOpenMessage={openMessageWithUser} />
<QueuePanel show={showQueuePanel} onClose={closeQueue} onOpenArtist={router.goArtist} mobileVisible={isMobileRuntime()} />
