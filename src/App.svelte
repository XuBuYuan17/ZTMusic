<script>
  import { ncm } from './lib/api/client.js'
  import { player, getLocalHistory } from './lib/stores/player.svelte.js'
  import { auth } from './lib/stores/auth.svelte.js'
  import { extractColor } from './lib/player/colors.js'
  import { coverUrl } from './lib/utils/image.js'
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

  let activeView = $state('home')
  let previousView = $state('home')
  let sidebarCollapsed = $state(false)
  let userPlaylists = $state([])
  let subcount = $state(null)
  let likedPlaylist = $state(null)
  let weeklyPlaylist = $state(null)
  let selectedId = $state(null)
  let heroColor = $state('#141414')
  let loading = $state(true)
  let playlistDetail = $state(null)
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


  let theme = $state(
    typeof window !== 'undefined' ? (localStorage.getItem('zheting-theme') || 'dark') : 'dark'
  )

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
    if (typeof window !== 'undefined') localStorage.setItem('zheting-theme', theme)
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

  function normalizeSong(t) {
    if (!t) return null
    const song = t.song || t.resourceExtInfo?.songData || t.resourceExtInfo?.song || t
    return {
      ...song,
      id: song.id,
      name: song.name,
      ar: song.ar || song.artists || [],
      al: song.al || song.album || {},
      dt: song.dt || song.duration || 0,
      picUrl: song.al?.picUrl || song.album?.picUrl || song.coverImgUrl || song.picUrl || '',
    }
  }

  function normalizeAlbum(album) {
    if (!album) return null
    return {
      id: album.id,
      name: album.name,
      picUrl: album.picUrl || album.blurPicUrl || album.coverImgUrl || '',
      artistName: album.artist?.name || album.artists?.map(a => a.name).join(' / ') || '',
      publishTime: album.publishTime || album.publishTimeStr || '',
      size: album.size || album.trackCount || 0,
    }
  }

  function parseHomepageBlocks(res) {
    const blocks = res?.data?.blocks || res?.blocks || []
    return blocks.map((block, index) => {
      const title = block.uiElement?.subTitle?.title || block.uiElement?.mainTitle?.title || block.blockCode || `推荐 ${index + 1}`
      const creatives = block.creatives || block.extInfo || []
      const items = (Array.isArray(creatives) ? creatives : []).flatMap(creative => {
        const resources = creative.resources || creative.resourceExtInfo?.artists || []
        if (resources.length) {
          return resources.map(r => r.resourceExtInfo?.songData || r.resourceExtInfo?.albumData || r.resourceExtInfo?.playlistData || r.resourceExtInfo || r)
        }
        return [creative.resourceExtInfo?.songData || creative.resourceExtInfo?.albumData || creative.resourceExtInfo?.playlistData || creative]
      }).filter(Boolean).slice(0, 8)
      return { id: block.blockCode || index, title, items }
    }).filter(block => block.items.length > 0).slice(0, 4)
  }

  async function loadExploreData() {
    exploreLoading = true
    try {
      const [bannerRes, personalizedRes, topPlaylistRes, newSongRes, recommendRes, albumNewestRes, homepageRes] = await Promise.all([
        ncm.banner().catch(() => ({ banners: [] })),
        ncm.personalized(10).catch(() => ({ result: [] })),
        ncm.topPlaylist('全部', 12).catch(() => ({ playlists: [] })),
        ncm.personalizedNewSong(12).catch(() => ({ result: [] })),
        ncm.recommendSongs(12).catch(() => ({ data: [] })),
        ncm.albumNewest().catch(() => ({ albums: [] })),
        ncm.homepageBlockPage(false).catch(() => null),
      ])

      // Banner: use targetId as unique key, typeTitle as title
      exploreBanners = (bannerRes?.banners || []).map((b, i) => ({
        id: b.targetId || b.id || i,
        title: b.typeTitle || b.title || '',
        pic: b.imageUrl || b.bigImageUrl || b.pic || '',
        targetId: b.targetId || 0,
        targetType: b.targetType || 0,
      }))

      explorePersonalized = (personalizedRes?.result || personalizedRes?.playlists || []).map(pl => ({
        id: pl.id,
        name: pl.name,
        picUrl: pl.picUrl || pl.coverImgUrl || '',
        playCount: pl.playCount || 0,
        trackCount: pl.trackCount || 0,
        description: pl.description || pl.copywriter || '',
      }))

      exploreTopPlaylists = (topPlaylistRes?.playlists || topPlaylistRes?.list || []).map(pl => ({
        id: pl.id,
        name: pl.name,
        picUrl: pl.coverImgUrl || pl.picUrl || '',
        playCount: pl.playCount || 0,
        trackCount: pl.trackCount || 0,
        updateFrequency: pl.updateFrequency || '',
      }))

      const newSongData = newSongRes?.result || []
      const recData = recommendRes?.data || recommendRes?.songs || []
      const dailySongs = recData.dailySongs || recData.songs || recData || []
      const preferredSongs = newSongData.length ? newSongData : dailySongs
      exploreRecommendSongs = (Array.isArray(preferredSongs) ? preferredSongs : []).map(normalizeSong).filter(Boolean)

      const albumData = albumNewestRes?.albums || albumNewestRes?.data?.albums || []
      exploreNewAlbums = (Array.isArray(albumData) ? albumData : []).map(normalizeAlbum).filter(Boolean).slice(0, 12)
      exploreBlocks = parseHomepageBlocks(homepageRes)
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
    libraryLoading = true
    libraryPlaylists = []
    if (!auth.isLoggedIn) { libraryLoading = false; return }
    const uid = auth.user?.userId || auth.user?.id
    if (!uid) { libraryLoading = false; return }
    try {
      const plRes = await ncm.userPlaylist(uid).catch(() => ({ playlist: [] }))
      const allPls = (plRes.playlist || []).slice(0, 100)
      // 筛选收藏的歌单（非自己创建、非特殊歌单）
      libraryPlaylists = allPls.filter(pl => pl.creator?.userId !== uid && pl.specialType !== 5).map(pl => ({
        id: pl.id,
        name: pl.name,
        picUrl: pl.coverImgUrl,
        playCount: pl.playCount,
        trackCount: pl.trackCount,
        creator: pl.creator?.nickname || '',
        description: pl.description || pl.copywriter || '',
      }))
    } catch { libraryPlaylists = [] }
    libraryLoading = false
  }

  async function loadHome() {
    loading = true
    userPlaylists = []
    subcount = null
    likedPlaylist = null
    weeklyPlaylist = null
    recommendPlaylists = []

    if (auth.isLoggedIn) {
      const uid = auth.user?.userId || auth.user?.id
      if (!uid) { loading = false; return }

      try {
        const plRes = await ncm.userPlaylist(uid).catch(() => ({ playlist: [] }))
        const allPls = (plRes.playlist || []).slice(0, 50)

        refreshKey++

        userPlaylists = allPls.filter(pl => pl.creator?.userId !== uid && pl.specialType !== 5).map(pl => ({
          id: pl.id,
          name: pl.name,
          picUrl: pl.coverImgUrl,
          playCount: pl.playCount,
          trackCount: pl.trackCount,
        }))

        ncm.userSubcount()
          .then((subRes) => { subcount = subRes?.data || subRes })
          .catch(() => {})

        const likedPl = allPls.find(pl => pl.creator?.userId === uid && pl.specialType === 5)
        if (likedPl) {
          likedPlaylist = {
            id: likedPl.id,
            name: likedPl.name,
            picUrl: likedPl.coverImgUrl,
            trackCount: likedPl.trackCount,
          }
        }

        weeklyPlaylist = {
          id: 0,
          name: '听歌排行',
          picUrl: auth.user?.avatarUrl || '',
          trackCount: 0,
          playCount: 0,
          topSongName: '',
        }
        ncm.userRecordWeek(uid)
          .then((weeklyRecordRes) => {
            const weeklyList = weeklyRecordRes?.weekData || weeklyRecordRes?.data?.weekData || weeklyRecordRes?.data?.list || weeklyRecordRes?.list || []
            const weeklyTracks = Array.isArray(weeklyList)
              ? weeklyList.map(normalizeRecordSong).filter(Boolean)
              : []
            const topSong = weeklyTracks[0] || null
            weeklyPlaylist = {
              id: 0,
              name: '听歌排行',
              picUrl: topSong?.picUrl || auth.user?.avatarUrl || '',
              trackCount: weeklyTracks.length,
              playCount: topSong?.playCount || 0,
              topSongName: topSong?.name || '',
            }
            if (weeklyTracks.length) recentTracks = weeklyTracks
          })
          .catch(() => {})

        // 每日推荐歌单
        ncm.recommendResource()
          .then((recommendRes) => {
            const recList = recommendRes?.recommend || recommendRes?.playlists || []
            recommendPlaylists = (Array.isArray(recList) ? recList : []).slice(0, 6).map(pl => ({
              id: pl.id,
              name: pl.name,
              picUrl: pl.picUrl || pl.coverImgUrl || '',
              playCount: pl.playCount || 0,
              trackCount: pl.trackCount || 0,
              copywriter: pl.copywriter || pl.description || '',
            }))
          })
          .catch(() => {})
      } catch {}
    }
    loading = false
  }

  async function loadToplists() {
    toplistsLoading = true
    try {
      const res = await ncm.toplist()
      toplists = res?.list || res?.data?.list || []
    } catch {
      toplists = []
    }
    toplistsLoading = false
  }

  function extractCover(track) {
    if (!track) return ''
    const album = track.al || track.album || {}
    return album.picUrl || track.coverImgUrl || track.picUrl || ''
  }

  function normalizeRecordSong(item) {
    const song = item?.song || item
    if (!song) return null
    return {
      id: song.id,
      name: song.name,
      ar: song.ar || song.artists || [],
      al: song.al || song.album || {},
      dt: song.dt || song.duration || 0,
      picUrl: extractCover(song),
      playCount: item?.playCount || item?.score || 0,
    }
  }

  function playExploreSong(track) {
    if (track) player.playTrack(track, 0)
  }

  async function loadRecent() {
    recentLoading = true
    recentTracks = []
    const uid = auth.user?.userId || auth.user?.id
    if (uid) {
      // 已登录：优先从云端获取
      try {
        const res = await ncm.userRecord(uid, 1)
        const list = res?.weekData || res?.data?.weekData || res?.data?.list || res?.list || []
        recentTracks = Array.isArray(list)
          ? list.map(normalizeRecordSong).filter(Boolean)
          : []
      } catch {
        recentTracks = []
      }
    }
    // 如果云端没有或未登录，补充本地记录
    if (recentTracks.length === 0) {
      const local = getLocalHistory()
      recentTracks = local.map(item => ({
        id: item.id,
        name: item.name,
        ar: item.artists || [],
        al: item.album || {},
        picUrl: item.picUrl || extractCover(item),
        dt: item.duration || 0,
      }))
    }
    recentLoading = false
  }

  function playRecentAll() {
    if (recentTracks.length) player.playQueue(recentTracks, 0)
  }

  function playRecentTrack(track) {
    const idx = recentTracks.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(recentTracks, idx)
    else player.playTrack(track, 0)
  }

  async function goPlaylist(id) {
    if (!id || id <= 0) return
    routeTransition = 'book-turn'
    previousView = activeView
    activeView = 'playlist'
    selectedId = id
    heroColor = '#141414'
    playlistDetail = null
    const d = await ncm.playlistDetail(id)
    playlistDetail = d?.playlist || null
    if (playlistDetail?.coverImgUrl) {
      try {
        const c = await extractColor(coverUrl(playlistDetail.coverImgUrl, 100))
        if (c) heroColor = c
      } catch {}
    }
  }

  async function goAlbum(id) {
    if (!id || id <= 0) return
    routeTransition = 'book-turn'
    previousView = activeView
    activeView = 'album'
    selectedId = id
    heroColor = '#141414'
    playlistDetail = null
    const d = await ncm.album(id)
    const album = d?.album || {}
    const songs = d?.songs || album?.songs || []
    const artistName = album.artist?.name || album.artists?.map(a => a.name).join(' / ') || ''
    playlistDetail = {
      id: album.id || id,
      name: album.name || '未知专辑',
      coverImgUrl: album.picUrl,
      picUrl: album.picUrl,
      creator: { nickname: artistName },
      trackCount: album.size || songs.length,
      description: album.description || album.alias?.join(' / ') || '',
      tracks: songs,
    }
    if (playlistDetail?.coverImgUrl) {
      try {
        const c = await extractColor(coverUrl(playlistDetail.coverImgUrl, 100))
        if (c) heroColor = c
      } catch {}
    }
  }

  async function goArtist(id) {
    if (!id || id <= 0) return
    routeTransition = 'book-turn'
    previousView = activeView
    activeView = 'artist'
    selectedId = id
    heroColor = '#141414'
    artistLoading = true
    artistDetail = null
    artistSongs = []
    artistAlbums = []
    try {
      const [detailRes, songsRes, albumsRes] = await Promise.all([
        ncm.artistDetail(id).catch(() => null),
        ncm.artistSongs(id, 50).catch(() => ({ songs: [] })),
        ncm.artistAlbums(id, 30).catch(() => ({ hotAlbums: [] })),
      ])
      const baseArtist = detailRes?.data?.artist || detailRes?.artist || albumsRes?.artist || {}
      artistDetail = {
        id: baseArtist.id || id,
        name: baseArtist.name || '未知歌手',
        cover: baseArtist.cover || baseArtist.picUrl || '',
        avatar: baseArtist.avatar || baseArtist.img1v1Url || baseArtist.picUrl || '',
        picUrl: baseArtist.picUrl || baseArtist.cover || baseArtist.avatar || '',
        alias: baseArtist.alias || baseArtist.transNames || [],
        identities: baseArtist.identities || detailRes?.data?.identify?.imageDesc?.split('、') || [],
        briefDesc: baseArtist.briefDesc || '',
        musicSize: baseArtist.musicSize || 0,
        albumSize: baseArtist.albumSize || 0,
      }
      artistSongs = (songsRes?.songs || songsRes?.data?.songs || []).map(t => ({
        ...t,
        picUrl: t.picUrl || t.al?.picUrl || t.album?.picUrl || '',
      }))
      artistAlbums = albumsRes?.hotAlbums || albumsRes?.albums || []
    } catch {
      artistDetail = null
      artistSongs = []
      artistAlbums = []
    }
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

  async function loadDailyHistory() {
    dailyHistoryLoading = true
    try {
      const res = await ncm.historyRecommendSongs()
      const dates = res?.data?.dates || res?.dates || res?.data || []
      dailyHistoryDates = (Array.isArray(dates) ? dates : []).map(item => typeof item === 'string' ? { date: item } : item).filter(item => item?.date)
      const first = dailyHistoryDates[0]?.date || ''
      selectedDailyDate = first
      if (first) await loadDailyHistoryDetail(first)
    } catch {
      dailyHistoryDates = []
      dailyHistorySongs = []
    }
    dailyHistoryLoading = false
  }

  async function loadDailyHistoryDetail(date) {
    if (!date) return
    selectedDailyDate = date
    dailyHistoryLoading = true
    try {
      const res = await ncm.historyRecommendSongsDetail(date)
      const songs = res?.data?.songs || res?.songs || res?.data?.dailySongs || []
      dailyHistorySongs = (Array.isArray(songs) ? songs : []).map(normalizeSong).filter(Boolean)
    } catch {
      dailyHistorySongs = []
    }
    dailyHistoryLoading = false
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

  function handleNav(view, extra) {
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
    previousView = activeView
    activeView = view
    selectedId = null
    heroColor = '#141414'
    playlistDetail = null
    artistDetail = null
    artistSongs = []
    artistAlbums = []

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
    const backView = previousView || 'home'
    // Directly set view to avoid handleNav overwriting previousView
    routeTransition = 'soft'
    previousView = activeView
    activeView = backView
    heroColor = '#141414'
    if (backView === 'home' || backView === 'playlist' || backView === 'album') {
      selectedId = null
      playlistDetail = null
      artistDetail = null
      artistSongs = []
      artistAlbums = []
    }
    if (backView === 'home') loadHome()
    else if (backView === 'recent') loadRecent()
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

  function toggleTheme() {
    const shell = document.querySelector('.app-shell')
    shell?.classList.add('theme-transitioning')
    theme = theme === 'dark' ? 'light' : 'dark'
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        shell?.classList.remove('theme-transitioning')
      })
    })
  }

  const defaultPage = (typeof localStorage !== 'undefined' ? localStorage.getItem('default_page') : null) || 'home'
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
    <div class="content-scroll">
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
          />

        {:else if activeView === 'playlist' || activeView === 'album'}
          <PlaylistPage
            {playlistDetail}
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
            onBack={goBack}
            onPlayAll={playArtistAll}
            onPlayTrack={playArtistTrack}
            onOpenAlbum={goAlbum}
            onOpenArtist={goArtist}
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
        {/if}
        </div>
        {/key}
      </div>
    </div>

    <div class="player-bar-wrap" class:queue-open={showQueuePanel}>
      <PlayerBar onOpenSheet={openSheet} onToggleQueue={toggleQueue} showQueuePanel={showQueuePanel} />
    </div>
  </div>
</main>

<LyricsPage show={showSheet} lyricsOrigin={lyricsOrigin} onClose={closeSheet} />
<LoginOverlay showLogin={showLogin} onClose={() => showLogin = false} />
<QueuePanel show={showQueuePanel} onClose={closeQueue} />
