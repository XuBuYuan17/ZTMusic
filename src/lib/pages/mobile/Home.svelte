<script>
  import { player } from '../../stores/player.svelte.js'
  import { auth } from '../../stores/auth.svelte.js'
  import { ncm } from '../../api/client.js'
  import { loadHomeData } from '../../services/home.js'
  import { loadDailyHistoryData } from '../../services/dailyHistory.js'
  import { coverUrl } from '../../utils/image.js'
  import { extractCover } from '../../utils/normalize.js'
  import Spinner from '../../components/Spinner.svelte'
  import Icon from '../../components/ui/Icon.svelte'

  let { onOpenPlaylist, onOpenArtist, onOpenLogin, onNavigate } = $props()

  let loading = $state(false)
  let error = $state('')
  let userPlaylists = $state([])
  let likedPlaylist = $state(null)
  let weeklyPlaylist = $state(null)
  let subcount = $state(null)
  let recommendPlaylists = $state([])
  let recentTracks = $state([])
  let dailyHistorySongs = $state([])
  let selectedDailyDate = $state('')
  let _requestId = 0

  async function load() {
    const rid = ++_requestId
    if (!auth.isLoggedIn) return
    loading = true
    error = ''
    userPlaylists = []
    likedPlaylist = null
    weeklyPlaylist = null
    subcount = null
    recommendPlaylists = []
    recentTracks = []
    dailyHistorySongs = []
    selectedDailyDate = ''
    try {
      const [data, dailyHistory] = await Promise.all([
        loadHomeData(ncm, auth.user),
        loadDailyHistoryData(ncm),
      ])
      if (rid !== _requestId) return
      userPlaylists = data.userPlaylists
      likedPlaylist = data.likedPlaylist
      weeklyPlaylist = data.weeklyPlaylist
      recommendPlaylists = data.recommendPlaylists
      recentTracks = data.recentTracks
      dailyHistorySongs = dailyHistory.songs
      selectedDailyDate = dailyHistory.selectedDate
      data.subcountPromise?.then(v => {
        if (rid === _requestId) subcount = v
      }).catch(() => {})
      data.weeklyPromise?.then(v => {
        if (rid !== _requestId) return
        weeklyPlaylist = v.weeklyPlaylist
        if (v.recentTracks.length) recentTracks = v.recentTracks
      }).catch(() => {})
      data.recommendPromise?.then(v => {
        if (rid === _requestId) recommendPlaylists = v
      }).catch(() => {})
    } catch (e) { if (rid === _requestId) error = e?.message || '加载失败' }
    finally { if (rid === _requestId) loading = false }
  }

  $effect(() => { if (auth.isLoggedIn) load() })

  function openLiked() {
    if (likedPlaylist) onOpenPlaylist?.(likedPlaylist.id, true, likedPlaylist)
  }

  function playRecentTrack(track) {
    const index = recentTracks.findIndex(item => item.id === track.id)
    if (index >= 0) player.playQueue(recentTracks, index)
    else player.playTrack(track, 0)
  }

  function artistsText(track) {
    return track.artistName || (track.ar || track.artists || []).map(artist => artist.name).filter(Boolean).join(' / ') || '未知艺人'
  }

  function coverOf(track) {
    return track?.picUrl || extractCover(track)
  }

  function formatDateLabel(date) {
    if (!date) return '历史日推'
    const parts = String(date).split('-')
    return parts.length === 3 ? `${parts[1]}.${parts[2]}` : date
  }

  const heroPlaylist = $derived(recommendPlaylists[0] || null)
  const profile = $derived(auth.user || {})
  const profileStats = $derived([
    { label: '喜欢', value: likedPlaylist?.trackCount ?? subcount?.likedCount ?? 0 },
    { label: '歌单', value: (userPlaylists.length || 0) + (likedPlaylist ? 1 : 0) },
    { label: '最近', value: recentTracks.length },
  ])
  const stationCards = $derived([
    {
      icon: 'calendar',
      title: '历史日推',
      value: dailyHistorySongs.length ? `${formatDateLabel(selectedDailyDate)} · ${dailyHistorySongs.length} 首` : '每日推荐回顾',
      action: () => onNavigate?.('dailyHistory'),
    },
    {
      icon: 'heart',
      title: '喜欢的音乐',
      value: `${likedPlaylist?.trackCount ?? subcount?.likedCount ?? 0} 首歌曲`,
      action: openLiked,
    },
    {
      icon: 'clock',
      title: '最近播放',
      value: recentTracks.length ? `${recentTracks.length} 首记录` : '继续听',
      action: () => onNavigate?.('recent'),
    },
  ])
</script>

<div class="m-page m-home">
  <header class="m-page-header">
    <h1>主页</h1>
  </header>

  {#if !auth.isLoggedIn}
    <div class="m-empty-state">
      <Icon name="home" size={48} />
      <h2>登录查看每日推荐</h2>
      <p>登录后为你定制专属歌单与最近播放</p>
      <button class="m-primary-btn" onclick={() => onOpenLogin?.()}>立即登录</button>
    </div>
  {:else if loading && userPlaylists.length === 0 && recommendPlaylists.length === 0 && recentTracks.length === 0}
    <div class="m-loading"><Spinner size="md" /></div>
  {:else}
    <section class="m-section">
      <div class="m-home-profile">
        <div class="m-home-avatar">
          {#if profile.avatarUrl}<img src={coverUrl(profile.avatarUrl, 160)} alt="" referrerpolicy="no-referrer" />{/if}
        </div>
        <div class="m-home-identity">
          <small>{auth.vipLabel || '我的账号'}</small>
          <strong>{profile.nickname || '用户'}</strong>
        </div>
        <div class="m-home-stats" aria-label="账号概览">
          {#each profileStats as stat}
            <div>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- 日推大卡 -->
    {#if heroPlaylist}
      <section class="m-section">
        <button class="m-hero-card" onclick={() => onOpenPlaylist?.(heroPlaylist.id, true, heroPlaylist)}>
          {#if heroPlaylist.picUrl || auth.user?.avatarUrl}
            <img src={coverUrl(heroPlaylist.picUrl || auth.user.avatarUrl, 600)} alt="" loading="lazy" referrerpolicy="no-referrer" />
          {/if}
          <div class="m-hero-copy">
            <small>现在就听 · 今日精选</small>
            <strong>{heroPlaylist.name}</strong>
          </div>
        </button>
      </section>
    {/if}

    <section class="m-section">
      <div class="m-section-head"><h2>为你整理</h2></div>
      <div class="m-library-collection">
        {#each stationCards as card}
          <button class="m-library-row" onclick={() => card.action?.()}>
            <span class="m-library-row-icon">
              <Icon name={card.icon} size={20} />
            </span>
            <div class="m-list-info">
              <strong>{card.title}</strong>
              <span>{card.value}</span>
            </div>
            <Icon name="chevron-right" size={18} />
          </button>
        {/each}
      </div>
    </section>

    {#if userPlaylists.length}
      <section class="m-section">
        <div class="m-section-head"><h2>你的资料库</h2></div>
        <div class="m-library-collection">
          {#each userPlaylists.slice(0, 6) as pl, index (pl.id)}
            <button class="m-library-row" onclick={() => onOpenPlaylist?.(pl.id, true, pl)}>
              <span class="m-library-rank">{String(index + 1).padStart(2, '0')}</span>
              <div class="m-list-info">
                <strong>{pl.name}</strong>
                <span>{pl.trackCount || 0} 首</span>
              </div>
              <Icon name="chevron-right" size={18} />
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- 最近播放横滑 -->
    {#if recentTracks.length}
      <section class="m-section">
        <div class="m-section-head"><h2>继续播放</h2></div>
        <div class="m-rail m-cover-rail">
          {#each recentTracks.slice(0, 12) as track (track.id)}
            <button class="m-cover-card" onclick={() => playRecentTrack(track)}>
              <div class="m-cover-wrap">
                {#if coverOf(track)}<img src={coverUrl(coverOf(track), 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <strong class="m-cover-title">{track.name}</strong>
              <span class="m-cover-sub">{artistsText(track)}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- 推荐歌单 2 列 -->
    {#if recommendPlaylists.length > 1}
      <section class="m-section">
        <div class="m-section-head"><h2>为你推荐</h2></div>
        <div class="m-rail m-cover-rail">
          {#each recommendPlaylists.slice(1, 9) as pl (pl.id)}
            <button class="m-cover-card" onclick={() => onOpenPlaylist?.(pl.id, true, pl)}>
              <div class="m-cover-wrap">
                {#if pl.picUrl}<img src={coverUrl(pl.picUrl, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <strong class="m-cover-title">{pl.name}</strong>
              <span class="m-cover-sub">{pl.playCountText || '歌单'}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if error}
      <div class="m-empty-state small"><p>{error}</p></div>
    {/if}
  {/if}
</div>
