<script lang="ts">
  import { fade } from 'svelte/transition'
  import { tick, untrack } from 'svelte'
  import type { SongId } from './lib/types/music.ts'
  import { player } from './lib/stores/player.svelte.ts'
  import { auth } from './lib/stores/auth.svelte.ts'
  import { router } from './lib/stores/router.svelte.ts'
  import { wallpaper } from './lib/stores/wallpaper.svelte.ts'
  import { getStorage, setStorage } from './lib/utils/storage.ts'
  import { getSetting, migrateSettings, setSetting } from './lib/utils/settings.ts'
  import { countUnreadMessages, getInitialMessageReadState, loadMessageReadState } from './lib/services/message-read-state.ts'
  import { extractMessageList, loadPrivateMessageResponse } from './lib/services/message-data.ts'
  import { coverUrl } from './lib/utils/image.ts'
  import { getAppBackAction } from './lib/app/back.ts'
  import type { AppBackState } from './lib/app/back.ts'
  import { installAndroidEdgeBack, installAndroidHistoryBack } from './lib/app/mobile-back.ts'
  import { installKeyboardShortcuts } from './lib/app/keyboard-shortcuts.ts'
  import { createThemeTransition } from './lib/app/theme-transition.ts'
  import {
    applyAccentProperties,
    extractCoverAccent,
    getAccentProperties,
    normalizeAccentTheme,
  } from './lib/theme/accent.ts'
  import type { AccentThemeName } from './lib/theme/accent.ts'
  import Sidebar from './lib/components/Sidebar.svelte'
  import PlayerBar from './lib/components/PlayerBar.svelte'
  import QueuePanel from './lib/components/QueuePanel.svelte'
  import FollowDialog from './lib/components/FollowDialog.svelte'
  import LyricsPageV2 from './lib/components/LyricsPageV2.svelte'
  import LoginOverlay from './lib/components/LoginOverlay.svelte'
  import WallpaperLayer from './lib/components/WallpaperLayer.svelte'
  import { isMobileDevice, responsive } from './lib/utils/responsive.ts'
  import HomePage from './lib/pages/pc/Home.svelte'
  import Toast from './lib/components/ui/Toast.svelte'

  interface LyricsOrigin {
    x?: number
    y?: number
    top?: number
    right?: number
    bottom?: number
    left?: number
    radius?: number
  }

  type MessageTargetUser = { userId: SongId; nickname?: unknown; avatarUrl?: unknown }

  const isMobileRuntime = (): boolean => isMobileDevice()
  // 返回 T | Promise<T>：{#await} 对已缓存的模块直接按值解析
  function lazyModule<T>(loader: () => Promise<T>): () => Promise<T> | T {
    let module: T | undefined
    let promise: Promise<T> | undefined
    return () => module ?? (promise ??= loader().then((loaded) => { module = loaded; return loaded }))
  }
  const loadMobileApp = lazyModule(() => import('./lib/components/MobileApp.svelte'))
  const loadExplorePage = lazyModule(() => import('./lib/pages/pc/Explore.svelte'))
  const loadDailyHistoryPage = lazyModule(() => import('./lib/pages/pc/DailyHistory.svelte'))
  const loadSearchPage = lazyModule(() => import('./lib/pages/SearchPage.svelte'))
  const loadArtistPage = lazyModule(() => import('./lib/pages/ArtistPage.svelte'))
  const loadMessagesPage = lazyModule(() => import('./lib/pages/pc/Messages.svelte'))
  const loadLibraryPage = lazyModule(() => import('./lib/pages/pc/Library.svelte'))
  const loadRecentPage = lazyModule(() => import('./lib/pages/pc/Recent.svelte'))
  const loadLocalMusicPage = lazyModule(() => import('./lib/pages/LocalMusicPage.svelte'))
  const loadListeningStatsPage = lazyModule(() => import('./lib/pages/ListeningStatsPage.svelte'))
  const loadSettingsPage = lazyModule(() => import('./lib/pages/pc/Settings.svelte'))
  const loadLikedPage = lazyModule(() => import('./lib/pages/pc/Liked.svelte'))
  const loadPlaylistPage = lazyModule(() => import('./lib/pages/PlaylistPage.svelte'))
  const loadAboutPage = lazyModule(() => import('./lib/pages/AboutPage.svelte'))

  // ── UI 状态 ──
  let sidebarCollapsed = $state(isMobileRuntime())
  let showSheet = $state(false)
  let showLogin = $state(false)
  let showFollowDialog = $state(false)
  let showQueuePanel = $state(false)
  let showMobileDrawer = $state(false)
  let mobileTabsHidden = $state(false)
  let lyricsOrigin = $state<LyricsOrigin | null>(null)
  let messageTargetUser = $state<MessageTargetUser | null>(null)
  let notificationUnread = $state(0)
  let isMobile = $state(isMobileRuntime())

  // ── 主题 ──
  migrateSettings()
  function normalizeTheme(value: string): 'light' | 'dark' { return value === 'light' || value === 'dark' ? value : 'dark' }
  let theme = $state<string>(normalizeTheme(getStorage('zheting-theme', 'dark')))
  let accentTheme = $state<AccentThemeName>(normalizeAccentTheme(getSetting('accent_theme', 'red')))
  let accentRequestId = 0
  let accentTransitionTimer: ReturnType<typeof setTimeout> | undefined
  let lastCoverAccent: Awaited<ReturnType<typeof extractCoverAccent>> = null

  function syncSystemTheme(value: string): void {
    const nextTheme = normalizeTheme(value)
    const dark = nextTheme === 'dark'
    document.documentElement.setAttribute('data-theme', nextTheme)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0a0a' : '#e8e8ed')
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', dark ? 'dark light' : 'light dark')
  }

  function commitAccent(properties: Record<string, string>): void {
    const root = document.documentElement
    root.classList.add('accent-color-transitioning')
    applyAccentProperties(root, properties)
    const shell = document.querySelector('.app-shell')
    if (shell) applyAccentProperties(shell as HTMLElement, properties)
    clearTimeout(accentTransitionTimer)
    accentTransitionTimer = setTimeout(() => root.classList.remove('accent-color-transitioning'), 480)
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
    const selected = normalizeAccentTheme(accentTheme)
    const colorMode = normalizeTheme(theme)
    const currentCover = player.cover
    const requestId = ++accentRequestId
    setSetting('accent_theme', selected)

    commitAccent(getAccentProperties(selected, colorMode, lastCoverAccent))
    if (selected !== 'cover' || !currentCover) return

    extractCoverAccent(coverUrl(currentCover, 96)).then((color) => {
      if (requestId !== accentRequestId || !color) return
      lastCoverAccent = color
      commitAccent(getAccentProperties(selected, colorMode, color))
    })
  })

  $effect(() => {
    if (!auth.isLoggedIn) { notificationUnread = 0; return }
    let cancelled = false
    Promise.all([loadPrivateMessageResponse(), loadMessageReadState()])
      .then(([res, readState]) => {
        if (cancelled) return
        const messages = extractMessageList(res)
        notificationUnread = countUnreadMessages(messages, readState ?? getInitialMessageReadState())
      })
      .catch(() => { if (!cancelled) notificationUnread = 0 })
    return () => { cancelled = true }
  })

  // ── UI 函数 ──
  function openSheet(originEl?: Element | null): void {
    const source = originEl || document.querySelector('.lcd-artwork__img') || document.querySelector('.m-avatar-btn') || document.querySelector('.player-bar')
    if (source) {
      const r = source.getBoundingClientRect()
      lyricsOrigin = {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        top: r.top,
        right: window.innerWidth - r.right,
        bottom: window.innerHeight - r.bottom,
        left: r.left,
        radius: Math.min(14, r.width / 4, r.height / 4),
      }
    } else lyricsOrigin = null
    showSheet = true
  }
  function closeSheet(): void { showSheet = false }
  function toggleQueue(): void { showQueuePanel = !showQueuePanel }
  function closeQueue(): void { showQueuePanel = false }
  function setTheme(value: string): void { theme = normalizeTheme(value) }
  function setAccentTheme(value: string): void { accentTheme = normalizeAccentTheme(value) }

  // 页面组件的导航回调普遍收 unknown/SongId，router.go* 收 number|null，统一在这一层 cast
  function openPlaylistRef(id: unknown, push = true, preview?: unknown): void {
    router.goPlaylist(id as number | null, push, preview as Parameters<typeof router.goPlaylist>[2])
  }
  function openArtistRef(id: unknown): void { router.goArtist(id as number | null) }
  function openAlbumRef(id: unknown): void { router.goAlbum(id as number | null) }

  function openMessageWithUser(user: MessageTargetUser): void {
    if (!auth.isLoggedIn) { showLogin = true; return }
    showFollowDialog = false; messageTargetUser = user; router.handleNav('messages')
  }

  function handleAppBack(): boolean {
    const action = getAppBackAction(getBackState())
    if (!action) return false
    if (action === 'mobileDrawer') showMobileDrawer = false
    else if (action === 'sheet') closeSheet()
    else if (action === 'queue') closeQueue()
    else if (action === 'login') showLogin = false
    else if (action === 'followDialog') showFollowDialog = false
    else if (action === 'routeBack') router.goBack()
    else if (action === 'homeView') router.handleNav(isMobile ? 'explore' : 'home')
    return true
  }

  function getBackState(): AppBackState {
    return {
      showMobileDrawer,
      showSheet,
      showQueuePanel,
      showLogin,
      showFollowDialog,
      routeStackLength: router.routeStack.length,
      activeView: router.activeView,
      isMobile,
    }
  }

  function hasAppBackTarget(): boolean {
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

<main class="app-shell" class:has-wallpaper={wallpaper.active} data-theme={theme}>
  <WallpaperLayer />
  <a href="#main-content" class="skip-link">跳到主要内容</a>
  <Sidebar
    activeView={router.activeView}
    bind:collapsed={sidebarCollapsed}
    {theme}
    notificationUnread={notificationUnread}
    refreshKey={router.refreshKey}
    onNavigate={(view: string, extra?: number | null) => { router.handleNav(view, extra) }}
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
          onOpenPlaylist={openPlaylistRef}
          onOpenAlbum={openAlbumRef}
          onOpenArtist={openArtistRef}
          onSearch={() => router.handleNav('search')}
          onOpenLogin={() => showLogin = true}
          onSetTheme={setTheme}
          {accentTheme}
          onSetAccentTheme={setAccentTheme}
          onBack={router.goBack}
          onTabsHiddenChange={(hidden: boolean) => mobileTabsHidden = hidden}
          targetUser={messageTargetUser}
          {notificationUnread}
          onUnreadChange={(count: unknown) => { notificationUnread = count as number }}
        />
      {:catch}
        <div class="loading-state" role="alert">移动端界面加载失败，请重启应用</div>
      {/await}
    {:else}
    <div class="content-scroll" id="main-content">
      <div class="content-inner">
        <div class="page-enter" transition:fade={{ duration: 150 }}>
          {#if router.activeView === 'home'}
            <HomePage
              onNavigate={router.handleNav}
              onOpenLogin={() => showLogin = true}
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
              <module.default onOpenLogin={() => showLogin = true} onOpenPlaylist={openPlaylistRef} onNavigate={router.handleNav} />
            {/await}
          {:else if router.activeView === 'recent'}
            {#await loadRecentPage() then module}<module.default onOpenArtist={openArtistRef} onOpenAlbum={openAlbumRef} />{/await}
          {:else if router.activeView === 'localMusic'}
            {#await loadLocalMusicPage() then module}<module.default />{/await}
          {:else if router.activeView === 'listeningStats'}
            {#await loadListeningStatsPage() then module}<module.default />{/await}
          {:else if router.activeView === 'messages'}
            {#await loadMessagesPage() then module}
              <module.default onNavigate={router.handleNav} targetUser={messageTargetUser} onUnreadChange={(count) => notificationUnread = count} />
            {/await}
          {:else if router.activeView === 'liked'}
            {#await loadLikedPage() then module}
              <module.default
                onOpenArtist={openArtistRef}
                onOpenAlbum={openAlbumRef}
              />
            {/await}
          {:else if router.activeView === 'settings'}
            {#await loadSettingsPage() then module}<module.default {theme} {accentTheme} onSetTheme={(value) => theme = value} onSetAccentTheme={setAccentTheme} />{/await}
          {:else if router.activeView === 'about'}
            {#await loadAboutPage() then module}
              <module.default />
            {/await}
          {/if}
        </div>
      </div>
    </div>

  {/if}
  </div>
</main>

<!-- PlayerBar: 两端共享，PC 由 app-pc.css 定位，移动端由 app-mobile.css 覆盖 -->
<div class="player-bar-wrap" class:queue-open={showQueuePanel} class:sidebar-collapsed={sidebarCollapsed} class:m-runtime={isMobile} class:tabs-hidden={mobileTabsHidden} class:drawer-open={showMobileDrawer} aria-hidden={showMobileDrawer} inert={showMobileDrawer}>
  <PlayerBar onOpenSheet={openSheet} onToggleQueue={toggleQueue} {showQueuePanel} onOpenArtist={openArtistRef} />
</div>

<LyricsPageV2 show={showSheet} origin={lyricsOrigin} onClose={closeSheet} onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} onOpenPlaylist={router.goPlaylist} onToggleTheme={toggleTheme} />
<LoginOverlay showLogin={showLogin} onClose={() => showLogin = false} />
<FollowDialog show={showFollowDialog} user={auth.user} onClose={() => showFollowDialog = false} onOpenMessage={openMessageWithUser} />
<QueuePanel show={showQueuePanel} onClose={closeQueue} onOpenArtist={router.goArtist} mobileVisible={isMobile} />
<Toast />
