<script>
  import { ncm } from './lib/api/client.js'
  import { player, getLocalHistory } from './lib/stores/player.svelte.js'
  import { auth } from './lib/stores/auth.svelte.js'
  import { extractColor } from './lib/player/colors.js'
  import { formatDuration, formatPlayCount } from './lib/format.js'
  import Sidebar from './lib/components/Sidebar.svelte'
  import PlayerBar from './lib/components/PlayerBar.svelte'
  import LyricsPage from './lib/components/LyricsPage.svelte'
  import LoginOverlay from './lib/components/LoginOverlay.svelte'
  import Spinner from './lib/components/Spinner.svelte'
  import { slide } from 'svelte/transition'

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

        userPlaylists = allPls.filter(pl => pl.creator?.userId !== uid && pl.special !== 2).map(pl => ({
          id: pl.id,
          name: pl.name,
          picUrl: pl.coverImgUrl,
          playCount: pl.playCount,
          trackCount: pl.trackCount,
        }))

        subcount = subRes?.data || subRes

        const likedPl = allPls.find(pl => pl.creator?.userId === uid && pl.special === 2)
        if (likedPl) {
          likedPlaylist = {
            id: likedPl.id,
            name: likedPl.name,
            picUrl: likedPl.coverImgUrl,
            trackCount: likedPl.trackCount,
          }
        }

        const weeklyPl = allPls.find(pl => pl.creator?.userId === uid && pl.special === 0 && pl.name?.includes('听歌排行'))
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
      <div class="content-inner">
        {#key activeView}
          {#if activeView === 'home'}
          <div transition:slide={{ duration: 280, axis: 'x' }}>
            {#if auth.isLoggedIn}
              <div class="profile-header-banner">
                <div class="profile-banner-bg" style="background-image:url({(auth.user?.avatarUrl || '') + `?param=600y300&_=${refreshKey}`})"></div>
                <div class="profile-banner-overlay"></div>
                <div class="profile-banner-content">
                  <div class="profile-avatar-large">
                    {#if auth.user?.avatarUrl}
                      <img src={auth.user.avatarUrl + `?param=200y200&_=${refreshKey}`} alt="" referrerpolicy="no-referrer" />
                    {:else}
                      <div class="profile-avatar-placeholder-large">{auth.user?.nickname?.charAt(0) || '?'}</div>
                    {/if}
                  </div>
                  <div class="profile-banner-info">
                    <h1 class="profile-name">{auth.user?.nickname || '用户'}</h1>
                    <div class="profile-stats-inline">
                      <span class="stat-item"><strong>{subcount?.followeds ?? auth.user?.followeds ?? 0}</strong> 关注</span>
                      <span class="stat-item"><strong>{subcount?.follows ?? auth.user?.follows ?? 0}</strong> 粉丝</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="music-taste-section">
                <div class="playlist-section-header">
                  <div class="playlist-section-title">音乐品味</div>
                </div>
                <div class="music-taste-grid">
                  <div class="music-taste-card" onclick={() => weeklyPlaylist && goPlaylist(weeklyPlaylist.id)}>
                    <div class="taste-cover" style="background-image:url({(weeklyPlaylist?.picUrl || likedPlaylist?.picUrl || auth.user?.avatarUrl || '') + '?param=400y400'})"></div>
                    <div class="taste-overlay"></div>
                    {#if weeklyPlaylist}
                      <div class="taste-badge">
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        {formatPlayCount(weeklyPlaylist.playCount || 0)}
                      </div>
                    {/if}
                    <div class="taste-info">
                      <div class="taste-label">{auth.user?.nickname || '你'}的听歌排行</div>
                      <div class="taste-sub">累计播放{subcount?.playedCount ? formatPlayCount(subcount.playedCount) : '0'}首歌曲</div>
                    </div>
                  </div>
                  <div class="music-taste-card" onclick={() => likedPlaylist && goPlaylist(likedPlaylist.id)}>
                    <div class="taste-cover" style="background-image:url({(likedPlaylist?.picUrl || '') + '?param=400y400'})"></div>
                    <div class="taste-overlay"></div>
                    <div class="taste-heart">
                      <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity="0.15"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </div>
                    <div class="taste-info">
                      <div class="taste-label">{auth.user?.nickname || '你'}喜欢的音乐</div>
                      <div class="taste-sub">{likedPlaylist?.trackCount ?? subcount?.likedCount ?? 0}首歌曲</div>
                    </div>
                  </div>
                </div>
              </div>

              {#if loading}
                <div class="loading-state">
                  <Spinner size="lg" label="加载中" />
                </div>
              {:else}
                {#if userPlaylists.length > 0}
                  <div class="playlist-section">
                    <div class="playlist-section-header">
                      <div class="playlist-section-title">收藏的歌单</div>
                    </div>
                    <div class="pl-square-scroll">
                      <div class="pl-square-track">
                        {#each userPlaylists as pl}
                          <div class="pl-square-card" onclick={() => goPlaylist(pl.id)}>
                            <div class="cover-wrap">
                              {#if pl.picUrl}
                                <img class="cover" src={pl.picUrl + '?param=200y200'} alt="" loading="lazy" />
                              {:else}
                                <div class="cover" style="background:linear-gradient(135deg,var(--accent),#8b5cf6)"></div>
                              {/if}
                              <div class="badge">
                                <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                {formatPlayCount(pl.playCount)}
                              </div>
                            </div>
                            <div class="pl-name">{pl.name}</div>
                            <div class="pl-meta">{pl.trackCount} 首</div>
                          </div>
                        {/each}
               </div>
             </div>
           </div>
         {/if}

                {#if userPlaylists.length === 0 && !loading}
                  <div class="empty-state">
                    <p>这里空空的，还没有任何歌单</p>
                  </div>
                {/if}
              {/if}
            {:else}
              <div class="profile-logged-out">
                <div class="large-icon">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <p>登录后查看个人主页和音乐品味</p>
                <button class="login-prompt-btn" onclick={() => showLogin = true}>登录</button>
              </div>
            {/if}
          </div>

        {:else if activeView === 'playlist'}
          <div class="fade-in">
            {#key playlistDetail?.id || selectedId}
            {#if playlistDetail}
              <div class="hero-section" style="background: linear-gradient(135deg, {heroColor}44, transparent 70%);margin: -24px -32px 0;padding:32px;border-radius:0;">
                <button class="hero-back-btn" onclick={goBack} title="返回">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                {#if playlistDetail.coverImgUrl || playlistDetail.picUrl}
                  <img class="hero-cover" src={playlistDetail.coverImgUrl || playlistDetail.picUrl} alt={playlistDetail.name} />
                {:else}
                  <div class="hero-cover" style="background:linear-gradient(135deg,{heroColor},#8b5cf6)"></div>
                {/if}
                <div class="hero-info">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-secondary);margin-bottom:4px;">歌单</div>
                  <h1>{playlistDetail.name}</h1>
                  <div class="hero-meta">{playlistDetail.creator?.nickname ?? ''} · {playlistDetail.trackCount ?? 0} 首</div>
                  {#if playlistDetail.description}
                    <div class="hero-desc">{playlistDetail.description}</div>
                  {/if}
                  <button class="hero-play-btn" onclick={playAll}>播放全部</button>
                </div>
              </div>
              <table class="track-table">
                <thead>
                  <tr>
                    <th class="col-num">#</th>
                    <th>标题</th>
                    <th>歌手</th>
                    <th class="col-album">专辑</th>
                    <th class="col-dur">时长</th>
                  </tr>
                </thead>
                <tbody>
                  {#each playlistDetail.tracks ?? [] as track, i}
                    <tr class:active={player.id === track.id} onclick={() => playTrack(track.id)}>
                      <td class="col-num">{i + 1}</td>
                      <td class="col-title">{track.name}</td>
                      <td class="col-artist">{track.artists?.map(a => a.name).join(', ') || track.ar?.map(a => a.name).join(', ') || ''}</td>
                      <td class="col-album">{track.album?.name || track.al?.name || ''}</td>
                      <td class="col-dur">{formatDuration(track.duration || track.dt || 0)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
            {/key}
          </div>

        {:else if activeView === 'explore'}
          <div class="explore-page fade-in">
            {#if exploreLoading && exploreBanners.length === 0}
              <div class="loading-state" style="padding:80px 0">
                <Spinner size="lg" label="加载中" />
              </div>
            {:else}
              <!-- 1. 精品推荐 (Banner / 编辑推荐) -->
              {#if exploreBanners.length > 0}
                <div class="explore-section explore-banners">
                  <div class="explore-section-header">
                    <h2 class="explore-section-title">精品推荐</h2>
                  </div>
                  <div class="banner-scroll">
                    {#each exploreBanners as banner (banner.id)}
                      <div class="banner-card" onclick={() => handleBannerClick(banner)}>
                        <div class="banner-cover">
                          <img src={banner.pic + '?param=600y300'} alt={banner.title} loading="lazy" />
                          <div class="banner-overlay"></div>
                          <div class="banner-info">
                            <div class="banner-title">{banner.title}</div>
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- 2. 为你推荐 (个性化歌单) -->
              {#if explorePersonalized.length > 0}
                <div class="explore-section">
                  <div class="explore-section-header">
                    <h2 class="explore-section-title">为你推荐</h2>
                  </div>
                  <div class="card-scroll">
                    {#each explorePersonalized as pl (pl.id)}
                    <div class="explore-card" onclick={() => goPlaylist(pl.id)}>
                      <div class="explore-card-cover">
                        {#if pl.picUrl}
                          <img src={pl.picUrl + '?param=400y400'} alt={pl.name} loading="lazy" />
                        {:else}
                          <div class="explore-card-placeholder">
                            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                          </div>
                        {/if}
                        <div class="explore-card-play-btn">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                      <div class="explore-card-info">
                        <div class="explore-card-name">{pl.name}</div>
                        <div class="explore-card-meta">{pl.trackCount} 首</div>
                      </div>
                    </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- 3. 热门歌单 (Top Playlists) -->
              {#if exploreTopPlaylists.length > 0}
                <div class="explore-section">
                  <div class="explore-section-header">
                    <h2 class="explore-section-title">热门歌单</h2>
                  </div>
                  <div class="square-grid">
                    {#each exploreTopPlaylists as pl (pl.id)}
                    <div class="square-card" onclick={() => goPlaylist(pl.id)}>
                      <div class="square-card-cover">
                        {#if pl.picUrl}
                          <img src={pl.picUrl + '?param=400y400'} alt={pl.name} loading="lazy" />
                        {:else}
                          <div class="square-card-placeholder">
                            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                          </div>
                        {/if}
                        <div class="square-card-play-btn">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                      <div class="square-card-info">
                        <div class="square-card-name">{pl.name}</div>
                        {#if pl.updateFrequency}
                          <div class="square-card-meta">{pl.updateFrequency}</div>
                        {/if}
                      </div>
                    </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- 4. 新歌精选 (推荐歌曲) -->
              {#if exploreRecommendSongs.length > 0}
                <div class="explore-section">
                  <div class="explore-section-header">
                    <h2 class="explore-section-title">新歌精选</h2>
                  </div>
                  <div class="card-scroll">
                    {#each exploreRecommendSongs as track (track.id)}
                    <div class="song-card" onclick={() => playExploreSong(track)}>
                      <div class="song-card-cover">
                        {#if track.picUrl}
                          <img src={track.picUrl + '?param=200y200'} alt={track.name} loading="lazy" />
                        {:else}
                          <div class="song-card-placeholder">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                          </div>
                        {/if}
                        <div class="song-card-play-btn">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                      <div class="song-card-info">
                        <div class="song-card-name">{track.name}</div>
                        <div class="song-card-artist">{(track.ar || []).map(a => a.name).join(', ')}</div>
                      </div>
                    </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- 5. 排行榜 (Toplists) -->
              {#if toplists.length > 0}
                <div class="explore-section">
                  <div class="explore-section-header">
                    <h2 class="explore-section-title">排行榜</h2>
                  </div>
                  <div class="square-grid square-grid-sm">
                    {#each toplists.slice(0, 8) as ranking (ranking.id)}
                    <div class="square-card" onclick={() => goPlaylist(ranking.id)}>
                      <div class="square-card-cover">
                        {#if ranking.coverImgUrl}
                          <img src={ranking.coverImgUrl + '?param=400y400'} alt={ranking.name} loading="lazy" />
                        {:else}
                          <div class="square-card-placeholder">
                            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                          </div>
                        {/if}
                        <div class="square-card-play-btn">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                      <div class="square-card-info">
                        <div class="square-card-name">{ranking.name}</div>
                        {#if ranking.updateFrequency}
                          <div class="square-card-meta">{ranking.updateFrequency}</div>
                        {/if}
                      </div>
                    </div>
                    {/each}
                  </div>
                </div>
              {/if}

            {/if}
          </div>

        {:else if activeView === 'library'}
          <div class="fade-in">
            <div class="page-header">
              <h1>我的收藏</h1>
              <div class="subtitle">收藏的歌曲和歌单</div>
            </div>
            <p style="color:var(--text-secondary);">收藏页面开发中...</p>
          </div>

        {:else if activeView === 'fm'}
          <div class="fade-in">
            <div class="page-header">
              <h1>私人FM</h1>
              <div class="subtitle">为你推荐</div>
            </div>
            <p style="color:var(--text-secondary);">私人FM页面开发中...</p>
          </div>

        {:else if activeView === 'cloud'}
          <div class="fade-in">
            <div class="page-header">
              <h1>音乐云盘</h1>
              <div class="subtitle">我的音乐云盘</div>
            </div>
            <p style="color:var(--text-secondary);">音乐云盘页面开发中...</p>
          </div>

        {:else if activeView === 'recent'}
          <div class="fade-in">
            <div class="page-header">
              <h1>最近播放</h1>
              <div class="subtitle">共 {recentTracks.length} 首歌曲{#if !auth.isLoggedIn} · 本地记录{/if}</div>
            </div>
            {#if recentLoading}
              <div class="loading-state">
                <Spinner size="lg" label="加载最近播放" />
              </div>
            {:else if recentTracks.length > 0}
              <div class="recent-actions">
                <button class="play-all-btn" onclick={playRecentAll}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  播放全部
                </button>
              </div>
              <table class="track-table">
                <thead>
                  <tr>
                    <th class="col-num">#</th>
                    <th class="col-cover"></th>
                    <th>标题</th>
                    <th>歌手</th>
                    <th class="col-album">专辑</th>
                    <th class="col-dur">时长</th>
                  </tr>
                </thead>
                <tbody>
                  {#each recentTracks as track, i}
                    <tr class:active={player.id === track.id} onclick={() => playRecentTrack(track)}>
                      <td class="col-num">{i + 1}</td>
                      <td class="col-cover">
                        {#if track.picUrl}
                          <img class="track-cover-img" src={track.picUrl + '?param=80y80'} alt="" loading="lazy" />
                        {:else}
                          <div class="track-cover-placeholder">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                          </div>
                        {/if}
                      </td>
                      <td class="col-title">{track.name}</td>
                      <td class="col-artist">{track.artists?.map(a => a.name).join(', ') || track.ar?.map(a => a.name).join(', ') || ''}</td>
                      <td class="col-album">{track.album?.name || track.al?.name || ''}</td>
                      <td class="col-dur">{formatDuration(track.duration || track.dt || 0)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <div class="empty-state">
                <div class="large-icon">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <p>还没有播放记录</p>
                <p style="font-size:13px;color:var(--text-tertiary);margin-top:4px;">去首页听听歌吧</p>
              </div>
            {/if}
          </div>

        {:else if activeView === 'liked'}
          <div class="fade-in">
            <div class="page-header">
              <h1>我喜欢的音乐</h1>
              <div class="subtitle">我喜欢过的歌曲</div>
            </div>
            <p style="color:var(--text-secondary);">我喜欢的音乐页面开发中...</p>
          </div>

        {:else if activeView === 'settings'}
          <div class="fade-in">
            <div class="page-header">
              <h1>设置</h1>
              <div class="subtitle">主题和其他设置</div>
            </div>
            <div style="margin-top:16px;">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
                <div>
                  <div style="font-size:14px;font-weight:500;">主题模式</div>
                  <div style="font-size:12px;color:var(--text-tertiary);">切换明暗主题</div>
                </div>
                <div style="display:flex;gap:8px;">
                  <button
                    style="padding:6px 16px;border-radius:16px;font-size:13px;font-weight:500;transition:all 0.15s;{theme === 'light' ? 'background:var(--accent);color:#fff;' : 'background:var(--bg-hover);color:var(--text-secondary);'}"
                    onclick={() => theme = 'light'}
                  >浅色</button>
                  <button
                    style="padding:6px 16px;border-radius:16px;font-size:13px;font-weight:500;transition:all 0.15s;{theme === 'dark' ? 'background:var(--accent);color:#fff;' : 'background:var(--bg-hover);color:var(--text-secondary);'}"
                    onclick={() => theme = 'dark'}
                  >深色</button>
                </div>
              </div>
            </div>
          </div>
        {/if}
        {/key}
      </div>
    </div>

    <PlayerBar onOpenSheet={openSheet} />
  </div>
</main>

<LyricsPage show={showSheet} onClose={closeSheet} />
<LoginOverlay showLogin={showLogin} onClose={() => showLogin = false} />
