<script>
  import { slide } from 'svelte/transition'
  import { auth } from '../../stores/auth.svelte.js'
  import { player } from '../../stores/player.svelte.js'
  import { ncm } from '../../api/client.js'
  import { loadHomeData } from '../../services/home.js'
  import { coverUrl } from '../../utils/image.js'
  import { extractCover } from '../../utils/normalize.js'
  import ErrorBlock from '../../components/ui/ErrorBlock.svelte'
  import SongListActions from '../../components/SongListActions.svelte'

  let {
    onNavigate,
    onOpenLogin,
    onOpenPlaylist,
    onOpenArtist,
    onOpenAlbum,
    onOpenFollows,
  } = $props()

  let loading = $state(true)
  let error = $state('')
  let recentTracks = $state([])
  let userPlaylists = $state([])
  let subcount = $state(null)
  let likedPlaylist = $state(null)
  let weeklyPlaylist = $state(null)
  let recommendPlaylists = $state([])

  let songActions = $state(null)
  let _requestId = 0

  async function load() {
    const rid = ++_requestId; loading = true; error = ''
    userPlaylists = []; subcount = null; likedPlaylist = null; weeklyPlaylist = null; recommendPlaylists = []
    try {
      if (!auth.isLoggedIn) return
      const data = await loadHomeData(ncm, auth.user)
      if (rid !== _requestId) return
      userPlaylists = data.userPlaylists; likedPlaylist = data.likedPlaylist
      weeklyPlaylist = data.weeklyPlaylist; recentTracks = data.recentTracks; recommendPlaylists = data.recommendPlaylists
      data.subcountPromise?.then(v => { if (rid === _requestId) subcount = v }).catch(() => {})
      data.weeklyPromise?.then(v => { if (rid !== _requestId) return; weeklyPlaylist = v.weeklyPlaylist; if (v.recentTracks.length) recentTracks = v.recentTracks }).catch(() => {})
      data.recommendPromise?.then(v => { if (rid === _requestId) recommendPlaylists = v }).catch(() => {})
    } catch (e) { if (rid === _requestId) error = e?.message || '加载失败' }
    finally { if (rid === _requestId) loading = false }
  }

  function playRecentTrack(track) {
    const idx = recentTracks.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(recentTracks, idx)
    else player.playTrack(track, 0)
  }

  $effect(() => { if (auth.isLoggedIn) load() })

  $effect(() => {
    if (!auth.isLoggedIn) { loading = false; userPlaylists = []; recentTracks = [] }
  })

  function handleCardKeydown(event, action) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action?.()
    }
  }

  function openLiked() {
    if (likedPlaylist) onOpenPlaylist?.(likedPlaylist.id, true, likedPlaylist)
  }

  function artistsOf(track) {
    return track.ar || track.artists || []
  }

  function coverOf(track) {
    return track?.picUrl || extractCover(track)
  }

  const heroReady = $derived(recommendPlaylists.length > 0)
  const heroPlaylist = $derived(heroReady ? recommendPlaylists[0] : null)
  const heroImage = $derived(auth.user?.avatarUrl || '')
  const stationCards = $derived([
    {
      title: '关注列表',
      label: 'Social',
      value: '查看关注与粉丝',
      accent: 'rank',
      action: () => onOpenFollows?.(),
    },
    {
      title: '喜欢的音乐',
      label: 'Favorites',
      value: `${likedPlaylist?.trackCount ?? subcount?.likedCount ?? 0} 首歌曲`,
      accent: 'liked',
      action: openLiked,
    },
    {
      title: '最近播放',
      label: 'Continue',
      value: `${recentTracks.length} 首记录`,
      accent: 'recent',
      action: () => onNavigate?.('recent'),
    },
  ])
</script>

<div class="home-page" transition:slide={{ duration: 280, axis: 'x' }}>
  {#if auth.isLoggedIn}
    <section class="home-listen-hero">
      <div class="home-listen-copy">
        <div class="home-kicker">现在就听</div>
        <h1>为 {auth.user?.nickname || '你'} 准备的声音</h1>
        <p>继续你的播放习惯，或者从今天的推荐里挑一张开始。</p>
        <div class="home-hero-actions">
          {#if heroReady && heroPlaylist}
            <button class="home-primary-btn" onclick={() => onOpenPlaylist?.(heroPlaylist.id, true, heroPlaylist)}>打开今日推荐</button>
          {/if}
          <button class="home-secondary-btn" onclick={() => onNavigate?.('explore')}>浏览发现</button>
        </div>
      </div>

      <button class="home-editorial-card" onclick={() => heroPlaylist && onOpenPlaylist?.(heroPlaylist.id, true, heroPlaylist)} disabled={!heroPlaylist}>
        <div class="home-editorial-bg" style={heroImage ? `background-image:url(${coverUrl(heroImage, 900)})` : ''}></div>
        <div class="home-editorial-shade"></div>
        <div class="home-editorial-content">
          <span>今日精选</span>
          <strong>{heroPlaylist?.name || '你的私人首页'}</strong>
          <em>{heroPlaylist?.copywriter || (heroPlaylist?.trackCount ? `${heroPlaylist.trackCount} 首歌曲` : 'Apple Music 风格推荐流')}</em>
        </div>
      </button>
    </section>

    <section class="home-quick-grid">
      {#each stationCards as card}
        <button class="home-station-card {card.accent}" onclick={() => card.action?.()} disabled={!card.action}>
          <span>{card.label}</span>
          <strong>{card.title}</strong>
          <em>{card.value}</em>
        </button>
      {/each}
    </section>

    <section class="home-dashboard">
        <div class="home-panel home-library-panel">
          <div class="home-section-header compact">
            <div>
              <div class="home-section-eyebrow">Library</div>
              <h2 class="home-section-title">你的资料库</h2>
            </div>
          </div>
          {#if loading && userPlaylists.length === 0}
            <div class="home-track-list" aria-label="加载资料库">
              {#each Array(6) as _, i}
                <div class="home-track-row skeleton-row" style={`--skeleton-delay:${i * 90}ms`}>
                  <span class="home-track-index skeleton-line short"></span>
                  <span class="home-track-cover-ph skeleton-block"></span>
                  <span class="home-track-copy">
                    <strong class="skeleton-line"></strong>
                    <em class="skeleton-line narrow"></em>
                  </span>
                </div>
              {/each}
            </div>
          {:else if userPlaylists.length > 0}
            <div class="home-track-list">
              {#each userPlaylists.slice(0, 6) as pl, i (pl.id)}
                <button class="home-track-row" onclick={() => onOpenPlaylist?.(pl.id, true, pl)}>
                  <span class="home-track-index">{String(i + 1).padStart(2, '0')}</span>
                  {#if pl.picUrl}
                    <img src={coverUrl(pl.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                  {:else}
                    <span class="home-track-cover-ph">♫</span>
                  {/if}
                  <span class="home-track-copy">
                    <strong>{pl.name}</strong>
                    <em>{pl.trackCount} 首</em>
                  </span>
                </button>
              {/each}
            </div>
          {:else}
            <div class="home-panel-empty">收藏的歌单会显示在这里</div>
          {/if}
        </div>

        <div class="home-panel home-recent-panel">
          <div class="home-section-header compact">
            <div>
              <div class="home-section-eyebrow">Recently Played</div>
              <h2 class="home-section-title">继续播放</h2>
            </div>
            <button class="home-section-more" onclick={() => onNavigate?.('recent')}>查看全部</button>
          </div>

          {#if loading && recentTracks.length === 0}
            <div class="home-library-grid" aria-label="加载最近播放">
              {#each Array(6) as _, i}
                <div class="home-library-item skeleton-row" style={`--skeleton-delay:${i * 90}ms`}>
                  <span class="home-track-cover-ph skeleton-block"></span>
                  <span>
                    <strong class="skeleton-line"></strong>
                    <em class="skeleton-line narrow"></em>
                  </span>
                </div>
              {/each}
            </div>
          {:else if recentTracks.length > 0}
            <div class="home-library-grid">
              {#each recentTracks.slice(0, 8) as track, i (track.id)}
                <button class="home-library-item" onclick={() => playRecentTrack(track)} {...songActions?.bindRow(track)}>
                  {#if coverOf(track)}
                    <img src={coverUrl(coverOf(track), 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                  {:else}
                    <span class="home-track-cover-ph">♫</span>
                  {/if}
                  <span>
                    <strong>{track.name}</strong>
                    <em>
                      {#each artistsOf(track) as artist, index (artist.id || artist.name)}
                        {#if index > 0}<span class="artist-sep">/</span>{/if}
                        {#if artist.id}
                          <span class="artist-link" role="button" tabindex="0" onclick={(event) => { event.stopPropagation(); onOpenArtist?.(artist.id) }} onkeydown={(event) => handleCardKeydown(event, () => onOpenArtist?.(artist.id))}>{artist.name}</span>
                        {:else}
                          <span>{artist.name}</span>
                        {/if}
                      {/each}
                    </em>
                  </span>
                </button>
              {/each}
            </div>
          {:else}
            <div class="home-panel-empty">还没有最近播放</div>
          {/if}
        </div>
      </section>

      {#if !loading && userPlaylists.length === 0 && recentTracks.length === 0}
        <div class="home-empty">
          <div class="home-empty-icon">
            <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          <p class="home-empty-text">开始探索音乐吧</p>
          <button class="home-empty-btn" onclick={() => onNavigate?.('explore')}>去发现</button>
        </div>
          {/if}
  {:else}
    <div class="home-logged-out">
      <div class="home-logged-out-icon">
        <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
      <h2 class="home-logged-out-title">登录后开启音乐之旅</h2>
      <p class="home-logged-out-sub">查看你的听歌排行、喜欢的音乐和收藏的歌单</p>
      <button class="home-logged-out-btn" onclick={onOpenLogin}>立即登录</button>
    </div>
  {/if}
  {#if error}
    <ErrorBlock {error} onRetry={load} />
  {/if}

  <SongListActions onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onBindRow={(fn) => { songActions = { bindRow: fn } }} />
</div>
