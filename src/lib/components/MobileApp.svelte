<script lang="ts">
  import { tick, untrack, onDestroy, onMount } from 'svelte'
  import { announceAndroidFrame } from '../app/android-startup.ts'
  onMount(() => { announceAndroidFrame(); onReady?.() })
  import { reducedMotion } from '../app/desktop-motion.ts'
  import { createMobileNavigationMotion, mobileNavigationKind } from '../app/mobile-navigation-motion.ts'
  import { mobileViewport } from '../app/mobile-interaction.ts'
  import type { SongId } from '../types/music.ts'
  import { hapticTap, shouldHapticTarget } from '../utils/haptics.ts'
  import { router } from '../stores/router.svelte.ts'
  import Icon from './ui/Icon.svelte'

  import ExplorePage from '../pages/pc/Explore.svelte'
  import LibraryPage from '../pages/pc/Library.svelte'
  import SettingsPage from '../pages/mobile/Settings.svelte'
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

  $effect(() => { if (activeView === 'home' || activeView === 'profile') onNavigate?.('library') })

  const primaryViews = ['explore', 'search', 'library', 'settings']
  let selectedTab = $state([...router.routeStack].map(route => route.view === 'home' ? 'library' : route.view).reverse().find(view => primaryViews.includes(view)) ?? 'explore')
  let scrollTop = $state(0)
  $effect(() => { if (primaryViews.includes(activeView)) selectedTab = activeView })
  const isPrimaryView = $derived(primaryViews.includes(activeView))
  const titles: Record<string, string> = {
    home: '资料库', explore: '发现', library: '资料库', search: '搜索', settings: '设置',
    about: '关于哲听', liked: '喜欢的音乐', recent: '最近播放', dailyHistory: '历史日推', recommendation: '歌单',
    messages: '提醒', localMusic: '本地音乐', listeningStats: '听歌统计', playlist: '歌单',
    album: '专辑', artist: '歌手', user: '个人主页',
  }
  let mountedViews = $state<string[]>([])
  let contentEl = $state<HTMLElement | null>(null)
  let rootEl = $state<HTMLElement | null>(null)
  let previousKey: string | null = null
  const scrollPositions = new Map<string, number>()
  const viewKey = $derived(primaryViews.includes(activeView) || activeView === 'search' ? activeView : `${activeView}:${router.selectedId ?? ''}:${router.routeStack.length}`)
  type DetailPage = {
    key: string; view: string; id: typeof router.selectedId
    playlist: typeof router.playlistDetail; loading: boolean; loadingMore: boolean; hasMore: boolean; error: string; color: string
    artist: typeof router.artistDetail; songs: typeof router.artistSongs; albums: typeof router.artistAlbums; artistLoading: boolean; artistError: string
  }
  let detailPages = $state<DetailPage[]>([])
  let leavingKey = $state<string | null>(null)
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
      const coverSnapshot = navigationMotion.capture(oldPage)
      navigationMotion.cancel()
      const kind = mobileNavigationKind(router.routeTransition, primaryViews.includes(activeView) || activeView === 'search')
      const sharedCover = Boolean(coverSnapshot.origin)
      const coverDetail = activeView === 'playlist' || activeView === 'album' || activeView === 'recommendation' || Boolean(oldPage?.querySelector('.playlist-detail-page'))
      leavingKey = oldPage && !reducedMotion() ? oldKey : null
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
        const page = [...scroller.querySelectorAll<HTMLElement>('[data-route-key]')].find(node => node.dataset.routeKey === key)
        if (page) observer.observe(page)
        if (oldPage && oldBox) {
          oldPage.style.setProperty('--route-outgoing-top', `${oldBox.top}px`)
          oldPage.style.setProperty('--route-outgoing-left', `${oldBox.left}px`)
          oldPage.style.setProperty('--route-outgoing-width', `${oldBox.width}px`)
        }
        if (page && oldKey) navigationMotion.play(page, oldPage, kind, sharedCover, coverDetail, reducedMotion(), () => { leavingKey = null }, coverSnapshot)
        else leavingKey = null
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

  function detailAction(action: 'playlist-share' | 'playlist-more') {
    contentEl?.querySelector('.mobile-route-page:not([inert]) .playlist-detail-hero')?.dispatchEvent(new Event(action))
  }

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
  function handleHapticPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' && shouldHapticTarget(event.target)) hapticTap()
  }
  $effect(() => {
    if (!rootEl) return
    rootEl.addEventListener('pointerdown', handleHapticPointerDown, { passive: true })
    return () => rootEl?.removeEventListener('pointerdown', handleHapticPointerDown)
  })
</script>

<div class="mobile-app" class:secondary={!isPrimaryView} bind:this={rootEl} use:mobileViewport>
  <header class="mobile-page-bar" class:primary={isPrimaryView} class:collapsed={scrollTop > 64}>
    {#if isPrimaryView}
      <button class="mobile-page-bar__button" onclick={(event) => onOpenMenu?.(event.currentTarget)} aria-label="打开导航菜单"><Icon name="more" size={22} /></button>
    {:else}
      <button class="mobile-page-bar__button" onclick={() => onBack?.()} aria-label="返回上一页"><Icon name="arrow-left" size={22} /></button>
    {/if}
    {#if isPrimaryView}<span class="mobile-compact-title" aria-hidden="true">{titles[activeView]}</span>
    {:else}<h1 class:mobile-playlist-label={activeView === 'playlist' || activeView === 'album' || activeView === 'recommendation'}>{titles[activeView] || '哲听'}</h1>{/if}
    {#if activeView === 'playlist' || activeView === 'album' || activeView === 'recommendation'}
      <div class="mobile-detail-actions">{#if activeView !== 'recommendation'}<button type="button" aria-label="分享歌单" disabled={!router.playlistDetail} onclick={() => detailAction('playlist-share')}><Icon name="share" size={24} /></button>{/if}<button type="button" aria-label="更多歌单操作" disabled={!router.playlistDetail} onclick={() => detailAction('playlist-more')}><Icon name="more" size={24} /></button></div>
    {/if}
  </header>

  <main class="mobile-page-content" id="main-content" bind:this={contentEl} onscroll={() => { scrollTop = contentEl?.scrollTop ?? 0 }}>
    <div class="mobile-page-content__inner">
      {#if isPrimaryView}<h1 class="mobile-large-title">{titles[activeView]}</h1>{/if}
      {#if activeView === 'explore' || mountedViews.includes('explore')}
        <div class="mobile-shared-page mobile-route-page" data-route-key="explore" class:mobile-route-outgoing={leavingKey === 'explore'} style:display={activeView === 'explore' ? 'block' : 'none'} inert={activeView !== 'explore'} aria-hidden={activeView !== 'explore'}>
          <ExplorePage mobile active={activeView === 'explore'} onOpenRecommendation={(key) => openFromCurrentView(router.goRecommendation, key)} {onOpenLogin} onSearch={() => handleNav('search')} onBannerClick={(banner) => openFromCurrentView(router.handleBannerClick, banner)}
            onOpenPlaylist={(id, push, preview) => openFromCurrentView(onOpenPlaylist, id as SongId, push, preview)}
            onOpenAlbum={(id) => openFromCurrentView(onOpenAlbum, id)} onPlaySong={router.playExploreSong as (track: unknown) => void}
            onOpenArtist={(id) => openFromCurrentView(onOpenArtist, id)} />
        </div>
      {/if}

      {#if activeView === 'library' || mountedViews.includes('library')}
        <div class="mobile-shared-page mobile-route-page" data-route-key="library" class:mobile-route-outgoing={leavingKey === 'library'} style:display={activeView === 'library' ? 'block' : 'none'} inert={activeView !== 'library'} aria-hidden={activeView !== 'library'}>
          <LibraryPage onOpenLogin={onOpenLogin}
            onOpenPlaylist={(id, push, preview) => openFromCurrentView(onOpenPlaylist, id, push, preview)} onNavigate={handleNav} />
        </div>
      {/if}

      {#if activeView === 'search' || mountedViews.includes('search')}
        <div class="mobile-shared-page mobile-route-page" data-route-key="search" class:mobile-route-outgoing={leavingKey === 'search'} style:display={activeView === 'search' ? 'block' : 'none'} inert={activeView !== 'search'} aria-hidden={activeView !== 'search'}>
          <SearchPage onOpenArtist={(id) => openFromCurrentView(onOpenArtist, id)} onOpenAlbum={(id) => openFromCurrentView(onOpenAlbum, id)}
            onOpenPlaylist={(id, push, preview) => openFromCurrentView(onOpenPlaylist, id, push, preview)} />
        </div>
      {/if}

      {#if activeView === 'settings' || mountedViews.includes('settings')}
        <div class="mobile-shared-page mobile-route-page" data-route-key="settings" class:mobile-route-outgoing={leavingKey === 'settings'} style:display={activeView === 'settings' ? 'block' : 'none'} inert={activeView !== 'settings'} aria-hidden={activeView !== 'settings'}>
          <SettingsPage {theme} {accentTheme} {onSetTheme} {onSetAccentTheme} />
        </div>
      {/if}

      {#each detailPages as page (page.key)}
      <div class="mobile-route-page mobile-detail-page" data-route-key={page.key} class:mobile-route-outgoing={leavingKey === page.key}
        style:display={viewKey === page.key ? 'block' : 'none'} inert={viewKey !== page.key} aria-hidden={viewKey !== page.key}>
      {#if page.view === 'settings'}
        <SettingsPage {theme} {accentTheme} {onSetTheme} {onSetAccentTheme} />
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
        <DailyHistoryPage {onOpenArtist} {onOpenAlbum} />
      {:else if page.view === 'messages'}
        <MessagesPage onNavigate={handleNav} {targetUser} onUnreadChange={(count: unknown) => onUnreadChange?.(count)} />
      {:else if page.view === 'playlist' || page.view === 'album' || page.view === 'recommendation'}
        <PlaylistPage recommendation={page.view === 'recommendation'} playlistDetail={page.playlist} loading={page.loading} loadingMore={page.loadingMore}
          hasMore={page.hasMore} error={page.error} selectedId={page.id} heroColor={page.color}
          detailType={page.view === 'album' ? '专辑' : '歌单'} onBack={onBack} onPlayAll={router.playAll} onPlayTrack={router.playTrack}
          onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onLoadMore={() => { if (viewKey === page.key) void router.loadMorePlaylist() }} />
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

  <nav class="mobile-tab-bar" aria-label="主导航">
    {#each [{ view: 'explore', label: '发现', icon: 'compass' }, { view: 'search', label: '搜索', icon: 'search' }, { view: 'library', label: '资料库', icon: 'music' }, { view: 'settings', label: '设置', icon: 'settings' }] as tab}
      <button class="mobile-tab" class:active={selectedTab === tab.view} data-view={tab.view} aria-current={selectedTab === tab.view ? 'page' : undefined} onclick={() => handleNav(tab.view)}>
        <span class="mobile-tab__icon"><Icon name={tab.icon} size={24} strokeWidth={1.8} /></span>
        <span class="mobile-tab__label">{tab.label}</span>
      </button>
    {/each}
  </nav>
</div>

<style>
  .mobile-route-page { min-height: 100%; }
  .mobile-route-outgoing { display: block !important; position: fixed; top: var(--route-outgoing-top, 0px); left: var(--route-outgoing-left, 0px); width: var(--route-outgoing-width, 100%); right: auto; z-index: 1; pointer-events: none; }
  .mobile-route-outgoing :global(*) { pointer-events: none !important; }
</style>
