<script>
  import ArtistNames from '../../components/ArtistNames.svelte'
  import { ncm } from '../../api/client.js'
  import { loadExploreData as fetchExploreData } from '../../services/explore.js'
  import { loadToplistsData } from '../../services/home.js'
  import { coverUrl, coverRectUrl } from '../../utils/image.js'

  let { onOpenPlaylist, onOpenAlbum, onOpenArtist, onPlaySong, onBannerClick, onSearch } = $props()

  let loading = $state(false)
  let loaded = $state(false)
  let toplistsLoading = $state(false)
  let error = $state('')
  let banners = $state([])
  let personalized = $state([])
  let topPlaylists = $state([])
  let newAlbums = $state([])
  let recommendSongs = $state([])
  let blocks = $state([])
  let toplists = $state([])

  async function load() {
    if (loaded) return
    loading = true
    error = ''
    try {
      const d = await fetchExploreData(ncm)
      banners = d.banners || []
      personalized = d.personalized || []
      topPlaylists = d.topPlaylists || []
      recommendSongs = d.recommendSongs || []
      newAlbums = d.newAlbums || []
      blocks = d.blocks || []
    } catch (e) { error = e?.message || '加载失败' }
    loading = false
    loaded = true
  }

  async function loadToplists() {
    if (toplists.length || toplistsLoading) return
    toplistsLoading = true
    try { toplists = await loadToplistsData(ncm) }
    catch (e) { if (!error) error = e?.message || '加载失败' }
    finally { toplistsLoading = false }
  }

  $effect(() => { load() })
  $effect(() => { loadToplists() })

  const hero = $derived(banners[0])
  const editors = $derived(banners.slice(1, 4))
  const playlistBlocks = $derived(blocks.filter(block => block.kind === 'playlist'))
  const songBlocks = $derived(blocks.filter(block => block.kind === 'song'))
  const primaryPlaylists = $derived(playlistBlocks[0]?.items?.length ? playlistBlocks[0].items : [...personalized, ...topPlaylists])
  const secondaryPlaylistBlock = $derived(playlistBlocks[1])
  const primarySongBlock = $derived(songBlocks[0])
  const songPanelTitle = $derived(primarySongBlock?.title || '新歌精选')
  const songs = $derived(primarySongBlock?.items?.length ? primarySongBlock.items : recommendSongs)
</script>

<div class="m-page m-browse">
  <header class="m-page-header">
    <h1>发现</h1>
  </header>

  <!-- 搜索入口 -->
  <button class="m-search-pill" onclick={() => onSearch?.()}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7.5"/><line x1="21" y1="21" x2="15.8" y2="15.8"/></svg>
    <span>搜索歌曲、歌手、歌单</span>
  </button>

  {#if loading && !loaded}
    <div class="m-browse-skeleton" aria-label="正在加载发现内容" aria-busy="true">
      <div class="m-browse-skeleton-hero skeleton-block"></div>
      <div class="m-browse-skeleton-heading skeleton-block"></div>
      <div class="m-browse-skeleton-row">
        {#each Array(3) as _}
          <div>
            <span class="m-browse-skeleton-cover skeleton-block"></span>
            <span class="m-browse-skeleton-line skeleton-block"></span>
          </div>
        {/each}
      </div>
    </div>
  {:else if error && !hero}
    <div class="m-empty-state small">
      <h2>发现内容加载失败</h2>
      <p>{error}</p>
      <button class="m-primary-btn" onclick={() => { loaded = false; load(); loadToplists() }}>重试</button>
    </div>
  {:else}
    <!-- Hero 大卡 -->
    {#if hero}
      <section class="m-section">
        <button class="m-hero-card" onclick={() => onBannerClick?.(hero)}>
          {#if hero.pic}<img src={coverRectUrl(hero.pic, 960, 540)} alt={hero.title} loading="lazy" referrerpolicy="no-referrer" />{/if}
          <div class="m-hero-copy">
            <small>编辑精选 · 今日置顶</small>
            <strong>{hero.title || '今日推荐'}</strong>
          </div>
        </button>
      </section>
    {/if}

    <!-- 小编辑精选小卡横滑 -->
    {#if editors.length}
      <section class="m-section">
        <div class="m-section-head"><h2>编辑推荐</h2></div>
        <div class="m-rail">
          {#each editors as item (item.id)}
            <button class="m-editor-card" onclick={() => onBannerClick?.(item)}>
              {#if item.pic}<img src={coverRectUrl(item.pic, 400, 240)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              <span class="m-editor-title">{item.title}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if primaryPlaylists.length}
      <section class="m-section">
        <div class="m-section-head"><h2>{playlistBlocks[0]?.title || '推荐歌单'}</h2></div>
        <div class="m-rail m-cover-rail">
          {#each primaryPlaylists.slice(0, 12) as pl (pl.id)}
            <button class="m-cover-card" onclick={() => onOpenPlaylist?.(pl.id)}>
              <div class="m-cover-wrap">
                {#if pl.picUrl}<img src={coverUrl(pl.picUrl, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <strong class="m-cover-title">{pl.name}</strong>
              <span class="m-cover-sub">{pl.copywriter || pl.playCountText || (pl.trackCount ? `${pl.trackCount} 首歌曲` : '歌单')}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if secondaryPlaylistBlock?.items?.length}
      <section class="m-section">
        <div class="m-section-head"><h2>{secondaryPlaylistBlock.title}</h2></div>
        <div class="m-rail m-cover-rail">
          {#each secondaryPlaylistBlock.items.slice(0, 10) as pl (pl.id)}
            <button class="m-cover-card" onclick={() => onOpenPlaylist?.(pl.id)}>
              <div class="m-cover-wrap">
                {#if pl.picUrl}<img src={coverUrl(pl.picUrl, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <strong class="m-cover-title">{pl.name}</strong>
              <span class="m-cover-sub">{pl.copywriter || pl.playCountText || '歌单'}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- 新碟上架 -->
    {#if newAlbums.length}
      <section class="m-section">
        <div class="m-section-head"><h2>本周新发行</h2></div>
        <div class="m-rail m-cover-rail">
          {#each newAlbums.slice(0, 10) as album (album.id)}
            <button class="m-cover-card" onclick={() => onOpenAlbum?.(album.id)}>
              <div class="m-cover-wrap">
                {#if album.picUrl || album.coverImgUrl}<img src={coverUrl(album.picUrl || album.coverImgUrl, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <strong class="m-cover-title">{album.name}</strong>
              <span class="m-cover-sub">{album.artistName || '专辑'}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if songs.length}
      <section class="m-section">
        <div class="m-section-head"><h2>{songPanelTitle}</h2></div>
        <div class="m-rail m-cover-rail">
          {#each songs.slice(0, 12) as track, index (track.id || index)}
            <button class="m-cover-card" onclick={() => onPlaySong?.(track)}>
              <div class="m-cover-wrap">
                {#if track.picUrl}<img src={coverUrl(track.picUrl, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <strong class="m-cover-title">{track.name}</strong>
              <span class="m-cover-sub"><ArtistNames artists={track.ar || track.artists || []} {onOpenArtist} fallback="未知艺人" /></span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if toplists.length}
      <section class="m-section">
        <div class="m-section-head"><h2>排行榜</h2></div>
        <div class="m-rail m-cover-rail">
          {#each toplists.slice(0, 12) as chart (chart.id)}
            <button class="m-cover-card" onclick={() => onOpenPlaylist?.(chart.id)}>
              <div class="m-cover-wrap">
                {#if chart.coverImgUrl}<img src={coverUrl(chart.coverImgUrl, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <strong class="m-cover-title">{chart.name}</strong>
              <span class="m-cover-sub">{chart.updateFrequency || '持续更新'}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>
