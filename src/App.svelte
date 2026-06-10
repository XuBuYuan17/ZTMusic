<script>
  import { ncm } from './lib/api/client.js'
  import { player, getLocalHistory } from './lib/stores/player.svelte.js'
  import { auth } from './lib/stores/auth.svelte.js'
  import { extractColor } from './lib/player/colors.js'
  import Sidebar from './lib/components/Sidebar.svelte'
  import PlayerBar from './lib/components/PlayerBar.svelte'
  import LyricsPage from './lib/components/LyricsPage.svelte'
  import LoginOverlay from './lib/components/LoginOverlay.svelte'
  import LibraryPage from './lib/pages/LibraryPage.svelte'
  import CloudPage from './lib/pages/CloudPage.svelte'
  import RecentPage from './lib/pages/RecentPage.svelte'
  import SettingsPage from './lib/pages/SettingsPage.svelte'
  import PlaylistPage from './lib/pages/PlaylistPage.svelte'
  import HomePage from './lib/pages/HomePage.svelte'
  import ExplorePage from './lib/pages/ExplorePage.svelte'

  function pageTransition(node, { duration = 300 } = {}) {
    return {
      duration,
      css: (t) => {
        const scale = 0.94 + 0.06 * t
        const opacity = t
        const y = (1 - t) * 16
        return `
          opacity: ${opacity};
          transform: scale(${scale}) translateY(${y}px);
          transform-origin: center top;
        `
      }
    }
  }

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
  let showLogin = $state(false)
  let refreshKey = $state(Date.now())
  let toplists = $state([])
  let toplistsLoading = $state(false)
  let recentTracks = $state([])
  let recentLoading = $state(false)

  // Explore page data
  let exploreBanners = $state([])
  let explorePersonalized = $state([])
  let exploreTopPlaylists = $state([])
  let exploreRecommendSongs = $state([])
  let exploreNewAlbums = $state([])
  let exploreLoading = $state(false)

  // Library data
  let libraryPlaylists = $state([])
  let libraryLoading = $state(false)

  // Cloud music data
  let cloudSongs = $state([])
  let cloudLoading = $state(false)
  let cloudTotal = $state(0)



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

  async function loadExploreData() {
    exploreLoading = true
    try {
      const [bannerRes, personalizedRes, topPlaylistRes, recommendRes] = await Promise.all([
        ncm.banner().catch(() => ({ banners: [] })),
        ncm.personalized(10).catch(() => ({ result: [] })),
        ncm.topPlaylist('全部', 12).catch(() => ({ playlists: [] })),
        ncm.recommendSongs(12).catch(() => ({ data: [] })),
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

      const recData = recommendRes?.data || recommendRes?.songs || []
      const dailySongs = recData.dailySongs || recData.songs || recData || []
      exploreRecommendSongs = (Array.isArray(dailySongs) ? dailySongs : []).map(t => ({
        id: t.id,
        name: t.name,
        ar: t.artists || t.ar || [],
        al: t.album || t.al || {},
        dt: t.duration || t.dt || 0,
        picUrl: t.album?.picUrl || t.al?.picUrl || t.coverImgUrl || t.picUrl || '',
      }))

      // Use topPlaylist data as "new albums" section
      exploreNewAlbums = exploreTopPlaylists.slice(0, 8)
    } catch (e) {
      console.error('Failed to load explore data:', e)
    }
    exploreLoading = false
    exploreLoaded = true
  }

  function handleBannerClick(banner) {
    // targetType: 1=song, 10=album, 3000=link/activity
    const tid = banner.targetId || 0
    if ((banner.targetType === 1 || banner.targetType === 10) && tid > 0) {
      goPlaylist(tid)
    }
  }

  function extractCloudSongId(song) {
    // 云盘歌曲 ID 在 simpleSong.id 或 privateCloud.songId
    const s = song.simpleSong || song
    const pc = song.privateCloud || song
    return s.id || pc.songId || song.songId || song.id || 0
  }

  function extractCloudTitle(song) {
    const s = song.simpleSong || song
    return s.name || s.songName || song.songName || song.name || '未知'
  }

  function extractCloudArtists(song) {
    const s = song.simpleSong || song
    const artists = s.ar || s.artists || song.ar || song.artists || []
    if (Array.isArray(artists)) return artists
    return []
  }

  function extractCloudDuration(song) {
    const s = song.simpleSong || song
    return s.dt || s.duration || song.dt || song.duration || 0
  }

  function extractCloudCover(song) {
    // 云盘歌曲封面在 simpleSong.al.picUrl
    const s = song.simpleSong || song
    const album = s.al || s.album || song.al || song.album || {}
    return album.picUrl || album.imgUrl || song.coverUrl || song.picUrl || ''
  }

  async function loadCloudData() {
    if (!auth.isLoggedIn) return
    cloudLoading = true
    try {
      const res = await ncm.cloudSongs(50, 0)
      // API 返回: { data: [...], count: 712, ... }
      const raw = res?.data || res?.songs || res?.list || []
      cloudSongs = raw.map(song => ({
        _raw: song,
        id: extractCloudSongId(song),
        name: extractCloudTitle(song),
        picUrl: extractCloudCover(song),
        artists: extractCloudArtists(song),
        duration: extractCloudDuration(song),
      }))
      cloudTotal = res?.count || res?.total || cloudSongs.length
    } catch {
      cloudSongs = []
      cloudTotal = 0
    }
    cloudLoading = false
  }

  function playCloudSong(song) {
    if (song) {
      const track = song._raw || song
      // 归一化字段供播放器使用
      track.id = song.id
      track.picUrl = song.picUrl
      track.name = song.name
      track.ar = song.artists
      track.dt = song.duration
      player.playTrack(track, 0)
    }
  }

  function playAllCloud() {
    if (cloudSongs.length) {
      const tracks = cloudSongs.map(s => {
        const track = s._raw || s
        track.id = s.id
        track.picUrl = s.picUrl
        track.name = s.name
        track.ar = s.artists
        track.dt = s.duration
        return track
      })
      player.playQueue(tracks, 0)
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

    if (auth.isLoggedIn) {
      const uid = auth.user?.userId || auth.user?.id
      if (!uid) { loading = false; return }

      try {
        const [plRes, subRes, detailRes] = await Promise.all([
          ncm.userPlaylist(uid).catch(() => ({ playlist: [] })),
          ncm.userSubcount().catch(() => null),
          ncm.userDetail(uid).catch(() => null),
        ])

        // 优先用登录态接口获取真实头像（userDetail 可能返回默认头像）
        let profile = null
        try {
          const loginRes = await ncm.loginStatus()
          profile = loginRes?.data?.profile || loginRes?.profile
        } catch {}
        if (!profile) {
          profile = detailRes?.profile || detailRes?.data?.profile
        }
        if (profile) {
          auth.setUser({ ...auth.user, ...profile }, auth.loginMode || 'account')
        }
        refreshKey++

        const allPls = (plRes.playlist || []).slice(0, 50)

        userPlaylists = allPls.filter(pl => pl.creator?.userId !== uid && pl.specialType !== 5).map(pl => ({
          id: pl.id,
          name: pl.name,
          picUrl: pl.coverImgUrl,
          playCount: pl.playCount,
          trackCount: pl.trackCount,
        }))

        subcount = subRes?.data || subRes

        const likedPl = allPls.find(pl => pl.creator?.userId === uid && pl.specialType === 5)
        if (likedPl) {
          likedPlaylist = {
            id: likedPl.id,
            name: likedPl.name,
            picUrl: likedPl.coverImgUrl,
            trackCount: likedPl.trackCount,
          }
        }

        const weeklyPl = allPls.find(pl => pl.creator?.userId === uid && pl.specialType === 0 && pl.name?.includes('听歌排行'))
        if (weeklyPl) {
          weeklyPlaylist = {
            id: weeklyPl.id,
            name: weeklyPl.name,
            picUrl: weeklyPl.coverImgUrl,
            trackCount: weeklyPl.trackCount,
            playCount: weeklyPl.playCount,
          }
        }
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
        const list = res?.data?.list || res?.list || []
        recentTracks = (list.map(item => item.song || item).filter(Boolean)).map(t => ({
          id: t.id,
          name: t.name,
          ar: t.ar || t.artists || [],
          al: t.al || t.album || {},
          dt: t.dt || t.duration || 0,
          picUrl: extractCover(t),
        }))
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
    activeView = 'playlist'
    selectedId = id
    heroColor = '#141414'
    const d = await ncm.playlistDetail(id)
    playlistDetail = d?.playlist || null
    if (playlistDetail?.coverImgUrl) {
      extractColor(playlistDetail.coverImgUrl + '?param=100y100').then(c => { if (c) heroColor = c })
    }
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
    previousView = activeView
    activeView = view
    selectedId = null
    heroColor = '#141414'
    playlistDetail = null

    if (view === 'playlist' && extra) {
      goPlaylist(extra)
    } else if (view === 'home') {
      loadHome()
    } else if (view === 'recent') {
      loadRecent()
    } else if (view === 'library') {
      loadLibrary()
    } else if (view === 'cloud') {
      loadCloudData()
    }
  }

  function goBack() {
    const backView = previousView || 'home'
    // Directly set view to avoid handleNav overwriting previousView
    previousView = activeView
    activeView = backView
    selectedId = null
    heroColor = '#141414'
    playlistDetail = null
    if (backView === 'home') loadHome()
    else if (backView === 'recent') loadRecent()
  }

  function openSheet() { showSheet = true }
  function closeSheet() { showSheet = false }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark'
  }

  loadHome()
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
      <div class="content-inner" style="padding-bottom: 72px;">
        {#key activeView}
          {#if activeView === 'home'}
          <div transition:pageTransition>
          <HomePage
            {refreshKey}
            {loading}
            {recentTracks}
            {userPlaylists}
            {subcount}
            {likedPlaylist}
            {weeklyPlaylist}
            onNavigate={handleNav}
            onOpenLogin={() => showLogin = true}
            onOpenPlaylist={goPlaylist}
            onPlayRecentTrack={playRecentTrack}
          />
          </div>

        {:else if activeView === 'playlist'}
          <div transition:pageTransition>
          <PlaylistPage
            {playlistDetail}
            {selectedId}
            {heroColor}
            onBack={goBack}
            onPlayAll={playAll}
            onPlayTrack={playTrack}
          />
          </div>

        {:else if activeView === 'explore'}
          <div transition:pageTransition>
          <ExplorePage
            {exploreLoading}
            {exploreBanners}
            {explorePersonalized}
            {exploreTopPlaylists}
            {exploreRecommendSongs}
            {toplists}
            onBannerClick={handleBannerClick}
            onOpenPlaylist={goPlaylist}
            onPlaySong={playExploreSong}
          />
          </div>

        {:else if activeView === 'library'}
          <div transition:pageTransition>
          <LibraryPage
            {libraryPlaylists}
            {libraryLoading}
            onOpenLogin={() => showLogin = true}
            onOpenPlaylist={goPlaylist}
          />
          </div>

        {:else if activeView === 'cloud'}
          <div transition:pageTransition>
          <CloudPage
            {cloudSongs}
            {cloudLoading}
            {cloudTotal}
            onOpenLogin={() => showLogin = true}
            onPlayAll={playAllCloud}
            onPlaySong={playCloudSong}
          />
          </div>

        {:else if activeView === 'recent'}
          <div transition:pageTransition>
          <RecentPage
            {recentTracks}
            {recentLoading}
            onPlayAll={playRecentAll}
            onPlayTrack={playRecentTrack}
          />
          </div>

        {:else if activeView === 'liked'}
          <div transition:pageTransition>
          <div class="fade-in">
            <div class="page-header">
              <h1>我喜欢的音乐</h1>
              <div class="subtitle">我喜欢过的歌曲</div>
            </div>
            <p style="color:var(--text-secondary);">我喜欢的音乐页面开发中...</p>
          </div>
          </div>

        {:else if activeView === 'settings'}
          <div transition:pageTransition>
          <SettingsPage {theme} onSetTheme={(value) => theme = value} />
          </div>
        {/if}
        {/key}
      </div>
    </div>

    <div class="player-bar-wrap">
      <PlayerBar onOpenSheet={openSheet} />
    </div>
  </div>
</main>

<LyricsPage show={showSheet} onClose={closeSheet} />
<LoginOverlay showLogin={showLogin} onClose={() => showLogin = false} />
