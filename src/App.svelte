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
  import Sidebar from './lib/components/Sidebar.svelte'
  import PlayerBar from './lib/components/PlayerBar.svelte'
  import QueuePanel from './lib/components/QueuePanel.svelte'
  import LyricsPage from './lib/components/LyricsPage.svelte'
  import LoginOverlay from './lib/components/LoginOverlay.svelte'
  import LibraryPage from './lib/pages/LibraryPage.svelte'
  import RecentPage from './lib/pages/RecentPage.svelte'
  import SettingsPage from './lib/pages/SettingsPage.svelte'
  import PlaylistPage from './lib/pages/PlaylistPage.svelte'
  import HomePage from './lib/pages/HomePage.svelte'
  import ExplorePage from './lib/pages/ExplorePage.svelte'
  import DailyHistoryPage from './lib/pages/DailyHistoryPage.svelte'
  import SearchPage from './lib/pages/SearchPage.svelte'
  import ArtistPage from './lib/pages/ArtistPage.svelte'
  import MessagesPage from './lib/pages/MessagesPage.svelte'
  import AboutPage from './lib/pages/AboutPage.svelte'

  let activeView = $state('home')
  let previousView = $state('home')
  let sidebarCollapsed = $state(false)
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
  let playlistDetailError = $state('')
  let showSheet = $state(false)
  let lyricsOrigin = $state(null)
  let showLogin = $state(false)
  let refreshKey = $state(Date.now())
  let toplists = $state([])
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


  let theme = $state(getStorage('zheting-theme', 'dark'))

  auth.init()

  // 恢复上次播放状态
  $effect(() => {
    player.restore()
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
    let data
    try {
      data = await loadPlaylistDetail(ncm, extractColor, id)
    } catch (error) {
      data = { detail: null, heroColor: '#141414' }
      playlistDetailError = error?.message || '歌单详情加载失败'
    }
    if (requestId !== detailRequestId) return
    playlistDetail = data.detail
    heroColor = data.heroColor
    playlistDetailLoading = false
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

  function playTrack(id) {
    const tracks = playlistDetail?.tracks || []
    const idx = tracks.findIndex(t => t.id === id)
    if (idx >= 0) player.playQueue(tracks, idx)
    else player.playTrack(tracks.find(t => t.id === id) || { id }, 0)
  }

  function playAll() {
    const tracks = playlistDetail?.tracks || []
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

  function openSheet() {
    const img = document.querySelector('.lcd-artwork__img')
    if (img) {
      const r = img.getBoundingClientRect()
      lyricsOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    } else {
      lyricsOrigin = null
    }
    showSheet = true
  }
  function closeSheet() { showSheet = false }

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

  const defaultPage = getStorage('default_page', 'home')
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
    <div class="content-scroll" bind:this={contentScrollEl}>
      <div class="content-inner" style="padding-bottom: 120px;">
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
          />

        {:else if activeView === 'playlist' || activeView === 'album'}
          <PlaylistPage
            {playlistDetail}
            loading={playlistDetailLoading}
            error={playlistDetailError}
            {selectedId}
            {heroColor}
            detailType={activeView === 'album' ? '专辑' : '歌单'}
            onBack={goBack}
            onPlayAll={playAll}
            onPlayTrack={playTrack}
            onOpenArtist={goArtist}
          />

        {:else if activeView === 'search'}
          <SearchPage onOpenArtist={goArtist} onOpenPlaylist={goPlaylist} />

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
          />

        {:else if activeView === 'messages'}
          <MessagesPage onNavigate={handleNav} />

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

    <div class="player-bar-wrap" class:queue-open={showQueuePanel}>
      <PlayerBar onOpenSheet={openSheet} onToggleQueue={toggleQueue} showQueuePanel={showQueuePanel} onOpenArtist={goArtist} />
    </div>
  </div>
</main>

<LyricsPage show={showSheet} lyricsOrigin={lyricsOrigin} onClose={closeSheet} onOpenArtist={goArtist} />
<LoginOverlay showLogin={showLogin} onClose={() => showLogin = false} />
<QueuePanel show={showQueuePanel} onClose={closeQueue} onOpenArtist={goArtist} />
