<script>
  import Spinner from '../components/Spinner.svelte'

  let {
    exploreLoading = false,
    exploreBanners = [],
    explorePersonalized = [],
    exploreTopPlaylists = [],
    exploreRecommendSongs = [],
    toplists = [],
    onBannerClick,
    onOpenPlaylist,
    onPlaySong,
  } = $props()

  function handleKeydown(event, action) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action?.()
    }
  }
</script>

<div class="explore-page fade-in">
  {#if exploreLoading && exploreBanners.length === 0}
    <div class="loading-state" style="padding:80px 0">
      <Spinner size="lg" label="加载中" />
    </div>
  {:else}
    <!-- 1. Hero Banner (精品推荐) -->
    {#if exploreBanners.length > 0}
      <div class="explore-hero">
        <div class="explore-hero-inner">
          {#each exploreBanners.slice(0, 3) as banner, i (banner.id)}
            <div class="hero-banner-card" class:hero-main={i === 0} role="button" tabindex="0" onclick={() => onBannerClick?.(banner)} onkeydown={(event) => handleKeydown(event, () => onBannerClick?.(banner))}>
              <div class="hero-banner-cover">
                <img src={banner.pic + '?param=800y400'} alt={banner.title} loading="lazy" />
                <div class="hero-banner-overlay"></div>
                <div class="hero-banner-info">
                  <div class="hero-banner-tag">推荐</div>
                  <div class="hero-banner-title">{banner.title}</div>
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
          <span class="explore-section-action">更多</span>
        </div>
        <div class="card-scroll">
          {#each explorePersonalized as pl (pl.id)}
          <div class="explore-card" role="button" tabindex="0" onclick={() => onOpenPlaylist?.(pl.id)} onkeydown={(event) => handleKeydown(event, () => onOpenPlaylist?.(pl.id))}>
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

    <!-- 3. 新歌精选 (推荐歌曲) -->
    {#if exploreRecommendSongs.length > 0}
      <div class="explore-section">
        <div class="explore-section-header">
          <h2 class="explore-section-title">新歌精选</h2>
          <span class="explore-section-action">播放全部</span>
        </div>
        <div class="card-scroll">
          {#each exploreRecommendSongs as track (track.id)}
          <div class="song-card" role="button" tabindex="0" onclick={() => onPlaySong?.(track)} onkeydown={(event) => handleKeydown(event, () => onPlaySong?.(track))}>
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

    <!-- 4. 热门歌单 (Top Playlists) -->
    {#if exploreTopPlaylists.length > 0}
      <div class="explore-section">
        <div class="explore-section-header">
          <h2 class="explore-section-title">热门歌单</h2>
          <span class="explore-section-action">更多</span>
        </div>
        <div class="square-grid">
          {#each exploreTopPlaylists as pl (pl.id)}
          <div class="square-card" role="button" tabindex="0" onclick={() => onOpenPlaylist?.(pl.id)} onkeydown={(event) => handleKeydown(event, () => onOpenPlaylist?.(pl.id))}>
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

    <!-- 5. 排行榜 (Toplists) -->
    {#if toplists.length > 0}
      <div class="explore-section">
        <div class="explore-section-header">
          <h2 class="explore-section-title">排行榜</h2>
          <span class="explore-section-action">查看全部</span>
        </div>
        <div class="square-grid square-grid-sm">
          {#each toplists.slice(0, 8) as ranking (ranking.id)}
          <div class="square-card" role="button" tabindex="0" onclick={() => onOpenPlaylist?.(ranking.id)} onkeydown={(event) => handleKeydown(event, () => onOpenPlaylist?.(ranking.id))}>
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
