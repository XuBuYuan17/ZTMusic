<script>
  import { tick } from 'svelte'
  import { player } from '../stores/player.svelte.js'
  import { auth } from '../stores/auth.svelte.js'
  import { coverUrl } from '../utils/image.js'
  import Icon from './ui/Icon.svelte'
  import Sidebar from './Sidebar.svelte'

  import MobileHome from '../pages/mobile/Home.svelte'
  import MobileBrowse from '../pages/mobile/Browse.svelte'
  import MobileLibrary from '../pages/mobile/Library.svelte'
  import MobileSettings from '../pages/mobile/Settings.svelte'
  import PlaylistPage from '../pages/PlaylistPage.svelte'
  import SearchPage from '../pages/SearchPage.svelte'
  import ArtistPage from '../pages/ArtistPage.svelte'
  import LikedPage from '../pages/pc/Liked.svelte'
  import RecentPage from '../pages/pc/Recent.svelte'
  import DailyHistoryPage from '../pages/pc/DailyHistory.svelte'
  import MessagesPage from '../pages/pc/Messages.svelte'
  import { router } from '../stores/router.svelte.js'

  let {
    activeView = 'explore',
    theme = 'dark',
    drawerOpen = $bindable(false),
    onNavigate,
    onOpenPlayer,
    onOpenPlaylist,
    onOpenAlbum,
    onOpenArtist,
    onSearch,
    onOpenLogin,
    onSetTheme,
    onBack,
    onTabsHiddenChange,
    targetUser = null,
    onUnreadChange,
    notificationUnread = 0,
  } = $props()

  const tabViews = ['home', 'explore', 'library']
  const isTabView = $derived(tabViews.includes(activeView))
  const isDetailView = $derived(['playlist', 'album', 'artist', 'search', 'messages'].includes(activeView))

  let tabsHidden = $state(false)
  let mountedTabs = $state([])
  let lastScrollTop = $state(0)
  let touchStartY = $state(0)
  let contentEl = $state(null)
  let previousView = $state(null)
  const tabScrollPositions = new Map()

  $effect(() => {
    if (isTabView && !mountedTabs.includes(activeView)) {
      mountedTabs = [...mountedTabs, activeView]
    }
  })

  $effect(() => {
    const nextView = activeView
    const el = contentEl
    if (!el || nextView === previousView) return
    if (previousView === null) {
      previousView = nextView
      lastScrollTop = el.scrollTop
      return
    }
    if (tabViews.includes(previousView)) tabScrollPositions.set(previousView, el.scrollTop)
    const nextScrollTop = tabViews.includes(nextView) ? (tabScrollPositions.get(nextView) || 0) : 0
    previousView = nextView
    setTabsHidden(false)
    tick().then(() => {
      if (!contentEl || activeView !== nextView) return
      contentEl.scrollTop = nextScrollTop
      lastScrollTop = nextScrollTop
    })
  })

  function setTabsHidden(hidden) {
    if (tabsHidden === hidden) return
    tabsHidden = hidden
    onTabsHiddenChange?.(tabsHidden)
  }

  function handleTouchStart(e) {
    touchStartY = e.touches?.[0]?.clientY ?? 0
  }

  function handleTouchMove(e) {
    if (!contentEl || isDetailView) return
    const y = e.touches?.[0]?.clientY ?? 0
    const delta = touchStartY - y
    if (Math.abs(delta) < 6) return
    if (delta > 0 && contentEl.scrollTop > 20) setTabsHidden(true)
    else if (delta < 0) setTabsHidden(false)
    touchStartY = y
  }

  $effect(() => {
    if (isDetailView) return
    const el = contentEl ?? document.querySelector('.m-content')
    if (!el) return
    const onScroll = () => {
      const st = el.scrollTop
      const delta = st - lastScrollTop
      if (Math.abs(delta) < 6) return
      if (delta > 0 && st > 20) setTabsHidden(true)
      else if (delta < 0) setTabsHidden(false)
      lastScrollTop = st
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  })

  function toggleDrawer() { drawerOpen = !drawerOpen }
  function closeDrawer() { drawerOpen = false }

  function rememberCurrentTabScroll() {
    if (contentEl && tabViews.includes(activeView)) {
      tabScrollPositions.set(activeView, contentEl.scrollTop)
    }
  }

  function openFromCurrentTab(callback, ...args) {
    rememberCurrentTabScroll()
    callback?.(...args)
  }

  function handleNav(view, extra) {
    rememberCurrentTabScroll()
    closeDrawer()
    onNavigate?.(view, extra)
  }

  function handleToggleTheme() {
    onSetTheme?.(theme === 'dark' ? 'light' : 'dark')
  }

  // 点击遮罩关闭
  function onBackdropClick(e) {
    if (e.target === e.currentTarget) closeDrawer()
  }

  // ESC 关闭抽屉
  $effect(() => {
    if (typeof window === 'undefined') return
    if (!drawerOpen) return
    const onKey = (e) => { if (e.key === 'Escape') closeDrawer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

<div class="mobile-app" class:drawer-open={drawerOpen} class:tabs-hidden={tabsHidden}>
  <!-- 左上角头像按钮 -->
  <button class="m-avatar-btn" type="button" onclick={toggleDrawer} aria-label="打开侧栏">
    {#if auth.isLoggedIn && auth.user?.avatarUrl}
      <img src={`${coverUrl(auth.user.avatarUrl, 96)}&_=${router.refreshKey}`} alt="" referrerpolicy="no-referrer" />
    {:else}
      <Icon name="user" size={22} strokeWidth={1.8} />
    {/if}
  </button>



  <!-- 主内容区 -->
  <main
    class="m-content"
    class:m-content-detail={isDetailView}
    bind:this={contentEl}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
  >
    <div class="m-view-fade">
      <!-- 三个主标签首次访问后常驻；其他页面只在活跃时挂载。 -->
      {#if activeView === 'home' || mountedTabs.includes('home')}
        <div style:display={activeView === 'home' ? 'block' : 'none'} inert={activeView !== 'home'} aria-hidden={activeView !== 'home'}>
          <MobileHome
            onOpenPlaylist={(id) => openFromCurrentTab(onOpenPlaylist, id)}
            onOpenAlbum={(id) => openFromCurrentTab(onOpenAlbum, id)}
            onOpenArtist={(id) => openFromCurrentTab(onOpenArtist, id)}
            onOpenLogin={() => onOpenLogin?.()}
            onNavigate={handleNav}
            onSearch={() => onSearch?.()}
          />
        </div>
      {/if}

      {#if activeView === 'explore' || mountedTabs.includes('explore')}
        <div style:display={activeView === 'explore' ? 'block' : 'none'} inert={activeView !== 'explore'} aria-hidden={activeView !== 'explore'}>
          <MobileBrowse
            onOpenPlaylist={(id) => openFromCurrentTab(onOpenPlaylist, id)}
            onOpenAlbum={(id) => openFromCurrentTab(onOpenAlbum, id)}
            onOpenArtist={(id) => openFromCurrentTab(onOpenArtist, id)}
            onPlaySong={router.playExploreSong}
            onBannerClick={(banner) => openFromCurrentTab(router.handleBannerClick, banner)}
            onSearch={() => onSearch?.()}
          />
        </div>
      {/if}

      {#if activeView === 'library' || mountedTabs.includes('library')}
        <div style:display={activeView === 'library' ? 'block' : 'none'} inert={activeView !== 'library'} aria-hidden={activeView !== 'library'}>
          <MobileLibrary
            onOpenPlaylist={(id) => openFromCurrentTab(onOpenPlaylist, id)}
            onOpenLogin={() => onOpenLogin?.()}
            onNavigate={handleNav}
            onOpenArtist={(id) => openFromCurrentTab(onOpenArtist, id)}
            onOpenAlbum={(id) => openFromCurrentTab(onOpenAlbum, id)}
          />
        </div>
      {/if}

      {#if activeView === 'settings'}
        <MobileSettings {theme} onSetTheme={onSetTheme} />
      {:else if activeView === 'liked'}
        <div class="m-subpage m-subpage-enter">
          <LikedPage {onOpenArtist} {onOpenAlbum} onPlayAll={router.playAll} onPlayTrack={router.playTrack} />
        </div>
      {:else if activeView === 'recent'}
        <div class="m-subpage m-subpage-enter">
          <RecentPage {onOpenArtist} {onOpenAlbum} />
        </div>
      {:else if activeView === 'dailyHistory'}
        <div class="m-subpage m-subpage-enter">
          <DailyHistoryPage {onOpenArtist} {onOpenAlbum} />
        </div>
      {:else if activeView === 'messages'}
        <div class="m-subpage m-subpage-enter">
          <MessagesPage onNavigate={handleNav} {targetUser} onUnreadChange={(count) => onUnreadChange?.(count)} />
        </div>
      {:else if activeView === 'playlist' || activeView === 'album'}
        <PlaylistPage
          playlistDetail={router.playlistDetail}
          loading={router.playlistDetailLoading}
          loadingMore={router.playlistLoadingMore}
          error={router.playlistDetailError}
          selectedId={router.selectedId}
          heroColor={router.heroColor}
          detailType={activeView === 'album' ? '专辑' : '歌单'}
          onBack={onBack}
          onPlayAll={router.playAll}
          onPlayTrack={router.playTrack}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
        />
      {:else if activeView === 'search'}
        <SearchPage onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onOpenPlaylist={onOpenPlaylist} />
      {:else if activeView === 'artist'}
        <ArtistPage
          artist={router.artistDetail}
          songs={router.artistSongs}
          albums={router.artistAlbums}
          loading={router.artistLoading}
          error={router.artistError}
          onBack={onBack}
          onPlayAll={router.playArtistAll}
          onPlayTrack={router.playArtistTrack}
          onOpenAlbum={onOpenAlbum}
          onOpenArtist={onOpenArtist}
          onToggleFollow={router.toggleArtistFollow}
        />
      {/if}
    </div>
  </main>

  <!-- 底部主导航 -->
  {#if !isDetailView}
    <nav class="m-tabs" aria-label="主导航">
      <button class="m-tab" class:active={activeView === 'home'} aria-current={activeView === 'home' ? 'page' : undefined} onclick={() => handleNav('home')}>
        <Icon name="home" size={24} />
        <span>首页</span>
      </button>
      <button class="m-tab" class:active={activeView === 'explore'} aria-current={activeView === 'explore' ? 'page' : undefined} onclick={() => handleNav('explore')}>
        <Icon name="compass" size={24} />
        <span>发现</span>
      </button>
      <button class="m-tab" class:active={activeView === 'library'} aria-current={activeView === 'library' ? 'page' : undefined} onclick={() => handleNav('library')}>
        <Icon name="liked" size={24} />
        <span>歌单</span>
      </button>
      <button class="m-tab" class:active={activeView === 'search'} aria-current={activeView === 'search' ? 'page' : undefined} onclick={() => onSearch?.()}>
        <Icon name="search" size={24} />
        <span>搜索</span>
      </button>
    </nav>
  {/if}

  <!-- 抽屉遮罩 -->
  {#if drawerOpen}
    <div class="m-drawer-backdrop" onclick={onBackdropClick} role="presentation"></div>
  {/if}

  <!-- 抽屉侧栏 -->
  <aside class="m-drawer" class:open={drawerOpen} aria-label="侧边导航" aria-hidden={!drawerOpen} inert={!drawerOpen}>
    <Sidebar
      activeView={activeView}
      collapsed={false}
      {theme}
      refreshKey={router.refreshKey}
      {notificationUnread}
      inDrawer={true}
      onNavigate={handleNav}
      onToggleTheme={handleToggleTheme}
      onOpenLogin={() => { closeDrawer(); onOpenLogin?.() }}
    />
  </aside>
</div>
