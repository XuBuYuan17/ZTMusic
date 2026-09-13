<script lang="ts">
  import type { SongId } from '../../types/music.ts'
  import type { ExploreData } from '../../services/explore.ts'
  import type { NormalizedAlbum, NormalizedPlaylist, NormalizedSong, HomepageBlock } from '../../utils/normalize.ts'
  import ArtistNames from '../../components/ArtistNames.svelte'
  import { ncm } from '../../api/client.ts'
  import { loadExploreData as fetchExploreData } from '../../services/explore.ts'
  import { loadToplistsData } from '../../services/home.ts'
  import { coverUrl, coverRectUrl } from '../../utils/image.ts'

  interface TrackArtist { id?: SongId; name: string }
  interface CoverCard { id: SongId; name?: unknown; picUrl?: string; copywriter?: string; playCountText?: string; trackCount?: number }
  interface SongCard { id: SongId; name?: unknown; picUrl?: string; ar?: TrackArtist[]; artists?: TrackArtist[] }
  interface Toplist { id: SongId; name?: unknown; coverImgUrl?: string; updateFrequency?: string }

  let { onOpenPlaylist, onOpenAlbum, onOpenArtist, onPlaySong, onBannerClick, onSearch }: {
    onOpenPlaylist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
    onOpenArtist?: (id: SongId) => void
    onPlaySong?: (track: SongCard) => void
    onBannerClick?: (banner: ExploreData['banners'][number]) => void
    onSearch?: () => void
  } = $props()

  let loading = $state(false)
  let loaded = $state(false)
  let toplistsLoading = $state(false)
  let error = $state('')
  let banners = $state<ExploreData['banners']>([])
  let personalized = $state<NormalizedPlaylist[]>([])
  let topPlaylists = $state<NormalizedPlaylist[]>([])
  let newAlbums = $state<NormalizedAlbum[]>([])
  let recommendSongs = $state<NormalizedSong[]>([])
  let blocks = $state<HomepageBlock[]>([])
  let toplists = $state<Toplist[]>([])

  function errorMessage(e: unknown): string {
    return (e as { message?: string } | null | undefined)?.message || '加载失败'
  }

  async function load(): Promise<void> {
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
    } catch (e) { error = errorMessage(e) }
    loading = false
    loaded = true
  }

  async function loadToplists(): Promise<void> {
    if (toplists.length || toplistsLoading) return
    toplistsLoading = true
    try { toplists = await loadToplistsData(ncm) as unknown as Toplist[] }
    catch (e) { if (!error) error = errorMessage(e) }
    finally { toplistsLoading = false }
  }

  $effect(() => { load() })
  $effect(() => { loadToplists() })

  const hero = $derived(banners[0])
  const editors = $derived(banners.slice(1, 4))
  const playlistBlocks = $derived(blocks.filter(block => block.kind === 'playlist'))
  const songBlocks = $derived(blocks.filter(block => block.kind === 'song'))
  const primaryPlaylists = $derived<CoverCard[]>((
    playlistBlocks[0]?.items?.length ? playlistBlocks[0].items : [...personalized, ...topPlaylists]
  ) as unknown as CoverCard[])
  const secondaryPlaylistBlock = $derived(playlistBlocks[1])
  const secondaryPlaylists = $derived<CoverCard[]>(
    secondaryPlaylistBlock ? secondaryPlaylistBlock.items as unknown as CoverCard[] : []
  )
  const primarySongBlock = $derived(songBlocks[0])
  const songPanelTitle = $derived(primarySongBlock?.title || '新歌精选')
  const songs = $derived<SongCard[]>((
    primarySongBlock?.items?.length ? primarySongBlock.items : recommendSongs
  ) as unknown as SongCard[])
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
    {#if hero || editors.length}
      <section class="m-section m-feature-section">
        <div class="m-section-head"><h2>为你精选</h2></div>
        <div class="m-rail m-feature-rail">
          {#if hero}
            <button class="m-hero-card" onclick={() => onBannerClick?.(hero)}>
              {#if hero.pic}<img src={coverRectUrl(hero.pic, 960, 540)} alt={hero.title} loading="lazy" referrerpolicy="no-referrer" />{/if}
              <div class="m-hero-copy">
                <small>新发行</small>
                <strong>{hero.title || '今日推荐'}</strong>
              </div>
            </button>
          {/if}
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

    {#if secondaryPlaylists.length}
      <section class="m-section">
        <div class="m-section-head"><h2>{secondaryPlaylistBlock?.title}</h2></div>
        <div class="m-rail m-cover-rail">
          {#each secondaryPlaylists as pl (pl.id)}
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
          {#each newAlbums.slice(0, 10) as album (album.id as SongId)}
            <button class="m-cover-card" onclick={() => onOpenAlbum?.(album.id)}>
              <div class="m-cover-wrap">
                {#if album.picUrl || album.coverImgUrl}<img src={coverUrl((album.picUrl || album.coverImgUrl) as string, 300)} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
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
