<script>
  import ArtistNames from '../components/ArtistNames.svelte'

  let {
    exploreLoading = false,
    exploreBanners = [],
    explorePersonalized = [],
    exploreTopPlaylists = [],
    exploreRecommendSongs = [],
    exploreNewAlbums = [],
    toplists = [],
    onBannerClick,
    onOpenPlaylist,
    onOpenAlbum,
    onPlaySong,
    onOpenArtist,
  } = $props()

  const hero = $derived(exploreBanners[0])
  const editorials = $derived(exploreBanners.slice(1, 4))
  const playlists = $derived([...explorePersonalized, ...exploreTopPlaylists])
</script>

<div class="music-discovery fade-in">
  <header class="music-discovery-header">
    <span>Browse</span>
    <h1>发现</h1>
  </header>

    <section class="music-discovery-feature">
      {#if exploreLoading && !hero}
        <div class="music-feature-card primary skeleton-block" aria-label="加载精选内容"></div>
      {:else if hero}
        <button class="music-feature-card primary" onclick={() => onBannerClick?.(hero)}>
          {#if hero.pic}<img src={hero.pic + '?param=1200y680'} alt={hero.title} loading="lazy" />{/if}
          <span class="music-feature-copy">
            <small>编辑精选</small>
            <strong>{hero.title || '今日推荐'}</strong>
            <em>今天值得打开的声音</em>
          </span>
        </button>
      {/if}

      {#if exploreLoading && editorials.length === 0}
        <div class="music-feature-stack" aria-label="加载推荐内容">
          {#each Array(3) as _}
            <div class="music-feature-card compact skeleton-block"></div>
          {/each}
        </div>
      {:else if editorials.length > 0}
        <div class="music-feature-stack">
          {#each editorials as item (item.id)}
            <button class="music-feature-card compact" onclick={() => onBannerClick?.(item)}>
              {#if item.pic}<img src={item.pic + '?param=520y300'} alt="" loading="lazy" />{/if}
              <span class="music-feature-copy">
                <small>推荐</small>
                <strong>{item.title || '编辑推荐'}</strong>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section class="music-discovery-section">
      <div class="music-section-head">
        <h2>新歌精选</h2>
      </div>
      <div class="music-song-list">
        {#if exploreLoading && exploreRecommendSongs.length === 0}
          {#each Array(10) as _, index}
            <div class="music-song-item skeleton-row">
              <span class="music-song-index">{String(index + 1).padStart(2, '0')}</span>
              <span class="music-cover-placeholder skeleton-block"></span>
              <span class="music-item-copy">
                <strong class="skeleton-line"></strong>
                <em class="skeleton-line narrow"></em>
              </span>
            </div>
          {/each}
        {:else}
        {#each exploreRecommendSongs.slice(0, 12) as track, index (track.id || index)}
          <button class="music-song-item" onclick={() => onPlaySong?.(track)}>
            <span class="music-song-index">{String(index + 1).padStart(2, '0')}</span>
            {#if track.picUrl}<img src={track.picUrl + '?param=96y96'} alt="" loading="lazy" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
            <span class="music-item-copy">
              <strong>{track.name}</strong>
              <em><ArtistNames artists={track.ar || track.artists || []} {onOpenArtist} fallback="未知艺人" /></em>
            </span>
          </button>
        {/each}
        {/if}
      </div>
    </section>

    <section class="music-discovery-grid">
      <div class="music-discovery-section compact-panel">
        <div class="music-section-head">
          <h2>本周新发行</h2>
        </div>
        <div class="music-vertical-list">
          {#if exploreLoading && exploreNewAlbums.length === 0}
            {#each Array(6) as _}
              <div class="music-list-item skeleton-row">
                <span class="music-cover-placeholder skeleton-block"></span>
                <span>
                  <strong class="skeleton-line"></strong>
                  <em class="skeleton-line narrow"></em>
                </span>
              </div>
            {/each}
          {:else}
          {#each exploreNewAlbums.slice(0, 6) as album (album.id)}
            <button class="music-list-item" onclick={() => onOpenAlbum?.(album.id)}>
              {#if album.picUrl}<img src={album.picUrl + '?param=112y112'} alt="" loading="lazy" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
              <span>
                <strong>{album.name}</strong>
                <em>{album.artistName || '新专辑'}</em>
              </span>
            </button>
          {/each}
          {/if}
        </div>
      </div>

      <div class="music-discovery-section compact-panel">
        <div class="music-section-head">
          <h2>排行榜</h2>
        </div>
        <div class="music-vertical-list">
          {#if exploreLoading && toplists.length === 0}
            {#each Array(6) as _, index}
              <div class="music-list-item skeleton-row">
                <span class="music-chart-index">{index + 1}</span>
                <span class="music-cover-placeholder skeleton-block"></span>
                <span>
                  <strong class="skeleton-line"></strong>
                  <em class="skeleton-line narrow"></em>
                </span>
              </div>
            {/each}
          {:else}
          {#each toplists.slice(0, 6) as chart, index (chart.id)}
            <button class="music-list-item" onclick={() => onOpenPlaylist?.(chart.id, true, chart)}>
              <span class="music-chart-index">{index + 1}</span>
              {#if chart.coverImgUrl}<img src={chart.coverImgUrl + '?param=112y112'} alt="" loading="lazy" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
              <span>
                <strong>{chart.name}</strong>
                <em>{chart.updateFrequency || '持续更新'}</em>
              </span>
            </button>
          {/each}
          {/if}
        </div>
      </div>
    </section>

    <section class="music-discovery-section">
      <div class="music-section-head">
        <h2>推荐歌单</h2>
      </div>
      <div class="music-card-rail">
        {#if exploreLoading && playlists.length === 0}
          {#each Array(8) as _}
            <div class="music-cover-card skeleton-row">
              <span class="music-cover-placeholder skeleton-block"></span>
              <strong class="skeleton-line"></strong>
              <em class="skeleton-line narrow"></em>
            </div>
          {/each}
        {:else}
        {#each playlists.slice(0, 14) as playlist (playlist.id)}
          <button class="music-cover-card" onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}>
            {#if playlist.picUrl}<img src={playlist.picUrl + '?param=360y360'} alt="" loading="lazy" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
            <strong>{playlist.name}</strong>
            {#if playlist.trackCount}<em>{playlist.trackCount} 首歌曲</em>{/if}
          </button>
        {/each}
        {/if}
      </div>
    </section>
</div>
