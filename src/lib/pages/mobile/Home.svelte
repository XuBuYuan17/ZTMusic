<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { player } from '../../stores/player.svelte.js'
  import { ncm } from '../../api/client.js'
  import { coverUrl } from '../../utils/image.js'
  import { extractCover } from '../../utils/normalize.js'
  import { loadHomeData } from '../../services/home.js'
  import { loadDailyHistoryData } from '../../services/dailyHistory.js'
  import Icon from '../../components/ui/Icon.svelte'
  import Spinner from '../../components/Spinner.svelte'
  import ArtistNames from '../../components/ArtistNames.svelte'

  let {
    onNavigate,
    onOpenLogin,
    onOpenPlaylist,
    onOpenArtist,
    onOpenAlbum,
    onSearch,
  } = $props()

  let loading = $state(true)
  let error = $state('')
  let recentTracks = $state([])
  let userPlaylists = $state([])
  let subcount = $state(null)
  let likedPlaylist = $state(null)
  let weeklyPlaylist = $state(null)
  let recommendPlaylists = $state([])
  let dailyHistoryDates = $state([])
  let dailyHistorySongs = $state([])
  let selectedDailyDate = $state('')

  let _requestId = 0

  async function load() {
    const rid = ++_requestId; loading = true; error = ''
    userPlaylists = []; subcount = null; likedPlaylist = null; weeklyPlaylist = null
    recommendPlaylists = []; dailyHistoryDates = []; dailyHistorySongs = []; selectedDailyDate = ''
    try {
      if (!auth.isLoggedIn) return
      const [data, dailyHistory] = await Promise.all([
        loadHomeData(ncm, auth.user),
        loadDailyHistoryData(ncm),
      ])
      if (rid !== _requestId) return
      userPlaylists = data.userPlaylists; likedPlaylist = data.likedPlaylist
      weeklyPlaylist = data.weeklyPlaylist; recentTracks = data.recentTracks
      recommendPlaylists = data.recommendPlaylists
      dailyHistoryDates = dailyHistory.dates; dailyHistorySongs = dailyHistory.songs
      selectedDailyDate = dailyHistory.selectedDate
      data.subcountPromise?.then(v => { if (rid === _requestId) subcount = v }).catch(() => {})
      data.weeklyPromise?.then(v => {
        if (rid !== _requestId) return
        weeklyPlaylist = v.weeklyPlaylist
        if (v.recentTracks.length) recentTracks = v.recentTracks
      }).catch(() => {})
      data.recommendPromise?.then(v => { if (rid === _requestId) recommendPlaylists = v }).catch(() => {})
    } catch (e) { if (rid === _requestId) error = e?.message || '加载失败' }
    finally { if (rid === _requestId) loading = false }
  }

  $effect(() => { if (auth.isLoggedIn) load() })
  $effect(() => {
    if (!auth.isLoggedIn) {
      loading = false; userPlaylists = []; recentTracks = []
      dailyHistoryDates = []; dailyHistorySongs = []; selectedDailyDate = ''
    }
  })

  function playRecentTrack(track) {
    const idx = recentTracks.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(recentTracks, idx)
    else player.playTrack(track, 0)
  }

  function openLiked() {
    if (likedPlaylist) onOpenPlaylist?.(likedPlaylist.id, true, likedPlaylist)
  }

  function coverOf(track) {
    return track?.picUrl || extractCover(track)
  }

  function formatDateLabel(date) {
    if (!date) return '历史日推'
    const parts = String(date).split('-')
    return parts.length === 3 ? `${parts[1]}.${parts[2]}` : date
  }

  const heroPlaylist = $derived(recommendPlaylists.length ? recommendPlaylists[0] : null)
  const greeting = $derived((() => {
    const h = new Date().getHours()
    if (h < 6) return '夜深了'
    if (h < 12) return '早上好'
    if (h < 14) return '中午好'
    if (h < 18) return '下午好'
    if (h < 22) return '晚上好'
    return '夜深了'
  })())
</script>

<div class="m-page m-home">
  <header class="m-page-header">
    <div>
      <span class="m-page-kicker">{greeting}</span>
      <h1>{auth.user?.nickname || '首页'}</h1>
    </div>
  </header>

  <!-- 搜索入口 -->
  <button class="m-search-pill" onclick={() => onSearch?.()}>
    <Icon name="search" size={16} />
    <span>搜索歌曲、歌手、歌单</span>
  </button>

  {#if !auth.isLoggedIn}
    <div class="m-empty-state small">
      <Icon name="heart" size={48} />
      <h2>登录开启音乐之旅</h2>
      <p>查看你的听歌排行、喜欢的音乐和收藏的歌单</p>
      <button class="m-primary-btn" onclick={() => onOpenLogin?.()}>立即登录</button>
    </div>
  {:else if loading && !recentTracks.length && !recommendPlaylists.length}
    <div class="m-loading"><Spinner size="md" /></div>
  {:else if error && !recentTracks.length && !heroPlaylist}
    <div class="m-empty-state small">
      <h2>加载失败</h2>
      <p>{error}</p>
      <button class="m-primary-btn" onclick={load}>重试</button>
    </div>
  {:else}
    <!-- Hero 大卡：今日推荐歌单 -->
    {#if heroPlaylist}
      <section class="m-section">
        <button class="m-hero-card" onclick={() => onOpenPlaylist?.(heroPlaylist.id, true, heroPlaylist)}>
          {#if heroPlaylist.picUrl}<img src={coverUrl(heroPlaylist.picUrl, 600)} alt={heroPlaylist.name} loading="lazy" referrerpolicy="no-referrer" />{/if}
          <div class="m-hero-copy">
            <small>今日推荐</small>
            <strong>{heroPlaylist.name}</strong>
          </div>
        </button>
      </section>
    {/if}

    <!-- 快速入口 2x2 -->
    <section class="m-section">
      <div class="m-quick-grid">
        <button class="m-quick-tile m-quick-tile--liked" onclick={openLiked} disabled={!likedPlaylist}>
          <Icon name="heart-filled" size={22} />
          <span>喜欢的音乐</span>
          <small>{likedPlaylist?.trackCount ?? subcount?.likedCount ?? 0} 首</small>
        </button>
        <button class="m-quick-tile" onclick={() => onNavigate?.('recent')}>
          <Icon name="clock" size={22} />
          <span>最近播放</span>
          <small>{recentTracks.length} 首</small>
        </button>
        <button class="m-quick-tile" onclick={() => onNavigate?.('dailyHistory')}>
          <Icon name="calendar" size={22} />
          <span>历史日推</span>
          <small>{selectedDailyDate ? formatDateLabel(selectedDailyDate) : '每日推荐'}</small>
        </button>
        <button class="m-quick-tile" onclick={() => onNavigate?.('library')}>
          <Icon name="list" size={22} />
          <span>我的歌单</span>
          <small>{userPlaylists.length} 个</small>
        </button>
      </div>
    </section>

    <!-- 推荐歌单横向滚动 -->
    {#if recommendPlaylists.length}
      <section class="m-section">
        <div class="m-section-head">
          <h2>推荐歌单</h2>
        </div>
        <div class="m-rail m-cover-rail">
          {#each recommendPlaylists.slice(0, 12) as pl (pl.id)}
            <button class="m-cover-card" onclick={() => onOpenPlaylist?.(pl.id, true, pl)}>
              <div class="m-cover-wrap">
                {#if pl.picUrl}<img src={coverUrl(pl.picUrl, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <strong class="m-cover-title">{pl.name}</strong>
              <span class="m-cover-sub">{pl.copywriter || (pl.trackCount ? `${pl.trackCount} 首歌曲` : '歌单')}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- 最近播放列表 -->
    {#if recentTracks.length}
      <section class="m-section">
        <div class="m-section-head">
          <h2>最近播放</h2>
          <button class="m-section-action" onclick={() => onNavigate?.('recent')}>查看全部</button>
        </div>
        <div class="m-list">
          {#each recentTracks.slice(0, 10) as track (track.id)}
            <button class="m-list-item" onclick={() => playRecentTrack(track)}>
              <div class="m-list-cover">
                {#if coverOf(track)}<img src={coverUrl(coverOf(track), 200)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <div class="m-list-info">
                <strong>{track.name}</strong>
                <span><ArtistNames artists={track.ar || track.artists || []} {onOpenArtist} fallback="未知艺人" /></span>
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- 每日推荐日期芯片 -->
    {#if dailyHistoryDates.length}
      <section class="m-section">
        <div class="m-section-head">
          <h2>历史日推</h2>
          <button class="m-section-action" onclick={() => onNavigate?.('dailyHistory')}>查看全部</button>
        </div>
        <div class="m-rail">
          {#each dailyHistoryDates.slice(0, 14) as date (date)}
            <button
              class="m-date-chip"
              class:active={date === selectedDailyDate}
              onclick={() => onNavigate?.('dailyHistory', { date })}
            >
              {formatDateLabel(date)}
            </button>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>
