<script module lang="ts">
  import type { SongId } from '../../types/music.ts'
  import type { ExploreData } from '../../services/explore.ts'
  import type { NormalizedAlbum, NormalizedPlaylist, NormalizedSong, HomepageBlock } from '../../utils/normalize.ts'

  interface Toplist { id: SongId; name?: unknown; coverImgUrl?: string; updateFrequency?: string }

  let exploreSnapshot: ExploreData | null = null
  let exploreSnapshotAt = 0
  let exploreSnapshotOwner: unknown = null
  let toplistsSnapshot: Toplist[] = []
  let toplistsSnapshotAt = 0
  const SNAPSHOT_TTL = 5 * 60 * 1000
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { auth } from '../../stores/auth.svelte.ts'
  import { router } from '../../stores/router.svelte.ts'
  import DiscoveryPlaylists from '../../components/DiscoveryPlaylists.svelte'
  import type { DiscoveryPlaylistKey } from '../../app/discovery-playlists.ts'
  import SongListActions from '../../components/SongListActions.svelte'
  import Icon from '../../components/ui/Icon.svelte'
  import ArtistNames from '../../components/ArtistNames.svelte'
  import { coverUrl, coverRectUrl, progressiveCover, preloadCover } from '../../utils/image.ts'
  import ErrorBlock from '../../components/ui/ErrorBlock.svelte'
  import { ncm } from '../../api/client.ts'
  import { loadCachedExploreData as fetchExploreData } from '../../services/explore.ts'
  import { loadToplistsData } from '../../services/home.ts'
  import FeaturedContent from '../../components/FeaturedContent.svelte'
  import NewSongsModule from '../../components/NewSongsModule.svelte'
  import NewAlbumsModule from '../../components/NewAlbumsModule.svelte'
  import RecommendedPlaylistsModule from '../../components/RecommendedPlaylistsModule.svelte'
  import ToplistsModule from '../../components/ToplistsModule.svelte'

  interface TrackArtist { id?: SongId; name: string }
  interface CoverCard { id: SongId; name?: unknown; picUrl?: string; copywriter?: string; trackCount?: number }
  interface SongCard { id: SongId; name?: unknown; picUrl?: string; ar?: TrackArtist[]; artists?: TrackArtist[] }
  let {
    mobile = false,
    active = true,
    onSearch,
    onOpenRecommendation,
    onOpenLogin,
    onBannerClick,
    onOpenPlaylist,
    onOpenAlbum,
    onPlaySong,
    onOpenArtist,
  }: {
    mobile?: boolean
    active?: boolean
    onOpenRecommendation?: (key: DiscoveryPlaylistKey) => void
    onOpenLogin?: () => void
    onSearch?: () => void
    onBannerClick?: (banner: ExploreData['banners'][number]) => void
    onOpenPlaylist?: (id: unknown, push?: boolean, preview?: unknown) => void
    onOpenAlbum?: (id: unknown) => void
    onPlaySong?: (track: unknown) => void
    onOpenArtist?: (id: SongId) => void
  } = $props()

  const initialOwner = auth.isLoggedIn && auth.cookieOk ? auth.user : null
  const initialExplore = exploreSnapshotOwner === initialOwner && Date.now() - exploreSnapshotAt < SNAPSHOT_TTL ? exploreSnapshot : null
  const toplistsAreFresh = toplistsSnapshot.length > 0 && Date.now() - toplistsSnapshotAt < SNAPSHOT_TTL

  let exploreLoading = $state(!initialExplore)
  let exploreBanners = $state<ExploreData['banners']>(initialExplore?.banners ?? [])
  let explorePersonalized = $state<NormalizedPlaylist[]>(initialExplore?.personalized ?? [])
  let exploreTopPlaylists = $state<NormalizedPlaylist[]>(initialExplore?.topPlaylists ?? [])
  let exploreRecommendSongs = $state<NormalizedSong[]>(initialExplore?.recommendSongs ?? [])
  let exploreNewAlbums = $state<NormalizedAlbum[]>(initialExplore?.newAlbums ?? [])
  let exploreBlocks = $state<HomepageBlock[]>(initialExplore?.blocks ?? [])
  let toplists = $state<Toplist[]>(toplistsSnapshot)
  let toplistsLoading = $state(false)
  let toplistsLoaded = $state(toplistsAreFresh)
  let toplistsError = $state('')
  let error = $state('')
  let bindSongRow = $state<((track: unknown) => { oncontextmenu: (event: MouseEvent) => void }) | null>(null)
  let requestId = 0

  function errorMessage(e: unknown): string {
    return (e as { message?: string } | null | undefined)?.message || '加载失败'
  }

  async function loadExplore(refresh = false): Promise<void> {
    const owner = auth.isLoggedIn && auth.cookieOk ? auth.user : null
    const rid = ++requestId
    if (exploreSnapshotOwner !== owner) {
      exploreBanners = []; explorePersonalized = []; exploreTopPlaylists = []; exploreRecommendSongs = []; exploreNewAlbums = []; exploreBlocks = []
    }
    exploreLoading = !exploreSnapshot || exploreSnapshotOwner !== owner; error = ''
    try {
      const d = await fetchExploreData(ncm, owner, refresh)
      if (rid !== requestId || owner !== (auth.isLoggedIn && auth.cookieOk ? auth.user : null)) return
      exploreSnapshot = d; exploreSnapshotOwner = owner; exploreSnapshotAt = Date.now(); exploreBanners = d.banners; explorePersonalized = d.personalized; exploreTopPlaylists = d.topPlaylists; exploreRecommendSongs = d.recommendSongs; exploreNewAlbums = d.newAlbums; exploreBlocks = d.blocks
      if (d.allFailed && !d.banners.length && !d.blocks.length) error = '发现页加载失败'
    } catch (e) { if (rid === requestId) error = errorMessage(e) }
    finally { if (rid === requestId) exploreLoading = false }
  }

  async function loadToplists(): Promise<void> {
    // 失败只记在榜单自己的状态里：榜单挂了不该让整页显示错误块
    toplistsError = ''
    toplistsLoading = toplistsSnapshot.length === 0
    try { toplists = await loadToplistsData(ncm) as unknown as Toplist[]; toplistsSnapshot = toplists; toplistsSnapshotAt = Date.now() }
    catch (e) { toplistsError = errorMessage(e) }
    finally { toplistsLoading = false; toplistsLoaded = true }
  }

  $effect(() => {
    auth.user; auth.cookieOk; auth.isLoggedIn
    if (active) untrack(() => { void loadExplore(); router.prefetchRecommendations() })
  })
  // 榜单是业务能力，不随布局开关：窄屏同样加载（/toplist 有 60 分钟缓存）
  $effect(() => { if (!toplistsLoaded && !toplistsLoading) loadToplists() })

  // 精选模块内部区分「重点卡」和「编辑精选栏」：同一个动作、同一份数据
  const featuredBanners = $derived(exploreBanners.slice(0, 1))
  const editorials = $derived(exploreBanners.slice(1, 4))
  const playlistBlocks = $derived(exploreBlocks.filter(block => block.kind === 'playlist'))
  const songBlocks = $derived(exploreBlocks.filter(block => block.kind === 'song'))
  const primaryPlaylists = $derived<CoverCard[]>(((
    playlistBlocks[0]?.items?.length ? playlistBlocks[0].items : [...explorePersonalized, ...exploreTopPlaylists]
  ) as unknown as CoverCard[]).filter((item, index, items) => items.findIndex(other => other.id === item.id) === index))
  const secondaryPlaylistBlock = $derived(playlistBlocks[1])
  const secondaryPlaylists = $derived<CoverCard[]>(
    secondaryPlaylistBlock ? secondaryPlaylistBlock.items as unknown as CoverCard[] : []
  )
  const primarySongBlock = $derived(songBlocks[0])
  $effect(() => {
    if (!active) return
    const playlists = [...primaryPlaylists.slice(0, 12), ...secondaryPlaylists.slice(0, 12)]
    router.prefetchPlaylists(playlists.map(playlist => playlist.id), playlists.length)
    for (const playlist of playlists) void preloadCover(playlist.picUrl, 360)
  })
  const songPanelTitle = $derived(primarySongBlock?.title || '新歌精选')

  // 加载生命周期：初载（无内容）→ 缓存（有内容）→ 后台刷新（有内容且在请求）→ 失败（有内容则降级为提示）
  const hasContent = $derived(Boolean(exploreBanners.length || explorePersonalized.length || exploreTopPlaylists.length || exploreNewAlbums.length || exploreBlocks.length))
  const phase = $derived.by(() => {
    if (!hasContent) return error ? 'failed' : 'initial'
    if (exploreLoading) return 'refreshing'
    return error ? 'stale' : 'cached'
  })
  const songs = $derived<SongCard[]>((
    primarySongBlock?.items?.length ? primarySongBlock.items : exploreRecommendSongs
  ) as unknown as SongCard[])
</script>

<div class="music-discovery">
  <header class="music-discovery-header">
    <div>
      <span>ZTmusic</span>
      <h1>发现</h1>
    </div>
    <button class="music-search-field" onclick={() => onSearch?.()} aria-label="搜索音乐">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7.5"/><line x1="21" y1="21" x2="15.8" y2="15.8"/></svg>
      <span>搜索歌曲、歌手、歌单</span>
    </button>
  </header>

  {#if phase === 'failed'}
    <ErrorBlock message={error} onRetry={() => loadExplore(true)} />
  {:else if phase === 'stale'}
    <div class="explore-stale" role="status">
      <p>刷新失败，先显示上次的内容</p>
      <button type="button" onclick={() => loadExplore(true)}>重试</button>
    </div>
  {/if}

  <FeaturedContent layout={mobile ? 'rail' : 'hero'} banners={mobile ? exploreBanners : featuredBanners} editorials={editorials} loading={exploreLoading} onSelect={(item) => onBannerClick?.(item)} />
  <NewSongsModule {mobile} title={songPanelTitle} songs={songs} loading={exploreLoading} onPlaySong={(song) => onPlaySong?.(song)} bindSongRow={bindSongRow ?? undefined} onOpenArtist={(id) => onOpenArtist?.(id as SongId)} />
  <DiscoveryPlaylists {mobile} {onOpenRecommendation} {onOpenLogin} />
  <RecommendedPlaylistsModule {mobile} title={playlistBlocks[0]?.title || '推荐歌单'} label="推荐歌单" playlists={primaryPlaylists} loading={exploreLoading} onOpenPlaylist={(playlist) => onOpenPlaylist?.(playlist.id as SongId, true, playlist)} />
  <RecommendedPlaylistsModule {mobile} title={secondaryPlaylistBlock?.title || '更多推荐'} label="更多推荐歌单" playlists={secondaryPlaylists} limit={12} onOpenPlaylist={(playlist) => onOpenPlaylist?.(playlist.id as SongId, true, playlist)} />
  <NewAlbumsModule {mobile} albums={exploreNewAlbums} loading={exploreLoading} onOpenAlbum={(id) => onOpenAlbum?.(id)} />
  <ToplistsModule {mobile} toplists={toplists} loading={toplistsLoading} error={toplistsError} onOpenPlaylist={(chart) => onOpenPlaylist?.(chart.id, true, chart)} onRetry={loadToplists} />
</div>

<style>
  /* 有内容但刷新失败：只提示，不盖住已有内容 */
  .explore-stale { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-surface); color: var(--text-secondary); font-size: 12px; }
  .explore-stale p { margin: 0; }
  .explore-stale button { min-height: 32px; padding: 0 14px; border-radius: var(--radius-lg); background: var(--accent-bg); color: var(--accent); font-size: 12px; font-weight: 700; }

  :global(html.mobile-runtime) .music-discovery { display: flex; flex-direction: column; gap: 24px; }
  :global(html.mobile-runtime) .music-discovery-header { order: 0; margin: 0; }
</style>
