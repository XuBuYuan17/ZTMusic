<script>
  import { tick } from 'svelte'
  import { ncm } from './lib/api/client.js'
  import { player, getLocalHistory } from './lib/stores/player.svelte.js'
  import { auth } from './lib/stores/auth.svelte.js'
  import { extractColor } from './lib/player/colors.js'
  import { loadDailyHistoryData, loadDailyHistoryDetailData } from './lib/services/dailyHistory.js'
  import { loadAlbumDetail, loadArtistDetail, loadPlaylistDetail } from './lib/services/details.js'
  import { loadExploreData as fetchExploreData } from './lib/services/explore.js'
  import { loadHomeData, loadLibraryData, loadRecentData, loadToplistsData } from './lib/services/home.js'
  import { getStorage, setStorage } from './lib/utils/storage.js'
  import { getSetting, migrateSettings } from './lib/utils/settings.js'
  import { coverUrl } from './lib/utils/image.js'
  import { initDB } from './lib/db/init.js'
  import Sidebar from './lib/components/Sidebar.svelte'
  import PlayerBar from './lib/components/PlayerBar.svelte'
  import QueuePanel from './lib/components/QueuePanel.svelte'
  import FollowDialog from './lib/components/FollowDialog.svelte'
  import LyricsPage from './lib/components/LyricsPage.svelte'
  import LoginOverlay from './lib/components/LoginOverlay.svelte'
  import SearchOverlay from './lib/components/SearchOverlay.svelte'
  import HomePage from './lib/pages/HomePage.svelte'
  import ExplorePage from './lib/pages/ExplorePage.svelte'
  import DailyHistoryPage from './lib/pages/DailyHistoryPage.svelte'
  import SearchPage from './lib/pages/SearchPage.svelte'
  import ArtistPage from './lib/pages/ArtistPage.svelte'
  import MessagesPage from './lib/pages/MessagesPage.svelte'
  import LibraryPage from './lib/pages/LibraryPage.svelte'
  import RecentPage from './lib/pages/RecentPage.svelte'
  import SettingsPage from './lib/pages/SettingsPage.svelte'
  import PlaylistPage from './lib/pages/PlaylistPage.svelte'
  import AboutPage from './lib/pages/AboutPage.svelte'

  const isMobileRuntime = () => typeof document !== 'undefined' && document.documentElement.classList.contains('mobile-runtime')
  const isAndroidRuntime = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

  let activeView = $state('home')
  let previousView = $state('home')
  let sidebarCollapsed = $state(isMobileRuntime())
  let userPlaylists = $state([])
  let subcount = $state(null)
  let likedPlaylist = $state(null)
  let weeklyPlaylist = $state(null)
  let selectedId = $state(null)
  let routeStack = $state([])
  let contentScrollEl = $state(null)
  let heroColor = $state('#141414')
  let loading = $state(true)
  let playlistDetail = $state(null)
  let playlistDetailLoading = $state(false)
  let playlistLoadingMore = $state(false)
  let playlistDetailError = $state('')
  let showSheet = $state(false)
  let lyricsOrigin = $state(null)
  let showLogin = $state(false)
  let showSearch = $state(false)
  let showFollowDialog = $state(false)
  let messageTargetUser = $state(null)
  let refreshKey = $state(Date.now())
  let toplists = $state([])

  // cookie 过期自动弹出登录
  $effect(() => {
    if (!auth.cookieOk && auth.isLoggedIn) {
      showLogin = true
    }
  })
  let toplistsLoading = $state(false)
  let recentTracks = $state([])
  let recentLoading = $state(false)
  let recommendPlaylists = $state([])
  let routeTransition = $state('soft')
  let artistDetail = $state(null)
  let artistSongs = $state([])
  let artistAlbums = $state([])
  let artistLoading = $state(false)
  let artistError = $state('')

  // Explore page data
  let exploreBanners = $state([])
  let explorePersonalized = $state([])
  let exploreTopPlaylists = $state([])
  let exploreRecommendSongs = $state([])
  let exploreNewAlbums = $state([])
  let exploreBlocks = $state([])
  let exploreLoading = $state(false)

  // Daily history data
  let dailyHistoryDates = $state([])
  let dailyHistorySongs = $state([])
  let dailyHistoryLoading = $state(false)
  let selectedDailyDate = $state('')

  // Library data
  let libraryPlaylists = $state([])
  let libraryLoading = $state(false)

  let homeRequestId = 0
  let recentRequestId = 0
  let libraryRequestId = 0
  let dailyHistoryRequestId = 0
  let detailRequestId = 0
  let artistRequestId = 0

  function currentRoute() {
    return { view: activeView, id: selectedId }
  }

  function pushRoute() {
    routeStack = [...routeStack, currentRoute()]
  }

  function resetContentScroll() {
    tick().then(() => contentScrollEl?.scrollTo({ top: 0, left: 0 }))
  }

  function createPlaylistPreview(playlist, id) {
    if (!playlist) return null
    return {
      id: playlist.id || id,
      name: playlist.name || '加载中',
      coverImgUrl: playlist.coverImgUrl || playlist.picUrl || playlist.cover || '',
      picUrl: playlist.picUrl || playlist.coverImgUrl || playlist.cover || '',
      creator: typeof playlist.creator === 'string' ? { nickname: playlist.creator } : playlist.creator,
      trackCount: playlist.trackCount || playlist.size || 0,
      description: playlist.description || playlist.copywriter || playlist.updateFrequency || '',
      tracks: [],
    }
  }


  migrateSettings()

  let theme = $state(getStorage('zheting-theme', 'dark'))

  auth.init()
  initDB() // 异步初始化 SQLite，不阻塞渲染

  // 恢复上次播放状态
  $effect(() => {
    player.restore()
  })

  $effect(() => {
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().onCloseRequested(async (event) => {
          if (handleAppBack()) event.preventDefault()
        })
      })
    }
  })

  $effect(() => {
    if (typeof window === 'undefined' || !isAndroidRuntime() || !isMobileRuntime()) return

    const state = { zhetingBackGuard: true }
    history.replaceState(state, '', location.href)
    history.pushState(state, '', location.href)

    const handlePopState = () => {
      if (!handleAppBack()) return
      history.pushState(state, '', location.href)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  })

  $effect(() => {
    if (typeof window === 'undefined' || !isAndroidRuntime() || !isMobileRuntime()) return

    const edgeWidth = 28
    const triggerDistance = 82
    const maxVerticalDrift = 56
    let startX = 0
    let startY = 0
    let tracking = false
    let triggered = false

    const shouldIgnoreTarget = (target) => target?.closest?.('input, textarea, select, [contenteditable="true"], .progress-bar, .progress-container, .volume-slider-inline, .home-quick-grid, .home-feature-row, .card-scroll')

    const onPointerDown = (event) => {
      if (event.pointerType === 'mouse' || event.button !== 0) return
      if (!hasAppBackTarget() || event.clientX > edgeWidth || shouldIgnoreTarget(event.target)) return
      startX = event.clientX
      startY = event.clientY
      tracking = true
      triggered = false
    }

    const onPointerMove = (event) => {
      if (!tracking || triggered) return
      const dx = event.clientX - startX
      const dy = Math.abs(event.clientY - startY)
      if (dx < 0 || dy > maxVerticalDrift) {
        tracking = false
        return
      }
      if (dx >= triggerDistance) {
        triggered = true
        tracking = false
        event.preventDefault()
        handleAppBack()
      }
    }

    const stopTracking = () => {
      tracking = false
      triggered = false
    }

    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', stopTracking, { passive: true })
    window.addEventListener('pointercancel', stopTracking, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopTracking)
      window.removeEventListener('pointercancel', stopTracking)
    }
  })

  $effect(() => {
    document.documentElement.style.backgroundColor = heroColor
  })

  $effect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    setStorage('zheting-theme', theme)
  })

  $effect(() => {
    if (activeView === 'explore' && toplists.length === 0 && !toplistsLoading) {
      loadToplists()
    }
  })

  let exploreLoaded = $state(false)

  $effect(() => {
    if (activeView === 'explore' && !exploreLoaded) {
      loadExploreData()
    }
    // Reset when leaving explore
    if (activeView !== 'explore') {
      exploreLoaded = false
    }
  })

  async function loadExploreData() {
    exploreLoading = true
    try {
      const data = await fetchExploreData(ncm)
      exploreBanners = data.banners
      explorePersonalized = data.personalized
      exploreTopPlaylists = data.topPlaylists
      exploreRecommendSongs = data.recommendSongs
      exploreNewAlbums = data.newAlbums
      exploreBlocks = data.blocks
    } catch (e) {
      console.error('Failed to load explore data:', e)
    }
    exploreLoading = false
    exploreLoaded = true
  }

  function handleBannerClick(banner) {
    // targetType: 10=album, 1000=playlist, 3000=link/activity
    const tid = banner.targetId || 0
    if (banner.targetType === 10 && tid > 0) {
      goAlbum(tid)
    } else if (banner.targetType === 1000 && tid > 0) {
      goPlaylist(tid)
    }
  }

  async function loadLibrary() {
    const requestId = ++libraryRequestId
    libraryLoading = true
    libraryPlaylists = []
    if (!auth.isLoggedIn) { libraryLoading = false; return }
    try {
      const playlists = await loadLibraryData(ncm, auth.user)
      if (requestId !== libraryRequestId) return
      libraryPlaylists = playlists
    } finally {
      if (requestId === libraryRequestId) libraryLoading = false
    }
  }

  async function loadHome() {
    const requestId = ++homeRequestId
    loading = true
    userPlaylists = []
    subcount = null
    likedPlaylist = null
    weeklyPlaylist = null
    recommendPlaylists = []

    try {
      if (auth.isLoggedIn) {
        const data = await loadHomeData(ncm, auth.user)
        if (requestId !== homeRequestId) return
        refreshKey++
        userPlaylists = data.userPlaylists
        likedPlaylist = data.likedPlaylist
        weeklyPlaylist = data.weeklyPlaylist
        recentTracks = data.recentTracks
        recommendPlaylists = data.recommendPlaylists

        data.subcountPromise?.then(value => { if (requestId === homeRequestId) subcount = value }).catch(() => {})
        data.weeklyPromise?.then(value => {
          if (requestId !== homeRequestId) return
          weeklyPlaylist = value.weeklyPlaylist
          if (value.recentTracks.length) recentTracks = value.recentTracks
        }).catch(() => {})
        data.recommendPromise?.then(value => { if (requestId === homeRequestId) recommendPlaylists = value }).catch(() => {})
      }
    } finally {
      if (requestId === homeRequestId) loading = false
    }
  }

  async function loadToplists() {
    toplistsLoading = true
    try {
      toplists = await loadToplistsData(ncm)
    } finally {
      toplistsLoading = false
    }
  }

  function playExploreSong(track) {
    if (track) player.playTrack(track, 0)
  }

  async function loadRecent() {
    const requestId = ++recentRequestId
    recentLoading = true
    recentTracks = []
    try {
      const tracks = await loadRecentData(ncm, auth.user, getLocalHistory)
      if (requestId !== recentRequestId) return
      recentTracks = tracks
    } finally {
      if (requestId === recentRequestId) recentLoading = false
    }
  }

  function playRecentAll() {
    if (recentTracks.length) player.playQueue(recentTracks, 0)
  }

  function playRecentTrack(track) {
    const idx = recentTracks.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(recentTracks, idx)
    else player.playTrack(track, 0)
  }

  async function goPlaylist(id, shouldPushRoute = true, preview = null) {
    if (!id || id <= 0) return
    if (shouldPushRoute) pushRoute()
    const requestId = ++detailRequestId
    routeTransition = 'book-turn'
    previousView = activeView
    activeView = 'playlist'
    selectedId = id
    resetContentScroll()
    heroColor = '#141414'
    playlistDetail = createPlaylistPreview(preview, id)
    playlistDetailError = ''
    playlistDetailLoading = true
    let loadedFirstBatch = false
    let data
    try {
      data = await loadPlaylistDetail(ncm, extractColor, id, (partial) => {
        if (requestId === detailRequestId) {
          playlistDetail = partial.detail
          heroColor = partial.heroColor
          if (!loadedFirstBatch) {
            loadedFirstBatch = true
            playlistDetailLoading = false
            const total = partial.detail?.trackIds?.length || 0
            const have = partial.detail?.tracks?.length || 0
            if (have < total) playlistLoadingMore = true
          }
        }
      })
    } catch (error) {
      data = { detail: null, heroColor: '#141414' }
      playlistDetailError = error?.message || '歌单详情加载失败'
    }
    if (requestId !== detailRequestId) return
    playlistDetail = data.detail
    heroColor = data.heroColor
    playlistDetailLoading = false
    playlistLoadingMore = false
  }

  async function goAlbum(id, shouldPushRoute = true) {
    if (!id || id <= 0) return
    if (shouldPushRoute) pushRoute()
    const requestId = ++detailRequestId
    routeTransition = 'book-turn'
    previousView = activeView
    activeView = 'album'
    selectedId = id
    resetContentScroll()
    heroColor = '#141414'
    playlistDetail = null
    playlistDetailError = ''
    playlistDetailLoading = true
    let data
    try {
      data = await loadAlbumDetail(ncm, extractColor, id)
    } catch (error) {
      data = { detail: null, heroColor: '#141414' }
      playlistDetailError = error?.message || '专辑详情加载失败'
    }
    if (requestId !== detailRequestId) return
    playlistDetail = data.detail
    heroColor = data.heroColor
    playlistDetailLoading = false
  }

  async function goArtist(id, shouldPushRoute = true) {
    if (!id || id <= 0) return
    if (shouldPushRoute) pushRoute()
    const requestId = ++artistRequestId
    routeTransition = 'book-turn'
    previousView = activeView
    activeView = 'artist'
    selectedId = id
    resetContentScroll()
    heroColor = '#141414'
    artistLoading = true
    artistError = ''
    artistDetail = null
    artistSongs = []
    artistAlbums = []
    let data
    try {
      data = await loadArtistDetail(ncm, id)
    } catch (error) {
      data = { artist: null, songs: [], albums: [] }
      artistError = error?.message || '歌手详情加载失败'
    }
    if (requestId !== artistRequestId) return
    artistDetail = data.artist
    artistSongs = data.songs
    artistAlbums = data.albums
    artistLoading = false
  }

  function playArtistTrack(track) {
    if (!track) return
    const idx = artistSongs.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(artistSongs, idx)
    else player.playTrack(track, 0)
  }

  function playArtistAll() {
    if (artistSongs.length) player.playQueue(artistSongs, 0)
  }

  async function toggleArtistFollow() {
    if (!artistDetail?.id) return
    const nextFollowed = !artistDetail.followed
    artistDetail = { ...artistDetail, followed: nextFollowed }
    try {
      await ncm.artistSub(artistDetail.id, nextFollowed)
    } catch (error) {
      artistDetail = { ...artistDetail, followed: !nextFollowed }
    }
  }

  async function loadDailyHistory() {
    const requestId = ++dailyHistoryRequestId
    dailyHistoryLoading = true
    try {
      const data = await loadDailyHistoryData(ncm)
      if (requestId !== dailyHistoryRequestId) return
      dailyHistoryDates = data.dates
      selectedDailyDate = data.selectedDate
      dailyHistorySongs = data.songs
    } finally {
      if (requestId === dailyHistoryRequestId) dailyHistoryLoading = false
    }
  }

  async function loadDailyHistoryDetail(date) {
    if (!date) return
    const requestId = ++dailyHistoryRequestId
    selectedDailyDate = date
    dailyHistoryLoading = true
    try {
      const songs = await loadDailyHistoryDetailData(ncm, date)
      if (requestId !== dailyHistoryRequestId) return
      dailyHistorySongs = songs
    } finally {
      if (requestId === dailyHistoryRequestId) dailyHistoryLoading = false
    }
  }

  function playDailyHistoryAll() {
    if (dailyHistorySongs.length) player.playQueue(dailyHistorySongs, 0)
  }

  function playDailyHistoryTrack(track) {
    const idx = dailyHistorySongs.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(dailyHistorySongs, idx)
    else player.playTrack(track, 0)
  }

  function playTrack(id, visibleTracks) {
    const tracks = visibleTracks?.length ? visibleTracks : playlistDetail?.tracks || []
    const idx = tracks.findIndex(t => t.id === id)
    if (idx >= 0) player.playQueue(tracks, idx)
    else player.playTrack(tracks.find(t => t.id === id) || { id }, 0)
  }

  function playAll(visibleTracks) {
    const tracks = visibleTracks?.length ? visibleTracks : playlistDetail?.tracks || []
    if (tracks.length) player.playQueue(tracks, 0)
  }

  function invalidateViewRequests() {
    homeRequestId++
    recentRequestId++
    libraryRequestId++
    dailyHistoryRequestId++
    detailRequestId++
    artistRequestId++
  }

  function handleNav(view, extra) {
    invalidateViewRequests()
    if (view === 'profile') view = 'home'
    if (view === 'playlist' && extra) {
      goPlaylist(extra)
      return
    }
    if (view === 'album' && extra) {
      goAlbum(extra)
      return
    }
    if (view === 'artist' && extra) {
      goArtist(extra)
      return
    }

    routeTransition = 'soft'
    routeStack = []
    previousView = activeView
    activeView = view
    selectedId = null
    heroColor = '#141414'
    playlistDetail = null
    artistDetail = null
    artistSongs = []
    artistAlbums = []
    playlistDetailError = ''
    playlistDetailLoading = false
    artistError = ''
    artistLoading = false

    if (view === 'home') {
      loadHome()
    } else if (view === 'recent') {
      loadRecent()
    } else if (view === 'library') {
      loadLibrary()
    } else if (view === 'dailyHistory') {
      loadDailyHistory()
    }
  }

  function goBack() {
    invalidateViewRequests()
    const previousRoute = routeStack[routeStack.length - 1]
    routeStack = routeStack.slice(0, -1)
    if (!previousRoute) {
      handleNav('home')
      return
    }

    if (previousRoute.view === 'playlist') {
      goPlaylist(previousRoute.id, false)
      return
    }
    if (previousRoute.view === 'album') {
      goAlbum(previousRoute.id, false)
      return
    }
    if (previousRoute.view === 'artist') {
      goArtist(previousRoute.id, false)
      return
    }

    const backView = previousRoute.view || 'home'
    routeTransition = 'soft'
    previousView = activeView
    activeView = backView
    selectedId = null
    heroColor = '#141414'
    playlistDetail = null
    artistDetail = null
    artistSongs = []
    artistAlbums = []
    resetContentScroll()
    if (backView === 'home') loadHome()
    else if (backView === 'recent') loadRecent()
    else if (backView === 'library') loadLibrary()
    else if (backView === 'dailyHistory') loadDailyHistory()
  }

  function handleAppBack() {
    if (showSheet) { closeSheet(); return true }
    if (showQueuePanel) { closeQueue(); return true }
    if (showSearch) { showSearch = false; return true }
    if (showLogin) { showLogin = false; return true }
    if (showFollowDialog) { showFollowDialog = false; return true }
    if (routeStack.length > 0) { goBack(); return true }
    if (activeView !== 'home') { handleNav('home'); return true }
    return false
  }

  function hasAppBackTarget() {
    return showSheet || showQueuePanel || showSearch || showLogin || showFollowDialog || routeStack.length > 0 || activeView !== 'home'
  }

  function openSheet(originEl) {
    const source = originEl || document.querySelector('.lcd-artwork__img') || document.querySelector('.mobile-mini-player__art') || document.querySelector('.mobile-mini-player')
    if (source) {
      const r = source.getBoundingClientRect()
      lyricsOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    } else {
      lyricsOrigin = null
    }
    showSheet = true
  }
  function closeSheet() { showSheet = false }

  function openFollows() {
    if (!auth.isLoggedIn) {
      showLogin = true
      return
    }
    showFollowDialog = true
  }

  function openMessageWithUser(user) {
    if (!auth.isLoggedIn) {
      showLogin = true
      return
    }
    showFollowDialog = false
    messageTargetUser = user
    handleNav('messages')
  }

  let showQueuePanel = $state(false)
  function toggleQueue() { showQueuePanel = !showQueuePanel }
  function closeQueue() { showQueuePanel = false }

  let themeTransitionTimer

  function setThemeTransitionOrigin(event) {
    if (typeof window === 'undefined') return
    const root = document.documentElement
    const rect = event?.currentTarget?.getBoundingClientRect?.()
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    root.style.setProperty('--theme-x', `${x}px`)
    root.style.setProperty('--theme-y', `${y}px`)
    root.style.setProperty('--theme-radius', `${Math.ceil(endRadius)}px`)
  }

  function toggleTheme(event) {
    const shell = document.querySelector('.app-shell')
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const nextTheme = theme === 'dark' ? 'light' : 'dark'

    clearTimeout(themeTransitionTimer)
    setThemeTransitionOrigin(event)
    shell?.classList.add('theme-transitioning')

    const finish = () => {
      themeTransitionTimer = setTimeout(() => {
        shell?.classList.remove('theme-transitioning')
      }, 860)
    }

    if (!reduceMotion && document.startViewTransition) {
      const transition = document.startViewTransition(async () => {
        theme = nextTheme
        await tick()
      })
      themeTransitionTimer = setTimeout(() => {
        shell?.classList.remove('theme-transitioning')
      }, 920)
      transition.finished.finally(finish)
      return
    }

    theme = nextTheme
    finish()
  }

  const viewTitles = {
    home: '哲听',
    search: '搜索',
    explore: '发现',
    dailyHistory: '历史日推',
    library: '我的收藏',
    recent: '最近播放',
    messages: '私信',
    settings: '我的',
    about: '关于',
    playlist: '歌单',
    album: '专辑',
    artist: '歌手',
  }

  let mobileTitle = $derived(viewTitles[activeView] || '哲听')

  const defaultPage = getSetting('default_page', 'home')
  if (defaultPage === 'library') {
    loadLibrary()
  } else if (defaultPage === 'explore') {
    activeView = 'explore'
  } else {
    loadHome()
  }
</script>

<main class="app-shell" data-theme={theme}>
  <Sidebar
    {activeView}
    bind:collapsed={sidebarCollapsed}
    {theme}
    {refreshKey}
    onNavigate={handleNav}
    onToggleTheme={toggleTheme}
    onOpenLogin={() => showLogin = true}
  />

  <div class="main-area">
    <!-- Desktop search button -->
    <button class="global-search-btn" type="button" onclick={() => showSearch = true} aria-label="搜索">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </button>

    <!-- Responsive Top Bar (mobile only via CSS) -->
    <div class="mobile-topbar">
      <div class="mobile-topbar__title">{mobileTitle}</div>
      <div class="mobile-topbar__actions">
        <button class="mobile-search-btn" type="button" onclick={() => showSearch = true} aria-label="搜索">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>搜索</span>
        </button>
        {#if !auth.isLoggedIn}
          <button class="mobile-login-btn" onclick={() => showLogin = true}>登录</button>
        {/if}
      </div>
    </div>

    <div class="content-scroll" bind:this={contentScrollEl}>
      <div class="content-inner">
        {#key activeView}
        <div class="page-enter" class:book-turn={routeTransition === 'book-turn'}>
          {#if activeView === 'home'}
            <HomePage
              {refreshKey}
              {loading}
              {recentTracks}
              {userPlaylists}
              {subcount}
              {likedPlaylist}
              {weeklyPlaylist}
              {recommendPlaylists}
              onNavigate={handleNav}
              onOpenLogin={() => showLogin = true}
              onOpenPlaylist={goPlaylist}
              onPlayRecentTrack={playRecentTrack}
              onOpenArtist={goArtist}
              onOpenAlbum={goAlbum}
              onOpenFollows={openFollows}
            />

          {:else if activeView === 'playlist' || activeView === 'album'}
            <PlaylistPage
              {playlistDetail}
              loading={playlistDetailLoading}
              loadingMore={playlistLoadingMore}
              error={playlistDetailError}
              {selectedId}
              {heroColor}
              detailType={activeView === 'album' ? '专辑' : '歌单'}
              onBack={goBack}
              onPlayAll={playAll}
              onPlayTrack={playTrack}
              onOpenArtist={goArtist}
              onOpenAlbum={goAlbum}
            />

          {:else if activeView === 'search'}
            <SearchPage onOpenArtist={goArtist} onOpenAlbum={goAlbum} onOpenPlaylist={goPlaylist} />

          {:else if activeView === 'artist'}
            <ArtistPage
              artist={artistDetail}
              songs={artistSongs}
              albums={artistAlbums}
              loading={artistLoading}
              error={artistError}
              onBack={goBack}
              onPlayAll={playArtistAll}
              onPlayTrack={playArtistTrack}
              onOpenAlbum={goAlbum}
              onOpenArtist={goArtist}
              onToggleFollow={toggleArtistFollow}
            />

          {:else if activeView === 'explore'}
            <ExplorePage
              {exploreLoading}
              {exploreBanners}
              {explorePersonalized}
              {exploreTopPlaylists}
              {exploreRecommendSongs}
              {exploreNewAlbums}
              {exploreBlocks}
              {toplists}
              onBannerClick={handleBannerClick}
              onOpenPlaylist={goPlaylist}
              onOpenAlbum={goAlbum}
              onPlaySong={playExploreSong}
              onOpenArtist={goArtist}
            />

          {:else if activeView === 'dailyHistory'}
            <DailyHistoryPage
              {dailyHistoryDates}
              {dailyHistorySongs}
              {dailyHistoryLoading}
              {selectedDailyDate}
              onSelectDate={loadDailyHistoryDetail}
              onPlayAll={playDailyHistoryAll}
              onPlayTrack={playDailyHistoryTrack}
              onOpenArtist={goArtist}
              onOpenAlbum={goAlbum}
            />

          {:else if activeView === 'library'}
            <LibraryPage
              {libraryPlaylists}
              {libraryLoading}
              onOpenLogin={() => showLogin = true}
              onOpenPlaylist={goPlaylist}
            />

          {:else if activeView === 'recent'}
            <RecentPage
              {recentTracks}
              {recentLoading}
              onPlayAll={playRecentAll}
              onPlayTrack={playRecentTrack}
              onOpenArtist={goArtist}
              onOpenAlbum={goAlbum}
            />

          {:else if activeView === 'messages'}
            <MessagesPage onNavigate={handleNav} targetUser={messageTargetUser} />

          {:else if activeView === 'liked'}
            <div class="fade-in">
              <div class="page-header">
                <h1>我喜欢的音乐</h1>
                <div class="subtitle">我喜欢过的歌曲</div>
              </div>
              <p style="color:var(--text-secondary);">我喜欢的音乐页面开发中...</p>
            </div>

          {:else if activeView === 'settings'}
            <SettingsPage {theme} onSetTheme={(value) => theme = value} />

          {:else if activeView === 'about'}
            <AboutPage />
          {/if}
        </div>
        {/key}
      </div>
    </div>

    <!-- Player bar (desktop) + Mini player (mobile) -->
    <div class="player-bar-wrap" class:queue-open={showQueuePanel}>
      <PlayerBar onOpenSheet={openSheet} onToggleQueue={toggleQueue} {showQueuePanel} onOpenArtist={goArtist} />
      <!-- Mobile mini player (visible only on mobile via CSS) -->
      <div class="mobile-mini-player" class:empty={!player.id} role="button" tabindex="0" aria-label="打开歌词页" onclick={(e) => openSheet(e.currentTarget.querySelector('.mobile-mini-player__art') || e.currentTarget)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(e.currentTarget) } }}>
        <div class="mobile-mini-player__art">
          {#if player.cover}
            <img src={coverUrl(player.cover, 96)} alt="" referrerpolicy="no-referrer" />
          {:else}
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          {/if}
        </div>
        <div class="mobile-mini-player__meta">
          <div class="mobile-mini-player__title">{player.title || '未在播放'}</div>
          <div class="mobile-mini-player__artist">
            {#if player.error}{player.error}
            {:else if player.artist && !player.loading}
              <span class="mini-artist">{player.artist}</span>
            {:else}{player.loading ? '正在载入…' : player.artist || '选择一首歌开始'}
            {/if}
          </div>
        </div>
        <button class="mobile-mini-player__play" onclick={(e) => { e.stopPropagation(); player.togglePlay() }} aria-label={player.playing ? '暂停' : '播放'} disabled={!player.id && !player.loading}>
          {#if player.loading}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" opacity="0.2"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg>
          {:else if player.playing}
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M9 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m8 0h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z" fill-rule="evenodd" clip-rule="evenodd"/></svg>
          {/if}
        </button>
        <button class="mobile-mini-player__queue" class:active={showQueuePanel} onclick={(e) => { e.stopPropagation(); toggleQueue() }} aria-label="播放列表">
          <svg viewBox="0 0 48 48" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round">
            <path stroke-linecap="round" d="M24 19h16m-16-9h16M8 38h32M8 28h32" /><path fill="currentColor" d="m8 10l8 5l-8 5z" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Responsive Bottom Tabs (mobile only via CSS) -->
    <nav class="mobile-tabs" aria-label="底部导航">
      {#each [
        {id:'home',label:'主页',path:'M3 11.5 12 4l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'},
        {id:'explore',label:'发现',path:'M12 2a10 10 0 1 1 0 20a10 10 0 0 1 0-20m3.6 6.4l-5.2 2l-2 5.2l5.2-2z'},
        {id:'library',label:'收藏',path:'M12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5A5.45 5.45 0 0 1 7.5 3c1.74 0 3.41.81 4.5 2.08A6 6 0 0 1 16.5 3A5.45 5.45 0 0 1 22 8.5c0 3.77-3.4 6.86-8.55 11.54z'},
        {id:'settings',label:'我的',path:'M12 8a4 4 0 1 1 0 8a4 4 0 0 1 0-8m0-6a10 10 0 0 1 8.94 14.48A7.98 7.98 0 0 0 12 12a7.98 7.98 0 0 0-8.94 4.48A10 10 0 0 1 12 2'}
      ] as tab}
        {@const isActive = tab.id === 'home' ? activeView === 'home' : tab.id === 'settings' ? ['settings','messages','dailyHistory','recent','about'].includes(activeView) : activeView === tab.id}
        <button class="mobile-tab" class:active={isActive} onclick={() => handleNav(tab.id)} aria-label={tab.label}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d={tab.path} /></svg>
          <span>{tab.label}</span>
        </button>
      {/each}
    </nav>
  </div>
</main>

<LyricsPage show={showSheet} lyricsOrigin={lyricsOrigin} onClose={closeSheet} onOpenArtist={goArtist} />
<SearchOverlay show={showSearch} onClose={() => showSearch = false} onOpenArtist={goArtist} onOpenAlbum={goAlbum} onOpenPlaylist={goPlaylist} />
<LoginOverlay showLogin={showLogin} onClose={() => showLogin = false} />
<FollowDialog show={showFollowDialog} user={auth.user} onClose={() => showFollowDialog = false} onOpenMessage={openMessageWithUser} />
<QueuePanel show={showQueuePanel} onClose={closeQueue} onOpenArtist={goArtist} />
