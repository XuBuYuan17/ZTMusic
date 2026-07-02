<script>
  import { tick } from 'svelte'
  import { player } from './lib/stores/player.svelte.js'
  import { auth } from './lib/stores/auth.svelte.js'
  import { router } from './lib/stores/router.svelte.js'
  import { getStorage, setStorage } from './lib/utils/storage.js'
  import { getSetting, migrateSettings } from './lib/utils/settings.js'
  import { coverUrl } from './lib/utils/image.js'
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
  const isAndroidRuntime = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

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
  let isMobile = $state(false)

  // ── 主题 ──
  migrateSettings()
  let theme = $state(getStorage('zheting-theme', 'dark'))

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
  $effect(() => {
    if (typeof window === 'undefined' || !isAndroidRuntime() || !isMobileRuntime()) return
    const state = { zhetingBackGuard: true }
    history.replaceState(state, '', location.href); history.pushState(state, '', location.href)
    const handlePopState = () => { if (!handleAppBack()) return; history.pushState(state, '', location.href) }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  })

  // Android 侧滑手势
  $effect(() => {
    if (typeof window === 'undefined' || !isAndroidRuntime() || !isMobileRuntime()) return
    const edgeWidth = 28, triggerDistance = 82, maxVerticalDrift = 56
    let startX = 0, startY = 0, tracking = false, triggered = false
    const ignore = (t) => t?.closest?.('input, textarea, select, [contenteditable="true"], .progress-bar, .progress-container, .volume-slider-inline, .home-quick-grid, .home-feature-row, .card-scroll')
    const down = (e) => { if (e.pointerType === 'mouse' || e.button !== 0 || !hasAppBackTarget() || e.clientX > edgeWidth || ignore(e.target)) return; startX = e.clientX; startY = e.clientY; tracking = true; triggered = false }
    const move = (e) => { if (!tracking || triggered) return; const dx = e.clientX - startX, dy = Math.abs(e.clientY - startY); if (dx < 0 || dy > maxVerticalDrift) { tracking = false; return }; if (dx >= triggerDistance) { triggered = true; tracking = false; e.preventDefault(); handleAppBack() } }
    const stop = () => { tracking = false; triggered = false }
    window.addEventListener('pointerdown', down, { passive: true }); window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', stop, { passive: true }); window.addEventListener('pointercancel', stop, { passive: true })
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop) }
  })

  $effect(() => { document.documentElement.style.backgroundColor = router.heroColor })
  $effect(() => { document.documentElement.setAttribute('data-theme', theme); setStorage('zheting-theme', theme) })

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

  function openFollows() {
    if (!auth.isLoggedIn) { showLogin = true; return }
    showFollowDialog = true
  }
  function openMessageWithUser(user) {
    if (!auth.isLoggedIn) { showLogin = true; return }
    showFollowDialog = false; messageTargetUser = user; router.handleNav('messages')
  }

  function handleAppBack() {
    if (showMobileDrawer) { showMobileDrawer = false; return true }
    if (showSheet) { closeSheet(); return true }
    if (showQueuePanel) { closeQueue(); return true }
    if (showSearch) { showSearch = false; return true }
    if (showLogin) { showLogin = false; return true }
    if (showFollowDialog) { showFollowDialog = false; return true }
    if (router.routeStack.length > 0) { router.goBack(); return true }
    if (isMobile && router.activeView !== 'explore') { router.handleNav('explore'); return true }
    if (router.activeView !== 'home') { router.handleNav('home'); return true }
    return false
  }
  function hasAppBackTarget() {
    return showMobileDrawer || showSheet || showQueuePanel || showSearch || showLogin || showFollowDialog || router.routeStack.length > 0 || router.activeView !== (isMobile ? 'explore' : 'home')
  }

  let t3
  function toggleTheme(event) {
    const shell = document.querySelector('.app-shell')
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    clearTimeout(t3)
    if (event?.currentTarget) {
      const r = event.currentTarget.getBoundingClientRect?.(); const x = r ? r.left + r.width / 2 : window.innerWidth / 2; const y = r ? r.top + r.height / 2 : window.innerHeight / 2
      const root = document.documentElement; root.style.setProperty('--theme-x', x + 'px'); root.style.setProperty('--theme-y', y + 'px')
      root.style.setProperty('--theme-radius', Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))) + 'px')
    }
    shell?.classList.add('theme-transitioning')
    const finish = () => { t3 = setTimeout(() => shell?.classList.remove('theme-transitioning'), 860) }
    if (!reduceMotion && document.startViewTransition) {
      const t = document.startViewTransition(async () => { theme = nextTheme; await tick() })
      t3 = setTimeout(() => shell?.classList.remove('theme-transitioning'), 920); t.finished.finally(finish); return
    }
    theme = nextTheme; finish()
  }

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
        onSetTheme={(v) => theme = v}
        onBack={router.goBack}
        onTabsHiddenChange={(hidden) => mobileTabsHidden = hidden}
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
            <MessagesPage onNavigate={router.handleNav} targetUser={messageTargetUser} />

          {:else if router.activeView === 'liked'}
            <LikedPage
              onPlayAll={router.playAll}
              onPlayTrack={router.playTrack}
              onOpenArtist={router.goArtist}
              onOpenAlbum={router.goAlbum}
            />

          {:else if router.activeView === 'settings'}
            <SettingsPage {theme} onSetTheme={(value) => theme = value} />
            <AboutPage />

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
<div class="player-bar-wrap" class:queue-open={showQueuePanel} class:m-runtime={isMobileRuntime()} class:tabs-hidden={mobileTabsHidden} class:drawer-open={showMobileDrawer} aria-hidden={showMobileDrawer} inert={showMobileDrawer}>
  <PlayerBar onOpenSheet={openSheet} onToggleQueue={toggleQueue} {showQueuePanel} onOpenArtist={router.goArtist} />
</div>

<LyricsPageV2 show={showSheet} onClose={closeSheet} onOpenArtist={router.goArtist} />
<SearchOverlay show={showSearch} onClose={() => showSearch = false} onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} onOpenPlaylist={router.goPlaylist} />
<LoginOverlay showLogin={showLogin} onClose={() => showLogin = false} />
<FollowDialog show={showFollowDialog} user={auth.user} onClose={() => showFollowDialog = false} onOpenMessage={openMessageWithUser} />
<QueuePanel show={showQueuePanel} onClose={closeQueue} onOpenArtist={router.goArtist} mobileVisible={isMobileRuntime()} />
