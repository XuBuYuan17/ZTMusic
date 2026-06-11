<script>
  import { slide } from 'svelte/transition'
  import { auth } from '../stores/auth.svelte.js'
  import { formatPlayCount } from '../format.js'
  import Spinner from '../components/Spinner.svelte'

  let {
    refreshKey = 0,
    loading = false,
    recentTracks = [],
    userPlaylists = [],
    subcount = null,
    likedPlaylist = null,
    weeklyPlaylist = null,
    recommendPlaylists = [],
    onNavigate,
    onOpenLogin,
    onOpenPlaylist,
    onPlayRecentTrack,
    onOpenArtist,
  } = $props()

  function handleCardKeydown(event, action) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action?.()
    }
  }

  function openLiked() {
    if (likedPlaylist) onOpenPlaylist?.(likedPlaylist.id)
  }

  function artistsOf(track) {
    return track.ar || track.artists || []
  }

  function coverOf(track) {
    return track.picUrl || track.al?.picUrl || track.album?.picUrl || ''
  }

  const heroPlaylist = $derived(recommendPlaylists[0] || likedPlaylist || userPlaylists[0] || null)
  const heroImage = $derived(heroPlaylist?.picUrl || weeklyPlaylist?.picUrl || auth.user?.avatarUrl || '')
  const quickPlaylists = $derived(recommendPlaylists.slice(1, 5))
  const stationCards = $derived([
    {
      title: '听歌排行',
      label: 'Replay Mix',
      value: weeklyPlaylist?.topSongName || `${weeklyPlaylist?.trackCount || 0} 首常听`,
      accent: 'rank',
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
          {#if heroPlaylist}
            <button class="home-primary-btn" onclick={() => onOpenPlaylist?.(heroPlaylist.id)}>打开今日推荐</button>
          {/if}
          <button class="home-secondary-btn" onclick={() => onNavigate?.('explore')}>浏览发现</button>
        </div>
      </div>

      <button class="home-editorial-card" onclick={() => heroPlaylist && onOpenPlaylist?.(heroPlaylist.id)} disabled={!heroPlaylist}>
        <div class="home-editorial-bg" style={heroImage ? `background-image:url(${heroImage}?param=900y900)` : ''}></div>
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

    {#if quickPlaylists.length > 0}
      <section class="home-section home-top-picks">
        <div class="home-section-header">
          <div>
            <div class="home-section-eyebrow">Top Picks</div>
            <h2 class="home-section-title">为你推荐</h2>
          </div>
        </div>
        <div class="home-feature-row">
          {#each quickPlaylists as pl (pl.id)}
            <button class="home-feature-card" onclick={() => onOpenPlaylist?.(pl.id)}>
              {#if pl.picUrl}
                <img src={pl.picUrl + '?param=420y420'} alt="" loading="lazy" />
              {:else}
                <span class="home-cover-placeholder">♫</span>
              {/if}
              <span>{pl.name}</span>
              <em>{formatPlayCount(pl.playCount || 0)} 播放</em>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if loading}
      <div class="loading-state">
        <Spinner size="lg" label="加载中" />
      </div>
    {:else}
      <section class="home-dashboard">
        <div class="home-panel home-recent-panel">
          <div class="home-section-header compact">
            <div>
              <div class="home-section-eyebrow">Recently Played</div>
              <h2 class="home-section-title">继续播放</h2>
            </div>
            <button class="home-section-more" onclick={() => onNavigate?.('recent')}>查看全部</button>
          </div>

          {#if recentTracks.length > 0}
            <div class="home-track-list">
              {#each recentTracks.slice(0, 8) as track, i (track.id)}
                <button class="home-track-row" onclick={() => onPlayRecentTrack?.(track)}>
                  <span class="home-track-index">{String(i + 1).padStart(2, '0')}</span>
                  {#if coverOf(track)}
                    <img src={coverOf(track) + '?param=96y96'} alt="" loading="lazy" />
                  {:else}
                    <span class="home-track-cover-ph">♫</span>
                  {/if}
                  <span class="home-track-copy">
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

        <div class="home-panel home-library-panel">
          <div class="home-section-header compact">
            <div>
              <div class="home-section-eyebrow">Library</div>
              <h2 class="home-section-title">你的资料库</h2>
            </div>
          </div>
          {#if userPlaylists.length > 0}
            <div class="home-library-grid">
              {#each userPlaylists.slice(0, 6) as pl (pl.id)}
                <button class="home-library-item" onclick={() => onOpenPlaylist?.(pl.id)}>
                  {#if pl.picUrl}
                    <img src={pl.picUrl + '?param=140y140'} alt="" loading="lazy" />
                  {:else}
                    <span class="home-track-cover-ph">♫</span>
                  {/if}
                  <span>
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
      </section>

      {#if userPlaylists.length === 0 && recentTracks.length === 0}
        <div class="home-empty">
          <div class="home-empty-icon">
            <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          <p class="home-empty-text">开始探索音乐吧</p>
          <button class="home-empty-btn" onclick={() => onNavigate?.('explore')}>去发现</button>
        </div>
      {/if}
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
</div>
