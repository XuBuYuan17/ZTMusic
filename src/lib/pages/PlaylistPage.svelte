<script lang="ts">
  import type { SongId } from '../types/music.ts'
  import { player } from '../stores/player.svelte.ts'
  import { formatDuration } from '../format.ts'
  import { coverUrl } from '../utils/image.ts'
  import SongListActions from '../components/SongListActions.svelte'
  import PlaylistHero from '../components/PlaylistHero.svelte'
  import Icon from '../components/ui/Icon.svelte'

  // 与 router 的 DetailTrack / PlaylistDetail 结构对齐（只列本组件实际读取的字段），router 传入时结构兼容
  interface DetailTrackLike {
    id: SongId
    name?: unknown
    ar?: unknown
    artists?: unknown
    al?: unknown
    album?: unknown
    dt?: number
    duration?: number
    addTime?: number
    addedAt?: number
    playlistIndex?: number
    picUrl?: string
  }
  interface PlaylistDetailLike {
    id: SongId
    name: string
    coverImgUrl: string
    picUrl: string
    creator?: unknown
    trackCount: number
    description: string
    tracks: DetailTrackLike[]
    trackIds?: unknown[]
    tracksPartial?: boolean
  }
  interface TrackArtist { id?: SongId; name?: unknown }
  type SortKey = 'added' | 'alpha'
  type SortDir = 'asc' | 'desc'
  type RowBinder = (track: unknown) => { oncontextmenu: (event: MouseEvent) => void }

  let {
    playlistDetail = null,
    loading = false,
    loadingMore = false,
    error = '',
    selectedId = null,
    heroColor = '#141414',
    detailType = '歌单',
    onBack,
    onPlayAll,
    onPlayTrack,
    onOpenArtist,
    onOpenAlbum,
  }: {
    playlistDetail?: PlaylistDetailLike | null
    loading?: boolean
    loadingMore?: boolean
    error?: string
    selectedId?: SongId | null
    heroColor?: string
    detailType?: string
    onBack?: () => void
    onPlayAll?: (tracks?: DetailTrackLike[] | null) => void
    onPlayTrack?: (id: SongId, tracks?: DetailTrackLike[] | null) => void
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
  } = $props()

  let songActions = $state<{ bindRow: RowBinder } | null>(null)
  let trackSearch = $state('')
  let trackSort = $state<SortKey>('added')
  let trackSortDir = $state<SortDir>('desc')
  let lastSelectedId = $state<SongId | null>(null)

  let visibleTracks = $derived(filterAndSortTracks(playlistDetail?.tracks || [], trackSearch, trackSort, trackSortDir))
  let totalTrackCount = $derived(playlistDetail?.trackCount || playlistDetail?.trackIds?.length || playlistDetail?.tracks?.length || 0)
  let isWaitingForTracks = $derived(Boolean(loading && playlistDetail && (!playlistDetail.tracks || playlistDetail.tracks.length === 0)))

  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }

  $effect(() => {
    if (lastSelectedId !== selectedId) {
      lastSelectedId = selectedId
      trackSearch = ''
      trackSort = 'added'
      trackSortDir = 'desc'
    }
  })

  function setSort(sort: SortKey): void {
    if (trackSort === sort) {
      trackSortDir = trackSortDir === 'asc' ? 'desc' : 'asc'
      return
    }
    trackSort = sort
    trackSortDir = sort === 'alpha' ? 'asc' : 'desc'
  }

  function artistsOf(track: DetailTrackLike): TrackArtist[] {
    const list = track.artists || track.ar || []
    return Array.isArray(list) ? list as TrackArtist[] : []
  }

  function artistText(track: DetailTrackLike): string {
    return artistsOf(track).map(artist => artist.name).join(' / ')
  }

  function albumName(track: DetailTrackLike): unknown {
    return rec(track.album)?.name || rec(track.al)?.name || ''
  }

  function searchText(track: DetailTrackLike): string {
    return [track.name, artistText(track), albumName(track)].filter(Boolean).join(' ').toLowerCase()
  }

  function firstLetter(track: DetailTrackLike): string {
    return ((track.name || '') as string).trim()
  }

  function addedTime(track: DetailTrackLike): number {
    return track.addTime || track.addedAt || 0
  }

  function filterAndSortTracks(tracks: DetailTrackLike[], search: string, sort: SortKey, direction: SortDir): DetailTrackLike[] {
    const keyword = search.trim().toLowerCase()
    const filtered = keyword ? tracks.filter(track => searchText(track).includes(keyword)) : [...tracks]
    const dir = direction === 'asc' ? 1 : -1
    if (sort === 'alpha') {
      return filtered.sort((a, b) => firstLetter(a).localeCompare(firstLetter(b), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }) * dir)
    }
    return filtered.sort((a, b) => {
      const aTime = addedTime(a)
      const bTime = addedTime(b)
      const diff = aTime - bTime
      if (diff !== 0) return diff
      if (!aTime && !bTime) return (a.playlistIndex ?? 0) - (b.playlistIndex ?? 0)
      return ((a.playlistIndex ?? 0) - (b.playlistIndex ?? 0)) * dir
    })
  }

  function coverOf(track: DetailTrackLike): unknown {
    return rec(track.al)?.picUrl || rec(track.album)?.picUrl
  }

  function duration(track: DetailTrackLike): string {
    return formatDuration(track.duration || track.dt || 0)
  }

  function handleRowKeydown(event: KeyboardEvent, track: DetailTrackLike): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPlayTrack?.(track.id, visibleTracks)
    }
  }
</script>

{#key selectedId}
  <div class="playlist-detail-page fade-in">
    {#if loading && !playlistDetail}
      <PlaylistHero {onBack} />
      <table class="track-table" aria-label="加载详情歌曲">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-cover"></th>
            <th>标题</th>
            <th>歌手</th>
            <th class="col-album">专辑</th>
            <th class="col-dur">时长</th>
          </tr>
        </thead>
        <tbody>
          {#each Array(10) as _, i}
            <tr class="skeleton-table-row">
              <td class="col-num">{i + 1}</td>
              <td class="col-cover"><div class="track-cover-placeholder skeleton-block"></div></td>
              <td class="col-title"><span class="skeleton-line"></span></td>
              <td class="col-artist"><span class="skeleton-line medium"></span></td>
              <td class="col-album"><span class="skeleton-line narrow"></span></td>
              <td class="col-dur"><span class="skeleton-line short"></span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else if error}
      <div class="detail-state">
        <p>{error}</p>
        <button onclick={onBack}>返回</button>
      </div>
    {:else if playlistDetail}
      <PlaylistHero
        detail={playlistDetail}
        {loading}
        {loadingMore}
        {heroColor}
        {detailType}
        totalCount={totalTrackCount}
        visibleCount={visibleTracks.length}
        {onBack}
        onPlayAll={() => onPlayAll?.(visibleTracks)}
      />
      <div class="playlist-toolbar">
        <label class="playlist-search" aria-label="搜索歌单歌曲">
          <Icon name="search" size={16} strokeWidth={1.8} />
          <input bind:value={trackSearch} placeholder="搜索歌单内歌曲、歌手、专辑" />
          {#if trackSearch}
            <button type="button" onclick={() => trackSearch = ''} aria-label="清空搜索">
              <Icon name="close" size={14} strokeWidth={2} />
            </button>
          {/if}
        </label>

        <span class="playlist-toolbar-count">{#if isWaitingForTracks}正在加载歌曲…{:else}{visibleTracks.length} / {playlistDetail.tracks?.length || 0}{/if}</span>
      </div>
      <div class="playlist-track-surface">
      <table class="track-table playlist-track-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-cover"></th>
            <th>标题</th>
            <th>歌手</th>
            <th class="col-album">专辑</th>
            <th class="col-dur">时长</th>
          </tr>
        </thead>
        <tbody>
          {#if isWaitingForTracks}
            {#each Array(10) as _, i}
              <tr class="skeleton-table-row">
                <td class="col-num">{i + 1}</td>
                <td class="col-cover"><div class="track-cover-placeholder skeleton-block"></div></td>
                <td class="col-title"><span class="skeleton-line"></span></td>
                <td class="col-artist"><span class="skeleton-line medium"></span></td>
                <td class="col-album"><span class="skeleton-line narrow"></span></td>
                <td class="col-dur"><span class="skeleton-line short"></span></td>
              </tr>
            {/each}
          {:else}
            {#if visibleTracks.length === 0 && !loading}
              <tr class="track-empty-row">
                <td colspan="6">没有匹配的歌曲</td>
              </tr>
            {/if}
            {#each visibleTracks as track, i (track.id)}
              <tr
                class:active={player.id === track.id}
                role="button"
                tabindex="0"
                onclick={() => onPlayTrack?.(track.id, visibleTracks)}
                onkeydown={(event) => handleRowKeydown(event, track)}
                {...songActions?.bindRow(track)}
              >
                <td class="col-num">{i + 1}</td>
                <td class="col-cover">
                  {#if coverOf(track)}
                    <img class="track-cover-img" src={coverUrl(coverOf(track), 80)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                  {:else}
                    <div class="track-cover-placeholder">
                      <Icon name="music-note" size={16} strokeWidth={1.5} />
                    </div>
                  {/if}
                </td>
                <td class="col-title">{track.name}</td>
                <td class="col-artist artist-links">
                  {#each artistsOf(track) as artist, index ((artist.id || artist.name) as SongId)}
                    {#if index > 0}<span class="artist-sep">/</span>{/if}
                    {#if artist.id}
                      <button class="artist-link" onclick={(event) => { event.stopPropagation(); onOpenArtist?.(artist.id) }}>{artist.name}</button>
                    {:else}
                      <span>{artist.name}</span>
                    {/if}
                  {/each}
                </td>
                <td class="col-album">{albumName(track)}</td>
                <td class="col-dur">{duration(track)}</td>
              </tr>
            {/each}
            {#if loadingMore && playlistDetail?.tracks?.length}
              <tr class="loading-more-row">
                <td colspan="6">
                  <span class="loading-more-spinner"></span>
                  正在加载更多歌曲…
                </td>
              </tr>
            {/if}
          {/if}
        </tbody>
      </table>
      </div>
    {:else}
      <div class="detail-state">
        <p>没有找到详情信息</p>
        <button onclick={onBack}>返回</button>
      </div>
    {/if}
  </div>
  <SongListActions onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onBindRow={(fn) => { songActions = { bindRow: fn } }} />
{/key}

<style>
  .playlist-detail-page {
    display: grid;
    gap: 18px;
  }

  .playlist-track-surface {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-elevated) 70%, transparent);
  }

  .playlist-track-table thead th {
    background: color-mix(in srgb, var(--bg-layer) 48%, transparent);
  }

  .playlist-track-table tbody tr {
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }

  .playlist-track-table tbody tr:last-child {
    border-bottom: 0;
  }

  .detail-state {
    min-height: 360px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: var(--text-secondary);
  }

  .detail-state p {
    margin: 0;
    font-size: 14px;
  }

  .detail-state button {
    min-height: 36px;
    padding: 0 16px;
    border-radius: var(--radius-lg);
    background: var(--accent-bg);
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
  }

  .detail-state button:hover {
    background: var(--accent-bg-hover);
  }

  .loading-more-row td {
    text-align: center;
    padding: 16px !important;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .loading-more-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 6px;
  }

  :global(html.mobile-runtime) .playlist-detail-page {
    gap: 12px;
    min-width: 0;
  }

  :global(html.mobile-runtime) .playlist-toolbar {
    position: sticky;
    top: 0;
    z-index: 6;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    margin: 0 -14px;
    padding: 10px 14px 8px;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    backdrop-filter: blur(22px) saturate(150%);
    -webkit-backdrop-filter: blur(22px) saturate(150%);
  }

  :global(html.mobile-runtime) .playlist-search {
    min-width: 0;
    height: 38px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
  }

  :global(html.mobile-runtime) .playlist-search input {
    min-width: 0;
    font-size: 13px;
  }

  :global(html.mobile-runtime) .playlist-toolbar-count {
    max-width: 82px;
    overflow: hidden;
    color: var(--text-tertiary);
    font-size: 11px;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(html.mobile-runtime) .playlist-track-surface {
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table,
  :global(html.mobile-runtime) .playlist-detail-page .track-table tbody,
  :global(html.mobile-runtime) .playlist-detail-page .track-table tr,
  :global(html.mobile-runtime) .playlist-detail-page .track-table td {
    display: block;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table thead,
  :global(html.mobile-runtime) .playlist-detail-page .track-table .col-num,
  :global(html.mobile-runtime) .playlist-detail-page .track-table .col-album,
  :global(html.mobile-runtime) .playlist-detail-page .track-table .col-dur {
    display: none !important;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table tbody {
    display: grid;
    gap: 2px;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table tbody tr {
    position: relative;
    min-width: 0;
    min-height: 62px;
    display: grid;
    grid-template-columns: 50px minmax(0, 1fr);
    grid-template-areas:
      "cover title"
      "cover artist";
    align-items: center;
    column-gap: 11px;
    padding: 8px 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 52%, transparent);
    border-radius: 0;
    background: transparent;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table tbody tr:hover {
    background: transparent;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table tbody tr.active {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--text);
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table tbody tr.active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 14px;
    bottom: 14px;
    width: 3px;
    border-radius: 999px;
    background: var(--accent);
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table .col-cover {
    grid-area: cover;
    width: 50px;
    padding: 0;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-cover-img,
  :global(html.mobile-runtime) .playlist-detail-page .track-cover-placeholder {
    width: 50px;
    height: 50px;
    border-radius: var(--radius-sm);
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table .col-title,
  :global(html.mobile-runtime) .playlist-detail-page .track-table .col-artist {
    min-width: 0;
    padding: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table .col-title {
    grid-area: title;
    align-self: end;
    color: var(--text);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.3;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table .col-artist {
    grid-area: artist;
    align-self: start;
    padding-top: 3px;
    color: var(--text-tertiary);
    font-size: 12px;
    line-height: 1.25;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table .artist-links {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    flex-wrap: nowrap;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table .artist-link {
    max-width: none;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-empty-row,
  :global(html.mobile-runtime) .playlist-detail-page .loading-more-row {
    display: block !important;
    min-height: 76px !important;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-empty-row td,
  :global(html.mobile-runtime) .playlist-detail-page .loading-more-row td {
    display: flex !important;
    justify-content: center;
    padding: 22px 0 !important;
  }

</style>
