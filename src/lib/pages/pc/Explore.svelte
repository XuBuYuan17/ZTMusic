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
  const playlistBlocks = $derived(exploreBlocks.filter(block => block.kind === 'playlist'))
  const songBlocks = $derived(exploreBlocks.filter(block => block.kind === 'song'))
  const primaryPlaylists = $derived(playlistBlocks[0]?.items?.length ? playlistBlocks[0].items : [...explorePersonalized, ...exploreTopPlaylists])
  const secondaryPlaylistBlock = $derived(playlistBlocks[1])
  const primarySongBlock = $derived(songBlocks[0])
  const songPanelTitle = $derived(primarySongBlock?.title || '新歌精选')
  const songs = $derived(primarySongBlock?.items?.length ? primarySongBlock.items : exploreRecommendSongs)
</script>

<div class="music-discovery fade-in">
  <header class="music-discovery-header">
    <div>
      <span>Browse</span>
      <h1>发现</h1>
    </div>
  </header>

  {#if error}
    <ErrorBlock {error} onRetry={loadExplore} />
  {/if}

    <section class="music-discovery-feature">
      {#if exploreLoading && !hero}
        <div class="music-feature-card primary skeleton-block" aria-label="加载精选内容"></div>
      {:else if hero}
        <button class="music-feature-card primary" onclick={() => onBannerClick?.(hero)}>
          {#if hero.pic}<img src={coverRectUrl(hero.pic, 1200, 680)} alt={hero.title} loading="lazy" referrerpolicy="no-referrer" />{/if}
          <span class="music-feature-copy">
            <small>编辑精选 · 今日置顶</small>
            <strong>{hero.title || '今日推荐'}</strong>
            <em>为今天挑一张最先播放的封面</em>
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
                <small>推荐 · 更新中</small>
                <strong>{item.title || '编辑推荐'}</strong>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section class="music-discovery-section">
      <div class="music-section-head">
        <h2>{playlistBlocks[0]?.title || '推荐歌单'}</h2>
      </div>
      <div class="music-card-rail">
        {#if exploreLoading && primaryPlaylists.length === 0}
          {#each Array(8) as _}
            <div class="music-cover-card skeleton-row">
              <span class="music-cover-placeholder skeleton-block"></span>
              <strong class="skeleton-line"></strong>
              <em class="skeleton-line narrow"></em>
            </div>
          {/each}
        {:else}
        {#each primaryPlaylists.slice(0, 14) as playlist (playlist.id)}
          <button class="music-cover-card" onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}>
            {#if playlist.picUrl}<img src={coverUrl(playlist.picUrl, 360)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
            <strong>{playlist.name}</strong>
            {#if playlist.trackCount}<em>{playlist.trackCount} 首歌曲</em>{/if}
          </button>
        {/each}
        {/if}
      </div>
    </section>

    {#if secondaryPlaylistBlock?.items?.length}
      <section class="music-discovery-section">
        <div class="music-section-head">
          <h2>{secondaryPlaylistBlock.title}</h2>
        </div>
        <div class="music-card-rail">
          {#each secondaryPlaylistBlock.items.slice(0, 12) as playlist (playlist.id)}
            <button class="music-cover-card" onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}>
              {#if playlist.picUrl}<img src={coverUrl(playlist.picUrl, 360)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
              <strong>{playlist.name}</strong>
              {#if playlist.copywriter}<em>{playlist.copywriter}</em>{:else if playlist.trackCount}<em>{playlist.trackCount} 首歌曲</em>{/if}
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <section class="music-discovery-section music-new-albums-panel">
      <div class="music-section-head">
        <h2>本周新发行</h2>
      </div>
      <div class="music-card-rail music-album-rail">
        {#if exploreLoading && exploreNewAlbums.length === 0}
          {#each Array(8) as _}
            <div class="music-cover-card skeleton-row">
              <span class="music-cover-placeholder skeleton-block"></span>
              <strong class="skeleton-line"></strong>
              <em class="skeleton-line narrow"></em>
            </div>
          {/each}
        {:else}
        {#each exploreNewAlbums.slice(0, 10) as album (album.id)}
          <button class="music-cover-card" onclick={() => onOpenAlbum?.(album.id)}>
            {#if album.picUrl}<img src={coverUrl(album.picUrl, 360)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
            <strong>{album.name}</strong>
            <em>{album.artistName || '新专辑'}</em>
          </button>
        {/each}
        {/if}
      </div>
    </section>

    <section class="music-discovery-section music-new-songs-section">
      <div class="music-section-head">
        <h2>{songPanelTitle}</h2>
      </div>
      <div class="music-card-rail music-song-rail">
        {#if exploreLoading && songs.length === 0}
          {#each Array(8) as _}
            <div class="music-cover-card skeleton-row">
              <span class="music-cover-placeholder skeleton-block"></span>
              <strong class="skeleton-line"></strong>
              <em class="skeleton-line narrow"></em>
            </div>
          {/each}
        {:else}
        {#each songs.slice(0, 12) as track, index (track.id || index)}
          <button class="music-cover-card" onclick={() => onPlaySong?.(track)}>
            {#if track.picUrl}<img src={coverUrl(track.picUrl, 360)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
            <strong>{track.name}</strong>
            <em><ArtistNames artists={track.ar || track.artists || []} {onOpenArtist} fallback="未知艺人" /></em>
          </button>
        {/each}
        {/if}
      </div>
    </section>

    <section class="music-discovery-section music-toplist-panel">
        <div class="music-section-head">
          <h2>排行榜</h2>
        </div>
        <div class="music-card-rail music-chart-rail">
          {#if exploreLoading && toplists.length === 0}
            {#each Array(8) as _}
              <div class="music-cover-card skeleton-row">
                <span class="music-cover-placeholder skeleton-block"></span>
                <strong class="skeleton-line"></strong>
                <em class="skeleton-line narrow"></em>
              </div>
            {/each}
          {:else}
          {#each toplists.slice(0, 12) as chart, index (chart.id)}
            <button class="music-cover-card" onclick={() => onOpenPlaylist?.(chart.id, true, chart)}>
              {#if chart.coverImgUrl}<img src={coverUrl(chart.coverImgUrl, 360)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
              <strong>{chart.name}</strong>
              <em>{chart.updateFrequency || '持续更新'}</em>
            </button>
          {/each}
          {/if}
        </div>
    </section>

</div>
