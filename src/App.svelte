<script lang="ts">
  import { flushSync, tick, untrack } from 'svelte'
  import { desktopFeedback, reducedMotion, rememberCardOrigin, dismissTopDialog } from './lib/app/desktop-motion.ts'
  import { subscribeAndroidBack } from './lib/app/android-back.ts'
  import { isTauriRuntime, runtimePlatform } from './lib/utils/runtime.ts'
  import { canViewTransition, shouldAnimateLayoutFlip, startLayoutTransition } from './lib/app/layout-transition.ts'
  import type { SongId } from './lib/types/music.ts'
  import { player } from './lib/stores/player.svelte.ts'
  import { playerMorph } from './lib/stores/player-morph.svelte.ts'
  import { auth } from './lib/stores/auth.svelte.ts'
  import { router } from './lib/stores/router.svelte.ts'
  import { wallpaper } from './lib/stores/wallpaper.svelte.ts'
  import { getStorage, setStorage } from './lib/utils/storage.ts'
  import { getSetting, migrateSettings, setSetting } from './lib/utils/settings.ts'
  import { countUnreadMessages, getInitialMessageReadState, loadMessageReadState } from './lib/services/message-read-state.ts'
  import { extractMessageList, loadPrivateMessageResponse } from './lib/services/message-data.ts'
  import { coverUrl } from './lib/utils/image.ts'
  import { installKeyboardShortcuts } from './lib/app/keyboard-shortcuts.ts'
  import { createThemeTransition } from './lib/app/theme-transition.ts'
  import { lazyModule } from './lib/app/lazy-module.ts'
  import { openAlbumRef, openArtistRef, openPlaylistRef, openUserRef } from './lib/app/nav-refs.ts'
  import {
    applyAccentProperties,
    extractCoverAccent,
    getAccentProperties,
    normalizeAccentTheme,
  } from './lib/theme/accent.ts'
  import type { AccentThemeName } from './lib/theme/accent.ts'
  import Sidebar from './lib/components/Sidebar.svelte'
  import PlayerBar from './lib/components/PlayerBar.svelte'
  import MobileMiniPlayer from './lib/components/MobileMiniPlayer.svelte'
  import { mobileFeedback } from './lib/app/mobile-feedback.ts'
  import QueuePanel from './lib/components/QueuePanel.svelte'
  import FollowDialog from './lib/components/FollowDialog.svelte'
  import LyricsPageV2 from './lib/components/LyricsPageV2.svelte'
  import PlayerMorph from './lib/components/PlayerMorph.svelte'
  import LoginOverlay from './lib/components/LoginOverlay.svelte'
  import WallpaperLayer from './lib/components/WallpaperLayer.svelte'
  import DesktopPageHost from './lib/components/layout/DesktopPageHost.svelte'
  import { isMobileDevice, isTouchDevice, responsive } from './lib/utils/responsive.ts'
  import Toast from './lib/components/ui/Toast.svelte'
  import PlayerHud from './lib/components/ui/PlayerHud.svelte'
  import WindowTitleBar from './lib/components/WindowTitleBar.svelte'
  import { isTauriDesktop } from './lib/utils/runtime.ts'

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
  const hasCustomTitlebar = isTauriDesktop()
  // 同步打标（不能等 $effect，否则首帧内容会顶到标题栏下）；供 fixed overlay 避让
  if (hasCustomTitlebar) document.documentElement.classList.add('desktop-titlebar')
  const loadMobileApp = lazyModule(() => import('./lib/components/MobileApp.svelte'))

  // ── UI 状态 ──
  let sidebarCollapsed = $state(isMobileRuntime())
  let showSheet = $state(false)
  let showLogin = $state(false)
  let showFollowDialog = $state(false)
  let showQueuePanel = $state(false)
  let showMobileDrawer = $state(false)
  let mobileMenuTrigger: HTMLButtonElement | null = null
  let lyricsOrigin = $state<LyricsOrigin | null>(null)
  let messageTargetUser = $state<MessageTargetUser | null>(null)
  let notificationUnread = $state(0)
  let isMobile = $state(isMobileRuntime())
  let mobileDialogOpen = $state(false)
  $effect(() => {
    if (!isMobile) return
    const root = document.documentElement
    const sync = () => { mobileDialogOpen = root.classList.contains('mobile-panel-open') }
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    sync()
    return () => observer.disconnect()
  })
  $effect(() => {
    if (!isMobile || !isTauriRuntime() || !/Android/i.test(runtimePlatform())) return
    if (!mobileDialogOpen && !showMobileDrawer && !showSheet && !showQueuePanel && router.activeView === 'home') return
    return subscribeAndroidBack(() => {
      if (dismissTopDialog()) return
      if (showMobileDrawer) { closeMobileDrawer(); return }
      if (showSheet) { closeSheet(); return }
      if (showQueuePanel) { closeQueue(); return }
      router.goBack()
    })
  })
  $effect(() => {
    if (!isMobile) return
    const feedback = mobileFeedback(document.body)
    document.body.addEventListener('click', rememberCardOrigin, true)
    return () => {
      feedback.destroy()
      document.body.removeEventListener('click', rememberCardOrigin, true)
    }
  })

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

  // 页面进入后台或窗口关闭前同步落盘，补上定时保存之间的最后一段进度与队列变化。
  $effect(() => {
    const savePlaybackState = () => player.save()
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') savePlaybackState()
    }
    window.addEventListener('pagehide', savePlaybackState)
    document.addEventListener('visibilitychange', saveWhenHidden)
    return () => {
      window.removeEventListener('pagehide', savePlaybackState)
      document.removeEventListener('visibilitychange', saveWhenHidden)
    }
  })


  // 上一次布局尺寸，用来判断「朝向真的翻转了」。
  // 初值给 0：启动到订阅之间的尺寸变化不算翻转，避免开场误播一次过渡。
  let layoutBox = { width: 0, height: 0 }

  function applyLayout(next: { isMobile: boolean }): void {
    isMobile = next.isMobile
    // 切换到移动布局默认收起侧栏，切回 PC 默认展开
    sidebarCollapsed = next.isMobile
    // 同步更新 CSS 依赖的根元素 class（控制 Sidebar/PC 元素显示隐藏）
    document.documentElement.classList.toggle('mobile-runtime', next.isMobile)
  }

  $effect(() => {
    const u = responsive.subscribe(r => {
      const prev = layoutBox
      layoutBox = { width: r.width, height: r.height }
      // untrack：这个 effect 只负责订阅，不该因 isMobile 变化重跑
      const wasMobile = untrack(() => isMobile)
      if (r.isMobile === wasMobile) return
      const animate = shouldAnimateLayoutFlip({
        wasMobile, isMobile: r.isMobile,
        prevWidth: prev.width, prevHeight: prev.height,
        width: r.width, height: r.height,
        touch: isTouchDevice(),
      })
      // 旋转是整壳销毁重建：class 切换与 Svelte 渲染必须一起落在回调内，
      // 否则旧快照会拍到「class 已换、内容未换」的错位帧
      if (animate && !reducedMotion() && canViewTransition()) {
        startLayoutTransition(() => flushSync(() => applyLayout(r)))
      } else {
        applyLayout(r)
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

  // PC 端全局键盘快捷键（移动布局自动忽略）
  $effect(() => installKeyboardShortcuts({ player, isMobile: () => isMobile }))

  // 拖拽发起 morph 时先收队列，避免两个 overlay 叠在一起；open 态 tools 开队列不受影响
  $effect(() => { if (playerMorph.phase === 'dragging' && showQueuePanel) showQueuePanel = false })

  $effect(() => { document.documentElement.style.backgroundColor = isMobile ? (normalizeTheme(theme) === 'dark' ? '#0a0a0a' : '#e8e8ed') : router.heroColor })
  $effect(() => { const nextTheme = normalizeTheme(theme); if (nextTheme !== theme) theme = nextTheme; syncSystemTheme(nextTheme); setStorage('zheting-theme', nextTheme) })
  $effect(() => {
    document.documentElement.classList.toggle('custom-wallpaper', wallpaper.active)
    return () => document.documentElement.classList.remove('custom-wallpaper')
  })

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
    // 桌面走连续 morph 层；移动保持原有覆盖层链路
    if (!isMobile) { playerMorph.open(); return }
    const source = originEl || document.querySelector('.lcd-artwork__img') || document.querySelector('.player-bar')
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
  function openMobileDrawer(trigger: HTMLButtonElement): void {
    mobileMenuTrigger = trigger
    showMobileDrawer = true
  }
  function closeMobileDrawer(restoreFocus = true): void {
    if (!showMobileDrawer) return
    showMobileDrawer = false
    if (restoreFocus) tick().then(() => mobileMenuTrigger?.focus())
  }

  $effect(() => {
    if (!isMobile || !showMobileDrawer) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileDrawer()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  $effect(() => {
    if (!isMobile) showMobileDrawer = false
  })
  function setTheme(value: string): void { toggleTheme(undefined, normalizeTheme(value)) }
  function setAccentTheme(value: string): void { accentTheme = normalizeAccentTheme(value) }

  function openMessageWithUser(user: MessageTargetUser): void {
    if (!auth.isLoggedIn) { showLogin = true; return }
    showFollowDialog = false; messageTargetUser = user; router.handleNav('messages', undefined, isMobile)
  }

  const toggleTheme = createThemeTransition({ getTheme: () => theme, setTheme: (value) => theme = value, tick })

  const defaultPage = getSetting('default_page', 'home')
  if (defaultPage === 'library') { router.handleNav('library') }
  else if (defaultPage === 'explore') { router.activeView = 'explore' }
  else if (defaultPage === 'browse') { router.activeView = 'explore' }
  else if (isMobileRuntime()) { router.activeView = 'explore' }
  else { router.handleNav('home') }
</script>

<WallpaperLayer />

{#if hasCustomTitlebar}
  <WindowTitleBar />
{/if}

<main class="app-shell" inert={isMobile && (showSheet || showQueuePanel || showLogin || showFollowDialog)} use:desktopFeedback class:has-wallpaper={wallpaper.active} data-theme={theme}>
  <a href="#main-content" class="skip-link">跳到主要内容</a>
  <Sidebar
    activeView={router.activeView}
    bind:collapsed={sidebarCollapsed}
    {theme}
    inDrawer={isMobile}
    open={!isMobile || showMobileDrawer}
    notificationUnread={notificationUnread}
    refreshKey={router.refreshKey}
    onNavigate={(view: string, extra?: number | null) => { router.handleNav(view, extra, isMobile) }}
    onToggleTheme={toggleTheme}
    onOpenLogin={() => { showLogin = true }}
    onRequestClose={() => closeMobileDrawer()}
  />

  {#if isMobile && showMobileDrawer}
    <button class="mobile-sidebar-backdrop" type="button" aria-label="关闭导航菜单" onclick={() => closeMobileDrawer()}></button>
  {/if}

  <div class="main-area" inert={isMobile && showMobileDrawer}>
    {#if isMobile}
      {#await loadMobileApp()}
        <div class="loading-state" aria-busy="true" aria-label="正在加载移动端界面"></div>
      {:then module}
        <module.default
          activeView={router.activeView}
          {theme}
          onNavigate={router.handleNav}
          onOpenPlaylist={openPlaylistRef}
          onOpenAlbum={openAlbumRef}
          onOpenArtist={openArtistRef}
          onOpenUser={openUserRef}
          onOpenMessage={openMessageWithUser}
          onOpenLogin={() => showLogin = true}
          onSetTheme={setTheme}
          {accentTheme}
          onSetAccentTheme={setAccentTheme}
          onBack={router.goBack}
          onOpenMenu={openMobileDrawer}
          targetUser={messageTargetUser}
          onUnreadChange={(count: unknown) => { notificationUnread = count as number }}
        />
      {:catch}
        <div class="loading-state" role="alert">移动端界面加载失败，请重启应用</div>
      {/await}
    {:else}
      <DesktopPageHost
        {theme}
        {accentTheme}
        onOpenLogin={() => showLogin = true}
        onSetTheme={setTheme}
        onSetAccentTheme={setAccentTheme}
        onOpenMessage={openMessageWithUser}
        targetUser={messageTargetUser}
        onUnreadChange={(count: number) => { notificationUnread = count }}
      />
    {/if}
  </div>
</main>

{#if !isMobile || player.id}
  <div class="player-bar-wrap" class:queue-open={showQueuePanel} class:sidebar-collapsed={sidebarCollapsed}>
    {#if isMobile}
      <MobileMiniPlayer onOpenSheet={openSheet} onToggleQueue={toggleQueue} {showQueuePanel} />
    {:else}
      <PlayerBar onOpenSheet={openSheet} onToggleQueue={toggleQueue} {showQueuePanel} onOpenArtist={openArtistRef} />
    {/if}
  </div>
{/if}

<LyricsPageV2 show={showSheet} origin={lyricsOrigin} onClose={closeSheet} onOpenArtist={router.goArtist} onOpenAlbum={router.goAlbum} onOpenPlaylist={router.goPlaylist} onToggleTheme={toggleTheme} />
{#if !isMobile}
  <PlayerMorph
    onOpenArtist={router.goArtist}
    onOpenAlbum={router.goAlbum}
    onOpenPlaylist={router.goPlaylist}
    showLocalQueue={showQueuePanel}
    toggleLocalQueue={toggleQueue}
  />
{/if}
<LoginOverlay showLogin={showLogin} onClose={() => showLogin = false} />
<FollowDialog show={showFollowDialog} user={auth.user} onClose={() => showFollowDialog = false} onOpenMessage={openMessageWithUser} />
<QueuePanel show={showQueuePanel} onClose={closeQueue} onOpenArtist={router.goArtist} mobileVisible={isMobile} />
<Toast />
<PlayerHud />
