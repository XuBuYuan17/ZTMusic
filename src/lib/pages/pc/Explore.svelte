<script>
  import ArtistNames from '../../components/ArtistNames.svelte'
  import { coverUrl, coverRectUrl } from '../../utils/image.js'
  import ErrorBlock from '../../components/ui/ErrorBlock.svelte'
  import { ncm } from '../../api/client.js'
  import { loadExploreData as fetchExploreData } from '../../services/explore.js'
  import { loadToplistsData } from '../../services/home.js'

  let {
    onSearch,
    onBannerClick,
    onOpenPlaylist,
    onOpenAlbum,
    onPlaySong,
    onOpenArtist,
  } = $props()

  let exploreLoading = $state(false)
  let exploreBanners = $state([])
  let explorePersonalized = $state([])
  let exploreTopPlaylists = $state([])
  let exploreRecommendSongs = $state([])
  let exploreNewAlbums = $state([])
  let exploreBlocks = $state([])
  let toplists = $state([])
  let exploreLoaded = $state(false)
  let toplistsLoading = $state(false)
  let error = $state('')

  async function loadExplore() {
    exploreLoading = true; error = ''
    try { const d = await fetchExploreData(ncm); exploreBanners = d.banners; explorePersonalized = d.personalized; exploreTopPlaylists = d.topPlaylists; exploreRecommendSongs = d.recommendSongs; exploreNewAlbums = d.newAlbums; exploreBlocks = d.blocks }
    catch (e) { error = e?.message || '加载失败' }
    exploreLoading = false; exploreLoaded = true
  }

  async function loadToplists() {
    toplistsLoading = true
    try { toplists = await loadToplistsData(ncm) }
    catch (e) { if (!error) error = e?.message || '加载失败' }
    finally { toplistsLoading = false }
  }

  $effect(() => { if (!exploreLoaded) loadExplore() })
  $effect(() => { if (toplists.length === 0 && !toplistsLoading) loadToplists() })

  const hero = $derived(exploreBanners[0])
  const editorials = $derived(exploreBanners.slice(1, 4))
  const playlists = $derived([...explorePersonalized, ...exploreTopPlaylists])
</script>

<div class="music-discovery fade-in">
  <header class="music-discovery-header">
    <span>Browse</span>
    <h1>发现</h1>
  </header>

  {#if error}
    <ErrorBlock {error} onRetry={loadExplore} />
  {/if}

  <div class="explore-search-input">
    <button class="explore-search-btn" onclick={() => onSearch?.()}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7.5"/><line x1="21" y1="21" x2="15.8" y2="15.8"/></svg>
      <span>搜索歌曲或艺人…</span>
    </button>
  </div>

    <section class="music-discovery-feature">
      {#if exploreLoading && !hero}
        <div class="music-feature-card primary skeleton-block" aria-label="加载精选内容"></div>
      {:else if hero}
        <button class="music-feature-card primary" onclick={() => onBannerClick?.(hero)}>
          {#if hero.pic}<img src={coverRectUrl(hero.pic, 1200, 680)} alt={hero.title} loading="lazy" referrerpolicy="no-referrer" />{/if}
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
              {#if item.pic}<img src={coverRectUrl(item.pic, 520, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
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
            {#if playlist.picUrl}<img src={coverUrl(playlist.picUrl, 360)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
            <strong>{playlist.name}</strong>
            {#if playlist.trackCount}<em>{playlist.trackCount} 首歌曲</em>{/if}
          </button>
        {/each}
        {/if}
      </div>
    </section>

    <section class="music-discovery-section music-new-songs-section">
      <div class="music-section-head">
        <h2>新歌精选</h2>
      </div>
      <div class="music-song-list">
        {#if exploreLoading && exploreRecommendSongs.length === 0}
          {#each Array(10) as _, index}
            <div class="music-song-item skeleton-row">
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
            {#if track.picUrl}<img src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
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
      <div class="music-discovery-section compact-panel music-new-albums-panel">
        <div class="music-section-head">
          <h2>本周新发行</h2>
        </div>
        <div class="music-album-grid">
          {#if exploreLoading && exploreNewAlbums.length === 0}
            {#each Array(6) as _}
              <div class="music-album-card skeleton-row">
                <span class="music-cover-placeholder skeleton-block"></span>
                <strong class="skeleton-line"></strong>
                <em class="skeleton-line narrow"></em>
              </div>
            {/each}
          {:else}
          {#each exploreNewAlbums.slice(0, 6) as album (album.id)}
            <button class="music-album-card" onclick={() => onOpenAlbum?.(album.id)}>
              {#if album.picUrl}<img src={coverUrl(album.picUrl, 180)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
              <span class="music-album-info">
                <strong>{album.name}</strong>
                <em>{album.artistName || '新专辑'}</em>
              </span>
            </button>
          {/each}
          {/if}
        </div>
      </div>

      <div class="music-discovery-section compact-panel music-toplist-panel">
        <div class="music-section-head">
          <h2>排行榜</h2>
        </div>
        <div class="music-toplist-list">
          {#if exploreLoading && toplists.length === 0}
            {#each Array(6) as _, index}
              <div class="music-list-item skeleton-row">
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
              {#if chart.coverImgUrl}<img src={coverUrl(chart.coverImgUrl, 112)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
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

</div>
