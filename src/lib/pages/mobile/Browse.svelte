<script>
  import { ncm } from '../../api/client.js'
  import { loadExploreData as fetchExploreData } from '../../services/explore.js'
  import { coverUrl, coverRectUrl } from '../../utils/image.js'
  import Spinner from '../../components/Spinner.svelte'

  let { onOpenPlaylist, onSearch } = $props()

  let loading = $state(false)
  let loaded = $state(false)
  let banners = $state([])
  let playlists = $state([])
  let newAlbums = $state([])
  let newSongs = $state([])

  async function load() {
    if (loaded) return
    loading = true
    try {
      const d = await fetchExploreData(ncm)
      banners = d.banners || []
      playlists = [...(d.personalized || []), ...(d.topPlaylists || [])]
      newAlbums = (d.newAlbums || []).slice(0, 10)
      newSongs = (d.recommendSongs || []).slice(0, 10)
    } catch (e) { console.error(e) }
    loading = false
    loaded = true
  }

  $effect(() => { load() })

  const hero = $derived(banners[0])
  const editors = $derived(banners.slice(1, 4))
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
    <div class="m-loading"><Spinner size="md" /></div>
  {:else}
    <!-- Hero 大卡 -->
    {#if hero}
      <section class="m-section">
        <button class="m-hero-card" onclick={() => onOpenPlaylist?.(hero.targetId)}>
          {#if hero.pic}<img src={coverRectUrl(hero.pic, 960, 540)} alt={hero.title} loading="lazy" referrerpolicy="no-referrer" />{/if}
          <div class="m-hero-copy">
            <small>编辑精选</small>
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
            <button class="m-editor-card" onclick={() => onOpenPlaylist?.(item.targetId)}>
              {#if item.pic}<img src={coverRectUrl(item.pic, 400, 240)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              <span class="m-editor-title">{item.title}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- 新碟上架 -->
    {#if newAlbums.length}
      <section class="m-section">
        <div class="m-section-head"><h2>新碟上架</h2></div>
        <div class="m-rail">
          {#each newAlbums as album (album.id)}
            <button class="m-cover-card" onclick={() => onOpenPlaylist?.(album.id)}>
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

    <!-- 推荐歌单 2 列网格 -->
    {#if playlists.length}
      <section class="m-section">
        <div class="m-section-head"><h2>推荐歌单</h2></div>
        <div class="m-grid">
          {#each playlists.slice(0, 8) as pl (pl.id)}
            <button class="m-grid-card" onclick={() => onOpenPlaylist?.(pl.id)}>
              <div class="m-grid-cover">
                {#if pl.picUrl}<img src={coverUrl(pl.picUrl, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
              </div>
              <strong class="m-grid-title">{pl.name}</strong>
              <span class="m-grid-sub">{pl.playCountText || '歌单'}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>
