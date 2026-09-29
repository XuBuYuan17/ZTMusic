<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { mobileViewport } from '../app/mobile-interaction.ts'
  import type { SongId } from '../types/music.ts'
  import { hapticTap, shouldHapticTarget } from '../utils/haptics.ts'
  import { router } from '../stores/router.svelte.ts'
  import Icon from './ui/Icon.svelte'

  import HomePage from '../pages/pc/Home.svelte'
  import ExplorePage from '../pages/pc/Explore.svelte'
  import LibraryPage from '../pages/pc/Library.svelte'
  import SettingsPage from '../pages/pc/Settings.svelte'
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
    targetUser = null, onUnreadChange,
  }: {
    activeView?: string
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

  const primaryViews = ['home', 'explore', 'library']
  const isPrimaryView = $derived(primaryViews.includes(activeView))
  const titles: Record<string, string> = {
    home: '主页', explore: '发现', library: '我的收藏', search: '搜索', settings: '设置',
    about: '关于哲听', liked: '喜欢的音乐', recent: '最近播放', dailyHistory: '历史日推',
    messages: '提醒', localMusic: '本地音乐', listeningStats: '听歌统计', playlist: '歌单',
    album: '专辑', artist: '歌手', user: '个人主页',
  }
  let mountedViews = $state<string[]>([])
  let contentEl = $state<HTMLElement | null>(null)
  let rootEl = $state<HTMLElement | null>(null)
  let previousKey: string | null = null
  const scrollPositions = new Map<string, number>()
  const viewKey = $derived(`${activeView}:${router.selectedId ?? ''}:${router.routeStack.length}`)

  $effect(() => {
    const view = activeView
    if ((primaryViews.includes(view) || view === 'search') && !mountedViews.includes(view)) mountedViews = [...mountedViews, view]
  })

  $effect.pre(() => {
    const key = viewKey
    const scroller = contentEl
    return untrack(() => {
      if (!scroller || key === previousKey) return
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
        if (scroller.firstElementChild) observer.observe(scroller.firstElementChild)
        scroller.scrollTop = position
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
  <header class="mobile-page-bar">
    {#if isPrimaryView}
      <button class="mobile-page-bar__button" onclick={(event) => onOpenMenu?.(event.currentTarget)} aria-label="打开导航菜单"><Icon name="menu" size={22} /></button>
    {:else}
      <button class="mobile-page-bar__button" onclick={() => onBack?.()} aria-label="返回上一页"><Icon name="arrow-left" size={22} /></button>
    {/if}
    <h1>{titles[activeView] || '哲听'}</h1>
  </header>

  <main class="mobile-page-content" id="main-content" bind:this={contentEl}>
    <div class="mobile-page-content__inner">
      {#if activeView === 'home' || mountedViews.includes('home')}
        <div class="mobile-shared-page" style:display={activeView === 'home' ? 'block' : 'none'} inert={activeView !== 'home'} aria-hidden={activeView !== 'home'}>
          <HomePage onNavigate={handleNav} onOpenLogin={onOpenLogin}
            onOpenPlaylist={(id, push, preview) => openFromCurrentView(onOpenPlaylist, id as SongId, push, preview)}
            onOpenArtist={(id) => openFromCurrentView(onOpenArtist, id)} onOpenAlbum={(id) => openFromCurrentView(onOpenAlbum, id)}
            onOpenUser={(id) => openFromCurrentView(onOpenUser, id)} />
        </div>
      {/if}

      {#if activeView === 'explore' || mountedViews.includes('explore')}
        <div class="mobile-shared-page" style:display={activeView === 'explore' ? 'block' : 'none'} inert={activeView !== 'explore'} aria-hidden={activeView !== 'explore'}>
          <ExplorePage onSearch={() => handleNav('search')} onBannerClick={(banner) => openFromCurrentView(router.handleBannerClick, banner)}
            onOpenPlaylist={(id, push, preview) => openFromCurrentView(onOpenPlaylist, id as SongId, push, preview)}
            onOpenAlbum={(id) => openFromCurrentView(onOpenAlbum, id)} onPlaySong={router.playExploreSong as (track: unknown) => void}
            onOpenArtist={(id) => openFromCurrentView(onOpenArtist, id)} />
        </div>
      {/if}

      {#if activeView === 'library' || mountedViews.includes('library')}
        <div class="mobile-shared-page" style:display={activeView === 'library' ? 'block' : 'none'} inert={activeView !== 'library'} aria-hidden={activeView !== 'library'}>
          <LibraryPage onOpenLogin={onOpenLogin}
            onOpenPlaylist={(id, push, preview) => openFromCurrentView(onOpenPlaylist, id, push, preview)} onNavigate={handleNav} />
        </div>
      {/if}

      {#if activeView === 'search' || mountedViews.includes('search')}
        <div class="mobile-shared-page" style:display={activeView === 'search' ? 'block' : 'none'} inert={activeView !== 'search'} aria-hidden={activeView !== 'search'}>
          <SearchPage onOpenArtist={(id) => openFromCurrentView(onOpenArtist, id)} onOpenAlbum={(id) => openFromCurrentView(onOpenAlbum, id)}
            onOpenPlaylist={(id, push, preview) => openFromCurrentView(onOpenPlaylist, id, push, preview)} />
        </div>
      {/if}

      {#if activeView === 'settings'}
        <SettingsPage {theme} {accentTheme} {onSetTheme} {onSetAccentTheme} />
      {:else if activeView === 'about'}
        <AboutPage />
      {:else if activeView === 'liked'}
        <LikedPage {onOpenArtist} {onOpenAlbum} {onOpenLogin} />
      {:else if activeView === 'recent'}
        <RecentPage {onOpenArtist} {onOpenAlbum} />
      {:else if activeView === 'localMusic'}
        <LocalMusicPage />
      {:else if activeView === 'listeningStats'}
        <ListeningReportPage />
      {:else if activeView === 'dailyHistory'}
        <DailyHistoryPage {onOpenArtist} {onOpenAlbum} />
      {:else if activeView === 'messages'}
        <MessagesPage onNavigate={handleNav} {targetUser} onUnreadChange={(count: unknown) => onUnreadChange?.(count)} />
      {:else if activeView === 'playlist' || activeView === 'album'}
        <PlaylistPage playlistDetail={router.playlistDetail} loading={router.playlistDetailLoading} loadingMore={router.playlistLoadingMore}
          hasMore={router.playlistHasMore} error={router.playlistDetailError} selectedId={router.selectedId} heroColor={router.heroColor}
          detailType={activeView === 'album' ? '专辑' : '歌单'} onBack={onBack} onPlayAll={router.playAll} onPlayTrack={router.playTrack}
          onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onLoadMore={router.loadMorePlaylist} />
      {:else if activeView === 'artist'}
        <ArtistPage artist={router.artistDetail} songs={router.artistSongs} albums={router.artistAlbums} loading={router.artistLoading}
          error={router.artistError} onBack={onBack} onPlayAll={router.playArtistAll} onPlayTrack={router.playArtistTrack}
          onOpenAlbum={onOpenAlbum} onOpenArtist={onOpenArtist} onOpenUser={onOpenUser} onToggleFollow={router.toggleArtistFollow} />
      {:else if activeView === 'user'}
        <UserProfilePage userId={router.selectedId} onBack={onBack} {onOpenUser}
          onOpenPlaylist={(id, push, preview) => onOpenPlaylist?.(id as SongId, push, preview)} {onOpenArtist} {onOpenMessage} />
      {/if}
    </div>
  </main>
</div>
