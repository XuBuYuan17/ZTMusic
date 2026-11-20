<script lang="ts">
  import { tick, untrack, onDestroy, onMount } from 'svelte'
  import { announceAndroidFrame } from '../app/android-startup.ts'
  onMount(() => { announceAndroidFrame(); onReady?.() })
  import { reducedMotion } from '../app/desktop-motion.ts'
  import { createMobileNavigationMotion, isDetailSheetView, mobileNavigationKind, outgoingViewportClipTop } from '../app/mobile-navigation-motion.ts'
  import { mobileViewport, mobileEdgeBack } from '../app/mobile-interaction.ts'
  import { requestBack } from '../app/back-navigation.ts'
  import { setScrollViewport } from '../app/scroll-viewport.ts'
  import { createPageChromeHost, setPageChromeHost } from '../app/page-chrome.svelte.ts'
  import { settingsBackGesture } from '../app/settings-back-gesture.ts'
  import type { SongId } from '../types/music.ts'
  import { hapticTap, shouldHapticTarget } from '../utils/haptics.ts'
  import { router } from '../stores/router.svelte.ts'
  import { mobileDock } from '../stores/mobile-dock.svelte.ts'
  import { buildDockItems, DOCK_TABS, type DockItem } from '../settings/mobile-dock.ts'
  import { t } from '../i18n/index.svelte.ts'
  import Icon from './ui/Icon.svelte'

  import ExplorePage from '../pages/pc/Explore.svelte'
  import LibraryPage from '../pages/pc/Library.svelte'
  import HomePage from '../pages/pc/Home.svelte'
  import { settingsCategory, settingsView, SETTINGS_CATEGORIES } from '../pages/settings-navigation.ts'
  import SettingsPage from '../pages/Settings.svelte'
  import LikedPage from '../pages/pc/Liked.svelte'
  import RecentPage from '../pages/pc/Recent.svelte'
  import DailyHistoryPage from '../pages/pc/DailyHistory.svelte'
  import MessagesPage from '../pages/pc/Messages.svelte'
  import ListeningReportPage from '../pages/pc/ListeningReport.svelte'
  import PlaylistPage from '../pages/PlaylistPage.svelte'
  import SearchPage from '../pages/SearchPage.svelte'
  import ArtistPage from '../pages/ArtistPage.svelte'
  import LocalMusicPage from '../pages/LocalMusicPage.svelte'
  import UserProfilePage from '../pages/UserProfilePage.svelte'
  import AboutPage from '../pages/AboutPage.svelte'

  let {
    activeView = 'explore', theme = 'dark', onNavigate, onOpenPlaylist, onOpenAlbum,
    onOpenArtist, onOpenUser, onOpenMessage, onOpenLogin, onSetTheme,
    accentTheme = 'red', onSetAccentTheme, onBack, onOpenMenu,
    targetUser = null, onUnreadChange, onReady,
  }: {
    activeView?: string
    onReady?: () => void
    theme?: string
    onNavigate?: (view: string, extra?: number | null, preserveSource?: boolean) => void
    onOpenPlaylist?: (id: SongId, push?: boolean, preview?: unknown) => void
    onOpenAlbum?: (id: unknown) => void
    onOpenArtist?: (id: unknown) => void
    onOpenUser?: (id: unknown) => void
    onOpenMessage?: (user: { userId: SongId; nickname?: unknown; avatarUrl?: unknown }) => void
    onOpenLogin?: () => void
    onSetTheme?: (theme: string) => void
    accentTheme?: string
    onSetAccentTheme?: (theme: string) => void
    onBack?: () => void
    onOpenMenu?: (trigger: HTMLButtonElement) => void
    targetUser?: unknown
    onUnreadChange?: (count: unknown) => void
  } = $props()


  const primaryViews = ['explore', 'search', 'library', 'settings']
  // 只有「还能返回」的页面才启用边缘返回：主视图没有上一页
  const canEdgeBack = $derived(!primaryViews.includes(activeView) || router.routeStack.length > 0)
  let selectedTab = $state(untrack(() => DOCK_TABS.some(tab => tab.id === activeView) ? activeView : [...router.routeStack].map(route => route.view === 'home' ? 'library' : route.view).reverse().find(view => DOCK_TABS.some(tab => tab.id === view)) ?? 'explore'))
  let scrollTop = $state(0)
  let chromeHidden = $state(false)
  let chromeScrollAnchor = 0
  $effect(() => { if (DOCK_TABS.some(tab => tab.id === activeView)) selectedTab = activeView })
  const isPrimaryView = $derived(primaryViews.includes(activeView))
  const coverHeaderless = $derived(isDetailSheetView(activeView))
  const titles: Record<string, string> = $derived({
    home: '我的主页', explore: '发现', library: '资料库', search: '搜索', settings: t('settings.title'),
    about: '关于哲听', liked: '喜欢的音乐', recent: '最近播放', dailyHistory: '历史日推', recommendation: '歌单',
    messages: '提醒', localMusic: '本地音乐', listeningStats: '听歌统计', playlist: '歌单', 'settings-dock': '底栏',
    ...Object.fromEntries(SETTINGS_CATEGORIES.map(item => [settingsView(item.id), t(item.titleKey)])),
    album: '专辑', artist: '歌手', user: '个人主页',
  })
  let mountedViews = $state<string[]>([])
  let contentEl = $state<HTMLElement | null>(null)
  let rootEl = $state<HTMLElement | null>(null)
  const dockItems = $derived(buildDockItems(mobileDock.config))
  const activeDockIndex = $derived(dockItems.findIndex(item => item.id === selectedTab))
  $effect(() => {
    document.documentElement.classList.toggle('mobile-floating-dock', mobileDock.config.layout === 'floating')
    return () => document.documentElement.classList.remove('mobile-floating-dock')
  })
  // 播放条在 App 里，收起状态用 html class 共享给两条浮动底栏。
  // 经典底栏常驻：只有 floating 布局才允许收起。
  const chromeCanHide = $derived(mobileDock.config.layout === 'floating')
  function showChrome(): void { chromeScrollAnchor = scrollTop; chromeHidden = false }
  // 滚动时导航滑出屏幕、播放条落到导航的位置，滚回顶部或向上滚复原。
  function hideChrome(): void { chromeScrollAnchor = scrollTop; chromeHidden = true }
  $effect(() => {
    document.documentElement.classList.toggle('mobile-chrome-hidden', chromeHidden && chromeCanHide)
    return () => document.documentElement.classList.remove('mobile-chrome-hidden')
  })
  let previousKey: string | null = null
  const scrollPositions = new Map<string, number>()
  // 向页面暴露滚动视口；滚动位置的记忆/恢复由本组件按 viewKey 负责，页面不参与复位
  setScrollViewport({
    element: () => contentEl,
    top: () => contentEl?.getBoundingClientRect().top ?? 0,
    entered: () => {},
    restoresScroll: true,
  })
  // 页面操作：页面注册，本组件决定哪些放到顶部栏
  const pageChrome = createPageChromeHost()
  setPageChromeHost(pageChrome)
  const activeChrome = $derived(pageChrome.current)
  const pageBarActions = $derived(activeChrome?.actions.filter(action => action.placement === 'top') ?? [])
  const viewKey = $derived(primaryViews.includes(activeView) || activeView === 'search' ? activeView : `${activeView}:${router.selectedId ?? ''}:${router.routeStack.length}`)
  type DetailPage = {
    key: string; view: string; id: typeof router.selectedId
    playlist: typeof router.playlistDetail; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string; color: string
    artist: typeof router.artistDetail; songs: typeof router.artistSongs; albums: typeof router.artistAlbums; artistLoading: boolean; artistError: string
  }
  let detailPages = $state<DetailPage[]>([])
  let leavingKey = $state<string | null>(null)
  let playlistSourceKey = $state<string | null>(null)
  let playlistEnteringKey = $state<string | null>(null)
  const navigationMotion = createMobileNavigationMotion()
  onDestroy(navigationMotion.cancel)

  $effect.pre(() => {
    if (primaryViews.includes(activeView) || activeView === 'search') return
    const page: DetailPage = {
      key: viewKey, view: activeView, id: router.selectedId,
      playlist: router.playlistDetail, loading: router.playlistDetailLoading, loadingMore: router.playlistLoadingMore,
      hasMore: router.playlistHasMore, error: router.playlistDetailError, color: router.heroColor,
      artist: router.artistDetail, songs: router.artistSongs, albums: router.artistAlbums,
      artistLoading: router.artistLoading, artistError: router.artistError,
    }
    untrack(() => {
      const index = detailPages.findIndex(item => item.key === page.key)
      if (index >= 0) detailPages = [...detailPages.filter(item => item.key !== page.key), page]
      else {
        // ponytail: 保留最近六个二级页面；更深返回依赖已有数据缓存重建，必要时再引入按内存预算淘汰。
        detailPages = [...detailPages, page].slice(-6)
        for (const key of scrollPositions.keys()) {
          if (key.includes(':') && !detailPages.some(item => item.key === key)) scrollPositions.delete(key)
        }
      }
    })
  })

  $effect.pre(() => {
    const view = activeView
    if ((primaryViews.includes(view) || view === 'search') && !mountedViews.includes(view)) mountedViews = [...mountedViews, view]
  })

  $effect.pre(() => {
    const key = viewKey
    const scroller = contentEl
    return untrack(() => {
      if (!scroller || key === previousKey) return
      const oldKey = previousKey
      const oldPage = [...scroller.querySelectorAll<HTMLElement>('[data-route-key]')].find(node => node.dataset.routeKey === oldKey) ?? null
      // Capture viewport geometry before the outgoing page changes positioning or scroll.
      const oldBox = oldPage?.getBoundingClientRect()
      if (oldPage && oldBox) {
        oldPage.style.setProperty('--route-outgoing-top', `${oldBox.top}px`)
        oldPage.style.setProperty('--route-outgoing-left', `${oldBox.left}px`)
        oldPage.style.setProperty('--route-outgoing-width', `${oldBox.width}px`)
        oldPage.style.setProperty('--route-outgoing-clip-top', `${outgoingViewportClipTop(scroller.getBoundingClientRect().top, oldBox.top)}px`)
      }
      const coverSnapshot = navigationMotion.capture(oldPage)
      navigationMotion.cancel()
      const kind = mobileNavigationKind(router.routeTransition, primaryViews.includes(activeView) || activeView === 'search')
      const sharedCover = Boolean(coverSnapshot.origin)
      const coverDetail = isDetailSheetView(activeView) || isDetailSheetView(oldPage?.dataset.routeKey?.split(':', 1)[0]) || Boolean(oldPage?.querySelector('.playlist-detail-page'))
      const reduced = reducedMotion()
      const openingPlaylist = kind === 'push' && isDetailSheetView(activeView) && !reduced && Boolean(oldPage)
      leavingKey = oldPage && !reduced ? oldKey : null
      playlistSourceKey = openingPlaylist ? oldKey : null
      playlistEnteringKey = openingPlaylist ? key : null
      scroller.dispatchEvent(new Event('mobile-view-change'))
      if (previousKey) scrollPositions.set(previousKey, scroller.scrollTop)
      previousKey = key
      const position = scrollPositions.get(key) ?? 0
      let cancelled = false
      const observer = new ResizeObserver(() => {
        if (!cancelled && viewKey === key) scroller.scrollTop = position
      })
      const stop = () => { cancelled = true; observer.disconnect() }
      tick().then(() => {
        if (cancelled) return
        scroller.scrollTop = position
        scrollTop = position
        showChrome()
        const page = [...scroller.querySelectorAll<HTMLElement>('[data-route-key]')].find(node => node.dataset.routeKey === key)
        const oldTabIndex = dockItems.findIndex(item => item.id === oldKey)
        const newTabIndex = dockItems.findIndex(item => item.id === key)
        const tabDirection = oldTabIndex >= 0 && newTabIndex >= 0 && newTabIndex < oldTabIndex ? -1 : 1
        if (page) observer.observe(page)
        if (page && oldKey) navigationMotion.play(page, oldPage, kind, sharedCover, coverDetail, reduced, () => { leavingKey = null; playlistSourceKey = null }, coverSnapshot, tabDirection)
        else { leavingKey = null; playlistSourceKey = null }
        playlistEnteringKey = null
      })
      scroller.addEventListener('wheel', stop, { passive: true })
      scroller.addEventListener('touchstart', stop, { passive: true })
      return () => {
        stop()
        scroller.removeEventListener('wheel', stop)
        scroller.removeEventListener('touchstart', stop)
      }
    })
  })

  function rememberScroll(): void { if (contentEl) scrollPositions.set(viewKey, contentEl.scrollTop) }
  function openFromCurrentView<A extends unknown[]>(callback: ((...args: A) => void) | undefined, ...args: A): void {
    rememberScroll()
    callback?.(...args)
  }
  function handleNav(view: string, extra?: number | null): void {
    if (view === 'home' || view === 'profile') view = 'library'
    if (view === activeView) {
      contentEl?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      return
    }
    rememberScroll()
    onNavigate?.(view, extra, !primaryViews.includes(view))
  }
  function handleContentScroll(): void {
    const top = contentEl?.scrollTop ?? 0
    if (top === scrollTop) return
    scrollTop = top
    if (!chromeCanHide) { showChrome(); return }
    if (top <= 8) { showChrome(); return }
    if (chromeHidden) {
      chromeScrollAnchor = Math.max(chromeScrollAnchor, top)
      if (chromeScrollAnchor - top >= 18) showChrome()
    } else {
      chromeScrollAnchor = Math.min(chromeScrollAnchor, top)
      if (top - chromeScrollAnchor >= 26) hideChrome()
    }
  }
  // 底栏上向下滑收起、向上滑唤回。
  // 触摸滚动可能让浏览器派发 pointercancel，所以终点位置要跟着 pointermove 记。
  function swipeChrome(node: HTMLElement) {
    let startY = 0
    let startX = 0
    let lastY = 0
    let lastX = 0
    let tracking = false
    const down = (event: PointerEvent) => {
      if (!event.isPrimary) return
      startY = lastY = event.clientY
      startX = lastX = event.clientX
      tracking = true
    }
    const move = (event: PointerEvent) => {
      if (!tracking || !event.isPrimary) return
      lastY = event.clientY
      lastX = event.clientX
    }
    const end = () => {
      if (!tracking) return
      tracking = false
      const dy = lastY - startY
      if (Math.abs(dy) < 28 || Math.abs(lastX - startX) > Math.abs(dy)) return
      if (!chromeCanHide) return
      if (dy > 0) hideChrome()
      else showChrome()
    }
    node.addEventListener('pointerdown', down)
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', end)
    node.addEventListener('pointercancel', end)
    return { destroy() {
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', end)
      node.removeEventListener('pointercancel', end)
    } }
  }
  function handleHapticPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' && shouldHapticTarget(event.target)) hapticTap()
  }
  $effect(() => {
    if (!rootEl) return
    rootEl.addEventListener('pointerdown', handleHapticPointerDown, { passive: true })
    return () => rootEl?.removeEventListener('pointerdown', handleHapticPointerDown)
  })
</script>

{#snippet dockTab(item: DockItem)}
  <button class="mobile-tab" class:active={selectedTab === item.id} type="button" data-view={item.id} aria-label={item.label} aria-current={selectedTab === item.id ? 'page' : undefined} onclick={() => handleNav(item.id)}>
    <span class="mobile-tab__icon"><Icon name={item.icon} size={24} strokeWidth={1.8} /></span><span class="mobile-tab__label">{item.label}</span>
  </button>
{/snippet}

<div class="mobile-app" use:mobileEdgeBack={{ enabled: () => canEdgeBack && settingsCategory(activeView) === null, onBack: () => { requestBack() } }} class:settings-view={activeView === 'settings' || settingsCategory(activeView) !== null} class:secondary={!isPrimaryView} bind:this={rootEl} use:mobileViewport>
  {#if !isPrimaryView && !coverHeaderless && !settingsCategory(activeView)}
  <header class="mobile-page-bar" class:collapsed={scrollTop > 64}>
    <button class="mobile-page-bar__button" onclick={() => (activeChrome?.back ?? onBack)?.()} aria-label="返回上一页"><Icon name="arrow-left" fill="none" size={24} /></button>
    <h1 class:mobile-playlist-label={activeView === 'playlist' || activeView === 'album' || activeView === 'recommendation'}>{activeChrome?.title || titles[activeView] || '哲听'}</h1>
    {#if pageBarActions.length}
      <div class="mobile-detail-actions">
        {#each pageBarActions as action (action.id)}
          <button type="button" aria-label={action.label} disabled={action.disabled} onclick={action.run}><Icon name={action.icon} size={24} /></button>
        {/each}
      </div>
    {/if}
  </header>
  {/if}

  <main class="mobile-page-content" id="main-content" bind:this={contentEl} onscroll={handleContentScroll} use:settingsBackGesture={{ enabled: () => settingsCategory(activeView) !== null, back: () => activeView === 'settings-dock' ? router.goBack() : router.goSettingsHome() }}>
    <div class="mobile-page-content__inner" class:primary-content={isPrimaryView || coverHeaderless}>
      {#if activeView === 'explore' || mountedViews.includes('explore')}
        <div class="mobile-shared-page mobile-route-page" data-route-key="explore" class:mobile-route-outgoing={leavingKey === 'explore'} class:playlist-source-outgoing={playlistSourceKey === 'explore'} style:display={activeView === 'explore' ? 'block' : 'none'} inert={activeView !== 'explore'} aria-hidden={activeView !== 'explore'}>
          <h1 class="mobile-large-title">{titles.explore}</h1>
          <ExplorePage mobile active={activeView === 'explore'} onOpenRecommendation={(key) => openFromCurrentView(router.goRecommendation, key)} {onOpenLogin} onSearch={() => handleNav('search')} onBannerClick={(banner) => openFromCurrentView(router.handleBannerClick, banner)}
            onOpenPlaylist={(id, push, preview) => openFromCurrentView(onOpenPlaylist, id as SongId, push, preview)}
            onOpenAlbum={(id) => openFromCurrentView(onOpenAlbum, id)} onPlaySong={router.playExploreSong as (track: unknown) => void}
            onOpenArtist={(id) => openFromCurrentView(onOpenArtist, id)} />
        </div>
      {/if}

      {#if activeView === 'library' || mountedViews.includes('library')}
        <div class="mobile-shared-page mobile-route-page" data-route-key="library" class:mobile-route-outgoing={leavingKey === 'library'} class:playlist-source-outgoing={playlistSourceKey === 'library'} style:display={activeView === 'library' ? 'block' : 'none'} inert={activeView !== 'library'} aria-hidden={activeView !== 'library'}>
          <div class="library-mobile-header">
            <h1 class="mobile-large-title">{titles.library}</h1>
          </div>
          <LibraryPage onOpenLogin={onOpenLogin}
            onOpenPlaylist={(id, push, preview) => openFromCurrentView(onOpenPlaylist, id, push, preview)} onNavigate={handleNav} />
        </div>
      {/if}

      {#if activeView === 'search' || mountedViews.includes('search')}
        <div class="mobile-shared-page mobile-route-page" data-route-key="search" class:mobile-route-outgoing={leavingKey === 'search'} class:playlist-source-outgoing={playlistSourceKey === 'search'} style:display={activeView === 'search' ? 'block' : 'none'} inert={activeView !== 'search'} aria-hidden={activeView !== 'search'}>
          <h1 class="mobile-large-title">{titles.search}</h1>
          <SearchPage active={activeView === 'search'} onOpenArtist={(id) => openFromCurrentView(onOpenArtist, id)} onOpenAlbum={(id) => openFromCurrentView(onOpenAlbum, id)}
            onOpenPlaylist={(id, push, preview) => openFromCurrentView(onOpenPlaylist, id, push, preview)} />
        </div>
      {/if}

      {#if activeView === 'settings'}
        <div class="mobile-shared-page mobile-route-page" data-route-key="settings" class:mobile-route-outgoing={leavingKey === 'settings'} class:playlist-source-outgoing={playlistSourceKey === 'settings'} style:display={activeView === 'settings' ? 'block' : 'none'} inert={activeView !== 'settings'} aria-hidden={activeView !== 'settings'}>
          <div class="settings-title-row"><h1 class="mobile-large-title">{titles.settings}</h1><button class="settings-menu-button" onclick={(event) => onOpenMenu?.(event.currentTarget)} aria-label="打开导航菜单"><Icon name="more" size={22} /></button></div>
          <SettingsPage {theme} {accentTheme} {onSetTheme} {onSetAccentTheme} onNavigate={handleNav} />
        </div>
      {/if}

      {#each detailPages as page (page.key)}
      <div class="mobile-route-page mobile-detail-page" class:playlist-sheet-page={isDetailSheetView(page.view)} data-route-key={page.key} class:mobile-route-outgoing={leavingKey === page.key} class:playlist-source-outgoing={playlistSourceKey === page.key}
        style:display={viewKey === page.key ? 'block' : 'none'} style:transform={playlistEnteringKey === page.key ? 'translate3d(0,100vh,0)' : undefined} inert={viewKey !== page.key} aria-hidden={viewKey !== page.key}>
      {#if page.view === 'dailyHistory'}
        <header class="mobile-page-bar daily-history-page-bar">
          <button class="mobile-page-bar__button" type="button" aria-label="返回上一页" onclick={() => onBack?.()}><Icon name="arrow-left" fill="none" size={24} /></button>
          <h1>{titles.dailyHistory}</h1>
        </header>
      {:else if isDetailSheetView(page.view)}
        <div class="cover-page-controls">
          <button type="button" aria-label="返回上一页" onclick={() => (activeChrome?.back ?? onBack)?.()}><Icon name="arrow-left" fill="none" size={24} /></button>
        </div>
      {/if}
      {#if settingsCategory(page.view) && viewKey === page.key}
        <SettingsPage {theme} {accentTheme} {onSetTheme} {onSetAccentTheme} category={settingsCategory(page.view)} onNavigate={handleNav} onBack={page.view === 'settings-dock' ? router.goBack : router.goSettingsHome} />
      {:else if page.view === 'about'}
        <AboutPage />
      {:else if page.view === 'liked'}
        <LikedPage {onOpenArtist} {onOpenAlbum} {onOpenLogin} />
      {:else if page.view === 'recent'}
        <RecentPage {onOpenArtist} {onOpenAlbum} />
      {:else if page.view === 'localMusic'}
        <LocalMusicPage />
      {:else if page.view === 'listeningStats'}
        <ListeningReportPage />
      {:else if page.view === 'dailyHistory'}
        <DailyHistoryPage mobile {onOpenArtist} {onOpenAlbum} />
      {:else if page.view === 'messages'}
        <MessagesPage onNavigate={handleNav} {targetUser} onUnreadChange={(count: unknown) => onUnreadChange?.(count)} />
      {:else if page.view === 'playlist' || page.view === 'album' || page.view === 'recommendation'}
        <PlaylistPage recommendation={page.view === 'recommendation'} playlistDetail={page.playlist} loading={page.loading} loadingMore={page.loadingMore}
          hasMore={page.hasMore} error={page.error} selectedId={page.id} heroColor={page.color}
          detailType={page.view === 'album' ? '专辑' : '歌单'} onBack={onBack} onPlayAll={router.playAll} onPlayTrack={router.playTrack}
          active={viewKey === page.key}
          onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onRetryLoad={router.retryDetail} onLoadMore={() => { if (viewKey === page.key) void router.loadMorePlaylist() }} />
      {:else if page.view === 'artist'}
        <ArtistPage artist={page.artist} songs={page.songs} albums={page.albums} loading={page.artistLoading}
          error={page.artistError} onBack={onBack} onPlayAll={router.playArtistAll} onPlayTrack={router.playArtistTrack}
          onOpenAlbum={onOpenAlbum} onOpenArtist={onOpenArtist} onOpenUser={onOpenUser} onToggleFollow={router.toggleArtistFollow} />
      {:else if page.view === 'user'}
        <UserProfilePage userId={page.id} onBack={onBack} {onOpenUser}
          onOpenPlaylist={(id, push, preview) => onOpenPlaylist?.(id as SongId, push, preview)} {onOpenArtist} {onOpenMessage} />
      {/if}
      </div>
      {/each}
    </div>
  </main>

  <nav class="mobile-tab-bar" class:floating={mobileDock.config.layout === 'floating'} class:icons-only={!mobileDock.config.labels}
    style:--dock-count={dockItems.length} style:--dock-active={Math.max(0, activeDockIndex)} aria-label="主导航" use:swipeChrome>
    <span class="dock-selection-track" aria-hidden="true">
      <span class="dock-selection" class:unselected={activeDockIndex < 0}></span>
    </span>
    {#each dockItems as item (item.id)}{@render dockTab(item)}{/each}
  </nav>
</div>

<style>
  .settings-view { --settings-page: #f2f2f7; --settings-group: #fff; background: var(--settings-page); }
  :global(html[data-theme="dark"]) .settings-view { --settings-page: #000; --settings-group: #1c1c1e; }
  .settings-view :global(.mobile-large-title) { border-bottom: 0; margin-bottom: 24px; font-size: 2.125rem; letter-spacing: 0; }
  .settings-view :global(.mobile-page-content__inner) { padding-inline: max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right)); }
  .settings-view.secondary :global(.mobile-page-content) { touch-action: pan-y; }
  :global(html.mobile-runtime) .primary-content { padding-top: calc(16px + env(safe-area-inset-top)); }
  .settings-title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
  .library-mobile-header { max-width: 560px; margin: 0 auto 16px; padding-block: 4px 10px; border-bottom: 1px solid var(--border); }
  .library-mobile-header :global(.mobile-large-title) { margin: 0; padding: 0; border: 0; font-size: 30px; }
  .settings-title-row :global(.mobile-large-title) { flex: 1; min-width: 0; margin: 0; padding: 0; border: 0; }
  .settings-menu-button { display: grid; place-items: center; flex: none; width: 48px; height: 48px; color: var(--accent); background: transparent; }
  .settings-menu-button :global(svg) { rotate: 90deg; }
  .cover-page-controls { position: absolute; z-index: 20; top: 16px; left: max(var(--mobile-content-gutter), env(safe-area-inset-left)); pointer-events: none; }
  .cover-page-controls button { display: grid; place-items: center; width: 48px; height: 48px; border: 0; border-radius: 50%; background: rgb(0 0 0 / .35); color: white; pointer-events: auto; }
  .settings-view :global(.mobile-page-content) { background: var(--settings-page); }

  .mobile-route-page { min-height: 100%; }
  .playlist-sheet-page { position: relative; z-index: 2; isolation: isolate; min-height: calc(var(--mobile-viewport-height, 100dvh) - var(--mobile-page-bar-height, 64px)); box-sizing: border-box; width: calc(100% + max(var(--mobile-content-gutter), env(safe-area-inset-left)) + max(var(--mobile-content-gutter), env(safe-area-inset-right))); margin: -16px calc(-1 * max(var(--mobile-content-gutter), env(safe-area-inset-right))) 0 calc(-1 * max(var(--mobile-content-gutter), env(safe-area-inset-left))); padding: 16px max(var(--mobile-content-gutter), env(safe-area-inset-right)) 0 max(var(--mobile-content-gutter), env(safe-area-inset-left)); border-radius: var(--radius-xl) var(--radius-xl) 0 0; overflow: clip; background: var(--bg); }
  .playlist-sheet-page.mobile-route-outgoing { z-index: 3; margin: 0; }
  .playlist-sheet-page .daily-history-page-bar { padding-inline: 0; }
  .mobile-route-outgoing { display: block !important; position: fixed; top: var(--route-outgoing-top, 0px); left: var(--route-outgoing-left, 0px); width: var(--route-outgoing-width, 100%); right: auto; z-index: 1; pointer-events: none; }
  :global(html.mobile-runtime) .mobile-shared-page.mobile-route-outgoing { width: var(--route-outgoing-width, 100%); }
  .mobile-route-outgoing.playlist-source-outgoing { z-index: 0; clip-path: inset(var(--route-outgoing-clip-top, 0px) 0 0); }
  .mobile-route-outgoing :global(*) { pointer-events: none !important; }

  :global(html.mobile-runtime) .mobile-tab-bar:not(.floating) { grid-template-columns: repeat(var(--dock-count), minmax(0, 1fr)); }
  :global(html.mobile-runtime) .mobile-tab-bar.icons-only .mobile-tab__label { display: none; }
  .dock-selection-track { position: absolute; inset: 0 env(safe-area-inset-right) var(--app-bottom-inset) env(safe-area-inset-left); pointer-events: none; }
  .dock-selection {
    display: grid; justify-items: center; width: calc(100% / var(--dock-count)); height: 100%;
    transform: translateX(calc(var(--dock-active) * 100%));
    transition: transform 320ms cubic-bezier(.22, .72, .24, 1), opacity 160ms ease;
  }
  .dock-selection.unselected { opacity: 0; }
  .dock-selection::before { content: ''; width: 24px; height: 3px; margin-top: 3px; border-radius: 999px; background: var(--md-primary); }
  .mobile-tab-bar > .mobile-tab { position: relative; z-index: 1; }
  :global(html.mobile-runtime) .mobile-tab-bar.floating {
    --floating-dock-pad-inline: 4px;
    width: auto; height: var(--mobile-floating-height); display: flex; align-items: center; gap: 0; padding: 4px var(--floating-dock-pad-inline);
    border: 1px solid var(--border); border-radius: 999px; background: var(--bg-surface);
    background: color-mix(in srgb, var(--bg-surface) 94%, transparent);
    box-shadow: 0 4px 18px rgb(0 0 0 / .14); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
    touch-action: none;
  }
  :global(html.mobile-runtime) .mobile-tab-bar.floating .mobile-tab { flex: 1 1 0; min-width: 44px; height: 50px; gap: 2px; border-radius: 999px; }
  .mobile-tab-bar.floating .dock-selection-track { inset: 4px var(--floating-dock-pad-inline); }
  .mobile-tab-bar.floating .dock-selection::before { width: 100%; height: 100%; margin-top: 0; background: var(--md-primary-container); }
  :global(html.mobile-runtime) .mobile-tab-bar.floating .mobile-tab__icon { transform: none; }
  :global(html.mobile-runtime) .mobile-tab-bar.floating .mobile-tab__label { font-size: 10px; }
  @media (orientation: landscape) and (max-height: 720px) {
    :global(html.mobile-runtime) .mobile-tab-bar:not(.floating) { grid-template-columns: 1fr; grid-template-rows: repeat(var(--dock-count), minmax(48px, 1fr)); }
    .mobile-tab-bar:not(.floating) .dock-selection-track { inset: 0 0 var(--app-bottom-inset) env(safe-area-inset-left); }
    .mobile-tab-bar:not(.floating) .dock-selection { width: 100%; height: calc(100% / var(--dock-count)); transform: translateY(calc(var(--dock-active) * 100%)); align-items: center; justify-items: start; }
    .mobile-tab-bar:not(.floating) .dock-selection::before { width: 3px; height: 24px; margin: 0 0 0 3px; }
    :global(html.mobile-runtime.mobile-floating-dock) { --mobile-landscape-rail: 0px; }
    :global(html.mobile-runtime.mobile-floating-dock) .mobile-app { padding-left: 0; }
  }
  @media (max-width: 360px) {
    :global(html.mobile-runtime) .mobile-tab-bar.floating { --floating-dock-pad-inline: 2px; }
  }
  @media (prefers-reduced-motion: reduce) { .dock-selection { transition: none; } }
  @media (prefers-reduced-transparency: reduce) { :global(html.mobile-runtime) .mobile-tab-bar.floating { background: var(--bg-surface); backdrop-filter: none; -webkit-backdrop-filter: none; } }
</style>
