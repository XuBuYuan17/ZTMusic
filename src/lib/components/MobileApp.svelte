<script>
  import { player } from '../stores/player.svelte.js'
  import { auth } from '../stores/auth.svelte.js'
  import { coverUrl } from '../utils/image.js'
  import Icon from './ui/Icon.svelte'
  import Sidebar from './Sidebar.svelte'

  import MobileHome from '../pages/pc/Home.svelte'
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
  let lastScrollTop = $state(0)
  let touchStartY = $state(0)
  let contentEl = $state(null)

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
    if (isDetailView) setTabsHidden(true)
    else if (contentEl) {
      const st = contentEl.scrollTop
      lastScrollTop = st
      if (st <= 20) setTabsHidden(false)
    }
  })

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

  function handleNav(view, extra) {
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
      <!-- 所有页面常驻 DOM，用 display:none 隐藏非活跃页面，避免切换时重建 + 重复加载 -->
      <div style:display={activeView === 'home' ? 'block' : 'none'}>
        <MobileHome
          onOpenPlaylist={(id) => onOpenPlaylist?.(id)}
          onOpenAlbum={(id) => onOpenAlbum?.(id)}
          onOpenArtist={(id) => onOpenArtist?.(id)}
          onOpenLogin={() => onOpenLogin?.()}
          onNavigate={onNavigate}
        />
      </div>

      <div style:display={activeView === 'explore' ? 'block' : 'none'}>
        <MobileBrowse
          onOpenPlaylist={(id) => onOpenPlaylist?.(id)}
          onOpenAlbum={(id) => onOpenAlbum?.(id)}
          onOpenArtist={(id) => onOpenArtist?.(id)}
          onPlaySong={router.playExploreSong}
          onBannerClick={router.handleBannerClick}
          onSearch={() => onSearch?.()}
        />
      </div>

      <div style:display={activeView === 'library' ? 'block' : 'none'}>
        <MobileLibrary
          onOpenPlaylist={(id) => onOpenPlaylist?.(id)}
          onOpenLogin={() => onOpenLogin?.()}
          onNavigate={onNavigate}
          {onOpenArtist}
          {onOpenAlbum}
        />
      </div>

      <div style:display={activeView === 'settings' ? 'block' : 'none'}>
        <MobileSettings {theme} onSetTheme={onSetTheme} />
      </div>

      <div style:display={activeView === 'liked' ? 'block' : 'none'}>
        <div class="m-subpage m-subpage-enter">
          <LikedPage {onOpenArtist} {onOpenAlbum} onPlayAll={router.playAll} onPlayTrack={router.playTrack} />
        </div>
      </div>

      <div style:display={activeView === 'recent' ? 'block' : 'none'}>
        <div class="m-subpage m-subpage-enter">
          <RecentPage {onOpenArtist} {onOpenAlbum} />
        </div>
      </div>

      <div style:display={activeView === 'dailyHistory' ? 'block' : 'none'}>
        <div class="m-subpage m-subpage-enter">
          <DailyHistoryPage {onOpenArtist} {onOpenAlbum} />
        </div>
      </div>

      <div style:display={activeView === 'messages' ? 'block' : 'none'}>
        <div class="m-subpage m-subpage-enter">
          <MessagesPage onNavigate={onNavigate} {targetUser} onUnreadChange={(count) => onUnreadChange?.(count)} />
        </div>
      </div>

      <div style:display={activeView === 'playlist' || activeView === 'album' ? 'block' : 'none'}>
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
      </div>

      <div style:display={activeView === 'search' ? 'block' : 'none'}>
        <SearchPage onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onOpenPlaylist={onOpenPlaylist} />
      </div>

      <div style:display={activeView === 'artist' ? 'block' : 'none'}>
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
      </div>
    </div>
  </main>

  <!-- 底部主导航 -->
  {#if !isDetailView}
    <nav class="m-tabs" aria-label="主导航">
      <button class="m-tab" class:active={activeView === 'home'} onclick={() => onNavigate?.('home')}>
        <Icon name="home" size={24} />
        <span>首页</span>
      </button>
      <button class="m-tab" class:active={activeView === 'explore'} onclick={() => onNavigate?.('explore')}>
        <Icon name="compass" size={24} />
        <span>发现</span>
      </button>
      <button class="m-tab" class:active={activeView === 'library'} onclick={() => onNavigate?.('library')}>
        <Icon name="liked" size={24} />
        <span>歌单</span>
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
