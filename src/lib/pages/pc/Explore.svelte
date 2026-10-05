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
    toplistsLoading = toplistsSnapshot.length === 0
    try { toplists = await loadToplistsData(ncm) as unknown as Toplist[]; toplistsSnapshot = toplists; toplistsSnapshotAt = Date.now() }
    catch (e) { if (!toplistsSnapshot.length && !error) error = errorMessage(e) }
    finally { toplistsLoading = false; toplistsLoaded = true }
  }

  $effect(() => {
    auth.user; auth.cookieOk; auth.isLoggedIn
    if (active) untrack(() => { void loadExplore(); router.prefetchRecommendations() })
  })
  $effect(() => { if (!mobile && !toplistsLoaded && !toplistsLoading) loadToplists() })

  const hero = $derived(exploreBanners[0])
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
  const songs = $derived<SongCard[]>((
    primarySongBlock?.items?.length ? primarySongBlock.items : exploreRecommendSongs
  ) as unknown as SongCard[])
</script>

{#if mobile}
  <div class="mobile-discovery">
    {#if error}<ErrorBlock message={error} onRetry={() => loadExplore(true)} />{/if}
    {#if exploreBanners.length || exploreLoading}
      <section class="mobile-feature-rail" aria-label="精选推荐">
        {#if exploreLoading && !exploreBanners.length}
          {#each Array(2) as _}<div class="mobile-feature-item"><span class="skeleton-line"></span><span class="mobile-feature-image skeleton-block"></span></div>{/each}
        {:else}
          {#each exploreBanners as banner, index (`${banner.id}:${index}`)}
            <button class="mobile-feature-item" type="button" onclick={() => onBannerClick?.(banner)}>
              <small>精选推荐</small><strong>{banner.title || '今日推荐'}</strong>
              <span class="mobile-feature-image">{#if banner.pic}<img src={coverRectUrl(banner.pic, 900, 600)} alt="" onerror={(event) => { event.currentTarget.setAttribute('hidden', '') }} referrerpolicy="no-referrer" loading={index ? 'lazy' : 'eager'} />{:else}<Icon name="music" size={44} />{/if}</span>
            </button>
          {/each}
        {/if}
      </section>
    {/if}
    {#if songs.length || exploreLoading}
      <section class="mobile-discovery-section" aria-label="新歌精选">
        <h2>新歌精选</h2>
        <div class="mobile-song-rail">
          {#if exploreLoading && !songs.length}
            {#each Array(2) as _}<div class="mobile-song-group">{#each Array(3) as _}<div class="mobile-song-row"><span class="mobile-song-cover skeleton-block"></span><span class="skeleton-line"></span></div>{/each}</div>{/each}
          {:else}
            {#each Array.from({ length: Math.ceil(Math.min(songs.length, 12) / 3) }, (_, i) => songs.slice(i * 3, i * 3 + 3)) as group}
              <div class="mobile-song-group">
                {#each group as track (track.id)}
                  <div class="mobile-song-row">
                    <button class="mobile-song-play" type="button" onclick={() => onPlaySong?.(track)} aria-label={`播放 ${track.name}`}>
                      <span class="mobile-song-cover">{#if track.picUrl}<img use:progressiveCover={{ source: track.picUrl, size: 120 }} alt="" onerror={(event) => { event.currentTarget.setAttribute('hidden', '') }} loading="lazy" referrerpolicy="no-referrer" />{:else}<Icon name="music" size={22} />{/if}</span>
                      <span class="mobile-song-copy"><strong>{track.name}</strong><small>{(track.ar || track.artists || []).map(artist => artist.name).join(' / ') || '未知艺人'}</small></span>
                    </button>
                    <button class="mobile-song-more" type="button" aria-label={`更多操作：${track.name}`} onclick={(event) => bindSongRow?.(track).oncontextmenu(event)}><Icon name="more" size={22} /></button>
                  </div>
                {/each}
              </div>
            {/each}
          {/if}
        </div>
      </section>
    {/if}
    <DiscoveryPlaylists mobile {onOpenRecommendation} {onOpenLogin} />
    {#if primaryPlaylists.length || exploreLoading}
      <section class="mobile-discovery-section" aria-label="推荐歌单">
        <h2>推荐歌单</h2>
        <div class="mobile-cover-rail">
          {#if exploreLoading && !primaryPlaylists.length}
            {#each Array(4) as _}<div class="mobile-cover-item"><span class="mobile-cover-image skeleton-block"></span><span class="skeleton-line"></span></div>{/each}
          {:else}
            {#each primaryPlaylists.slice(0, 12) as playlist (playlist.id)}
              <button class="mobile-cover-item" type="button" data-motion="card" onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}>
                <span class="mobile-cover-image">{#if playlist.picUrl}<img use:progressiveCover={{ source: playlist.picUrl, size: 360 }} alt="" onerror={(event) => { event.currentTarget.setAttribute('hidden', '') }} loading="lazy" referrerpolicy="no-referrer" />{:else}<Icon name="music" size={32} />{/if}</span>
                <strong>{playlist.name}</strong><small>{playlist.copywriter || (playlist.trackCount ? `${playlist.trackCount} 首歌曲` : '歌单')}</small>
              </button>
            {/each}
          {/if}
        </div>
      </section>
    {/if}
    {#if exploreNewAlbums.length || exploreLoading}
      <section class="mobile-discovery-section" aria-label="新专辑">
        <h2>新专辑</h2>
        <div class="mobile-cover-rail">
          {#if exploreLoading && !exploreNewAlbums.length}
            {#each Array(4) as _}<div class="mobile-cover-item"><span class="mobile-cover-image skeleton-block"></span><span class="skeleton-line"></span></div>{/each}
          {:else}
            {#each exploreNewAlbums.slice(0, 12) as album (album.id)}
              <button class="mobile-cover-item" type="button" data-motion="card" onclick={() => onOpenAlbum?.(album.id)}>
                <span class="mobile-cover-image">{#if album.picUrl}<img use:progressiveCover={{ source: album.picUrl, size: 360 }} alt="" onerror={(event) => { event.currentTarget.setAttribute('hidden', '') }} loading="lazy" referrerpolicy="no-referrer" />{:else}<Icon name="music" size={32} />{/if}</span>
                <strong>{album.name}</strong><small>{album.artistName || '新专辑'}</small>
              </button>
            {/each}
          {/if}
        </div>
      </section>
    {/if}
  </div>
  <SongListActions onOpenArtist={(id) => { if (typeof id === 'string' || typeof id === 'number') onOpenArtist?.(id) }} {onOpenAlbum} onBindRow={(bindRow) => { bindSongRow = bindRow }} />
{:else}
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

  {#if error}
    <ErrorBlock message={error} onRetry={() => loadExplore(true)} />
  {/if}

  <section class="music-discovery-feature">
      {#if exploreLoading && !hero}
        <div class="music-feature-card primary skeleton-block" aria-label="加载精选内容"></div>
      {:else if hero}
        <button class="music-feature-card primary" data-motion="card" onclick={() => onBannerClick?.(hero)}>
          {#if hero.pic}<img src={coverRectUrl(hero.pic, 1200, 680)} alt={hero.title} loading="lazy" referrerpolicy="no-referrer" />{/if}
          <span class="music-feature-copy">
            <small>编辑精选 · 今日置顶</small>
            <strong>{hero.title || '今日推荐'}</strong>
            <em>从这里开始今天的播放</em>
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
            <button class="music-feature-card compact" data-motion="card" onclick={() => onBannerClick?.(item)}>
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

  {#if exploreNewAlbums.length || exploreLoading}
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
        {#each exploreNewAlbums.slice(0, 10) as album (album.id as SongId)}
          <button class="music-cover-card" data-motion="card" onclick={() => onOpenAlbum?.(album.id)}>
            {#if album.picUrl}<img use:progressiveCover={{ source: album.picUrl, size: 360 }} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
            <strong>{album.name}</strong>
            <em>{album.artistName || '新专辑'}</em>
          </button>
        {/each}
        {/if}
      </div>
    </section>
  {/if}

    <DiscoveryPlaylists {onOpenRecommendation} {onOpenLogin} />
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
            <button class="music-cover-card" data-motion="card" onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}>
              {#if playlist.picUrl}<img use:progressiveCover={{ source: playlist.picUrl, size: 360 }} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
              <strong>{playlist.name}</strong>
            {#if playlist.copywriter}<em>{playlist.copywriter}</em>{:else if playlist.trackCount}<em>{playlist.trackCount} 首歌曲</em>{/if}
            </button>
          {/each}
        {/if}
        </div>
      </section>

    {#if secondaryPlaylists.length}
      <section class="music-discovery-section music-extra-playlists">
        <div class="music-section-head">
          <h2>{secondaryPlaylistBlock?.title}</h2>
        </div>
        <div class="music-card-rail">
          {#each secondaryPlaylists.slice(0, 12) as playlist (playlist.id)}
            <button class="music-cover-card" data-motion="card" onclick={() => onOpenPlaylist?.(playlist.id, true, playlist)}>
              {#if playlist.picUrl}<img use:progressiveCover={{ source: playlist.picUrl, size: 360 }} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
              <strong>{playlist.name}</strong>
              {#if playlist.copywriter}<em>{playlist.copywriter}</em>{:else if playlist.trackCount}<em>{playlist.trackCount} 首歌曲</em>{/if}
            </button>
          {/each}
        </div>
      </section>
    {/if}

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
          <button class="music-cover-card" data-motion="card" onclick={() => onPlaySong?.(track)}>
            {#if track.picUrl}<img use:progressiveCover={{ source: track.picUrl, size: 360 }} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
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
            <button class="music-cover-card" data-motion="card" onclick={() => onOpenPlaylist?.(chart.id, true, chart)}>
              {#if chart.coverImgUrl}<img use:progressiveCover={{ source: chart.coverImgUrl, size: 360 }} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="music-cover-placeholder">♪</span>{/if}
              <strong>{chart.name}</strong>
              <em>{chart.updateFrequency || '持续更新'}</em>
            </button>
          {/each}
          {/if}
        </div>
    </section>
</div>
{/if}

<style>
  :global(html.mobile-runtime) .music-discovery { display: flex; flex-direction: column; gap: 24px; }
  :global(html.mobile-runtime) .music-discovery-header { order: 0; margin: 0; }
  :global(html.mobile-runtime) .music-discovery-feature { order: 1; display: block; margin: 0; }
  :global(html.mobile-runtime) .music-feature-stack,
  :global(html.mobile-runtime) .music-feature-copy small,
  :global(html.mobile-runtime) .music-feature-copy em { display: none; }
  :global(html.mobile-runtime) .music-discovery-section { order: 2; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; }
  :global(html.mobile-runtime) .music-new-albums-panel { order: 3; }
  :global(html.mobile-runtime) .music-new-songs-section,
  :global(html.mobile-runtime) .music-toplist-panel { order: 4; }
  :global(html.mobile-runtime) .music-section-head h2 { font-size: 18px; }
  :global(html.mobile-runtime) .music-discovery .music-feature-card.primary { display: block; width: 100%; min-height: 0; aspect-ratio: 16 / 9; border: 0; border-radius: var(--radius-sm); }
  :global(html.mobile-runtime) .music-discovery .music-feature-copy strong { font-size: 22px; }
  :global(html.mobile-runtime) .music-extra-playlists { display: none; }
  :global(html.mobile-runtime) .music-section-head { border: 0; }
  :global(html.mobile-runtime) .music-card-rail { grid-auto-flow: row; grid-auto-columns: auto; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 12px; overflow: visible; scroll-snap-type: none; }
  :global(html.mobile-runtime) .music-cover-card { padding: 0; border: 0; border-radius: 0; background: transparent; }
  :global(html.mobile-runtime) .music-cover-card strong { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; white-space: normal; font-size: 15px; line-height: 20px; }
  @media (max-width: 359px) { :global(html.mobile-runtime) .music-card-rail { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (min-width: 600px) { :global(html.mobile-runtime) .music-card-rail { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
