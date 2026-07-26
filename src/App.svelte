<script>
  import { fade } from 'svelte/transition'
  import { tick, untrack } from 'svelte'
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
  import { installKeyboardShortcuts } from './lib/app/keyboard-shortcuts.js'
  import { createThemeTransition } from './lib/app/theme-transition.js'
  import Icon from './lib/components/ui/Icon.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import PlayerBar from './lib/components/PlayerBar.svelte'
  import QueuePanel from './lib/components/QueuePanel.svelte'
  import FollowDialog from './lib/components/FollowDialog.svelte'
  import LyricsPageV2 from './lib/components/LyricsPageV2.svelte'
  import LoginOverlay from './lib/components/LoginOverlay.svelte'
  import SearchOverlay from './lib/components/SearchOverlay.svelte'
  import { isMobileDevice, responsive } from './lib/utils/responsive.js'
  import HomePage from './lib/pages/pc/Home.svelte'
  import Toast from './lib/components/ui/Toast.svelte'

  const isMobileRuntime = () => isMobileDevice()
  const loadMobileApp = () => import('./lib/components/MobileApp.svelte')
  const loadExplorePage = () => import('./lib/pages/pc/Explore.svelte')
  const loadDailyHistoryPage = () => import('./lib/pages/pc/DailyHistory.svelte')
  const loadSearchPage = () => import('./lib/pages/SearchPage.svelte')
  const loadArtistPage = () => import('./lib/pages/ArtistPage.svelte')
  const loadMessagesPage = () => import('./lib/pages/pc/Messages.svelte')
  const loadLibraryPage = () => import('./lib/pages/pc/Library.svelte')
  const loadRecentPage = () => import('./lib/pages/pc/Recent.svelte')
  const loadSettingsPage = () => import('./lib/pages/pc/Settings.svelte')
  const loadLikedPage = () => import('./lib/pages/pc/Liked.svelte')
  const loadPlaylistPage = () => import('./lib/pages/PlaylistPage.svelte')
  const loadAboutPage = () => import('./lib/pages/AboutPage.svelte')

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
  let isMobile = $state(isMobileRuntime())

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
  // 不再主动启动初始化，改为首次使用缓存时按需懒加载
  // initDB()

  // 注入 auth provider 到 player（解耦依赖）
  player.setAuthProvider({
    isLoggedIn: () => auth.isLoggedIn,
    getVipInfo: () => auth.vipInfo,
    isVip: () => auth.isVip,
    checkLoginStatus: () => auth.checkLoginStatus(),
  })

  // 一次性初始化：用 untrack 隔离，避免 restore() 内部读到任何 rune state 而反复触发
  $effect(() => { untrack(() => player.restore()) })

  $effect(() => {
    const u = responsive.subscribe(r => {
      if (r.isMobile !== isMobile) {
        isMobile = r.isMobile
        // 切换到移动布局默认收起侧栏，切回 PC 默认展开
        sidebarCollapsed = r.isMobile
        // 同步更新 CSS 依赖的根元素 class（控制 Sidebar/PC 元素显示隐藏）
        if (isMobile) {
          document.documentElement.classList.add('mobile-runtime')
        } else {
          document.documentElement.classList.remove('mobile-runtime')
        }
      }
    })
    return () => u()
  })

  // 初始化时设置根元素 class（同步执行，消除 FOUC 窗口）
  {
    // 在脚本执行阶段同步设置，不等待 $effect 微任务
    if (isMobileRuntime()) {
      document.documentElement.classList.add('mobile-runtime')
    } else {
      document.documentElement.classList.remove('mobile-runtime')
    }
  }

  // 只在 cookieOk 从 true 变 false 的边沿触发弹窗，避免用户手动关闭后被 auth 抖动重新弹起
  let _prevCookieOk = $state(true)
  $effect(() => {
    if (_prevCookieOk && !auth.cookieOk && auth.isLoggedIn) showLogin = true
    _prevCookieOk = auth.cookieOk
  })

  // Android 返回键
  $effect(() => installAndroidHistoryBack(handleAppBack))

  // Android 侧滑手势
  $effect(() => installAndroidEdgeBack({ hasBackTarget: hasAppBackTarget, onBack: handleAppBack }))

  // PC 端全局键盘快捷键（移动布局自动忽略）
  $effect(() => installKeyboardShortcuts({ player, isMobile: () => isMobile }))

  $effect(() => { document.documentElement.style.backgroundColor = isMobile ? (normalizeTheme(theme) === 'dark' ? '#0a0a0a' : '#e8e8ed') : router.heroColor })
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
  <a href="#main-content" class="skip-link">跳到主要内容</a>
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
      {#await loadMobileApp()}
        <div class="loading-state" aria-busy="true" aria-label="正在加载移动端界面"></div>
      {:then module}
        <module.default
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
      {:catch}
        <div class="loading-state" role="alert">移动端界面加载失败，请重启应用</div>
      {/await}
    {:else}
    <button class="global-search-btn" type="button" onclick={() => showSearch = true} aria-label="搜索">
      <Icon name="search" size={18} />
    </button>

    <div class="content-scroll" bind:this={contentScrollEl} id="main-content">
      <div class="content-inner">
        {#key router.activeView}
          <div class="page-enter" transition:fade={{ duration: 150 }}>
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
                  onOpenArtist={router.goArtist}
                  onOpenAlbum={router.goAlbum}
                />
              {/await}
            {:else if router.activeView === 'search'}
              {#await loadSearchPage() then module}
                <module.default onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} onOpenPlaylist={router.goPlaylist} />
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
                  onOpenAlbum={router.goAlbum}
                  onOpenArtist={router.goArtist}
                  onToggleFollow={router.toggleArtistFollow}
                />
              {/await}
            {:else if router.activeView === 'explore'}
              {#await loadExplorePage() then module}
                <module.default
                  onSearch={() => showSearch = true}
                  onBannerClick={router.handleBannerClick}
                  onOpenPlaylist={router.goPlaylist}
                  onOpenAlbum={router.goAlbum}
                  onPlaySong={router.playExploreSong}
                  onOpenArtist={router.goArtist}
                />
              {/await}
            {:else if router.activeView === 'dailyHistory'}
              {#await loadDailyHistoryPage() then module}<module.default onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} />{/await}
            {:else if router.activeView === 'library'}
              {#await loadLibraryPage() then module}
                <module.default onOpenLogin={() => showLogin = true} onOpenPlaylist={router.goPlaylist} onNavigate={router.handleNav} />
              {/await}
            {:else if router.activeView === 'recent'}
              {#await loadRecentPage() then module}<module.default onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} />{/await}
            {:else if router.activeView === 'messages'}
              {#await loadMessagesPage() then module}
                <module.default onNavigate={router.handleNav} targetUser={messageTargetUser} onUnreadChange={(count) => notificationUnread = count} />
              {/await}
            {:else if router.activeView === 'liked'}
              {#await loadLikedPage() then module}
                <module.default onPlayAll={router.playAll} onPlayTrack={router.playTrack} onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} />
              {/await}
            {:else if router.activeView === 'settings'}
              {#await loadSettingsPage() then module}<module.default {theme} onSetTheme={(value) => theme = value} />{/await}
            {:else if router.activeView === 'about'}
              {#await loadAboutPage() then module}
                <module.default />
              {/await}
            {/if}
          </div>
        {/key}
      </div>
    </div>

  {/if}
  </div>
</main>

<!-- PlayerBar: 两端共享，PC 由 app-pc.css 定位，移动端由 app-mobile.css 覆盖 -->
<div class="player-bar-wrap" class:queue-open={showQueuePanel} class:sidebar-collapsed={sidebarCollapsed} class:m-runtime={isMobile} class:tabs-hidden={mobileTabsHidden} class:drawer-open={showMobileDrawer} aria-hidden={showMobileDrawer} inert={showMobileDrawer}>
  <PlayerBar onOpenSheet={openSheet} onToggleQueue={toggleQueue} {showQueuePanel} onOpenArtist={router.goArtist} />
</div>

<LyricsPageV2 show={showSheet} origin={lyricsOrigin} onClose={closeSheet} onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} onOpenPlaylist={router.goPlaylist} onToggleTheme={toggleTheme} />
<SearchOverlay show={showSearch} onClose={() => showSearch = false} onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} onOpenPlaylist={router.goPlaylist} />
<LoginOverlay showLogin={showLogin} onClose={() => showLogin = false} />
<FollowDialog show={showFollowDialog} user={auth.user} onClose={() => showFollowDialog = false} onOpenMessage={openMessageWithUser} />
<QueuePanel show={showQueuePanel} onClose={closeQueue} onOpenArtist={router.goArtist} mobileVisible={isMobile} />
<Toast />
