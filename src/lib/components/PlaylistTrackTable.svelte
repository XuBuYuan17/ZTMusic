<script lang="ts">
  import type { SongId } from '../types/music.ts'
  import SongList from './SongList.svelte'
  import { toSongRows } from './song-row.ts'
  import {
    playlistAriaSort,
    type PlaylistSortDir,
    type PlaylistSortKey,
  } from '../pages/playlist-sort.ts'

  // 歌单页的适配层：只把「歌单特有的排序表头 + 分页状态」翻译成共享列表的输入。
  // 搜索词、排序键、队列策略都由页面决定，这里不持有业务状态。
  interface TrackLike {
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
  type RowBinder = (track: unknown) => { oncontextmenu: (event: MouseEvent) => void }

  let {
    tracks = [],
    skeleton = false,
    waiting = false,
    loading = false,
    hasMore = false,
    loadingMore = false,
    error = '',
    currentId = null,
    showFooter = false,
    emptyText = '没有匹配的歌曲',
    sort,
    direction,
    rowActions = null,
    onSort,
    onPlay,
    onOpenArtist,
    onOpenAlbum,
    onLoadMore,
  }: {
    tracks?: TrackLike[]
    /** 详情还没到：纯骨架表，表头不可排序 */
    skeleton?: boolean
    /** 详情到了、曲目还在补：可排序表头 + 骨架行 */
    waiting?: boolean
    loading?: boolean
    hasMore?: boolean
    loadingMore?: boolean
    error?: string
    currentId?: SongId | number | null
    /** 是否渲染底部「加载更多/追加失败」行（由页面的分页状态决定） */
    showFooter?: boolean
    /** 空态文案由页面决定：歌单为空 / 已加载范围内没有匹配 */
    emptyText?: string
    sort: PlaylistSortKey
    direction: PlaylistSortDir
    rowActions?: RowBinder | null
    onSort?: (sort: PlaylistSortKey) => void
    /** 上层决定「播放哪一串」：这里把当前可见列表原样回传 */
    onPlay?: (id: SongId, tracks: TrackLike[]) => void
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
    onLoadMore?: () => void
  } = $props()

  const rows = $derived(toSongRows(tracks))
</script>

<SongList
  {rows}
  {skeleton}
  {waiting}
  {loading}
  {currentId}
  {rowActions}
  skeletonLabel="加载详情歌曲"
  {emptyText}
  {showFooter}
  {hasMore}
  {loadingMore}
  {error}
  {onLoadMore}
  onPlay={(row) => onPlay?.(row.id, tracks)}
  {onOpenArtist}
  {onOpenAlbum}
  onRowMenu={(row, event) => rowActions?.(row.source).oncontextmenu(event)}
>
  {#snippet header()}
    <tr>
      <th class="col-num">#</th>
      <th class="col-cover"></th>
      {#if skeleton}
        <th>标题</th>
        <th>歌手</th>
        <th class="col-album">专辑</th>
        <th class="col-added">加入时间</th>
        <th class="col-dur">时长</th>
      {:else}
        <th aria-sort={playlistAriaSort(sort, direction, 'title')}>
          <button type="button" class:active={sort === 'title'} class="table-sort-button" onclick={() => onSort?.('title')}>
            歌曲 <span aria-hidden="true">{sort === 'title' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
          </button>
        </th>
        <th aria-sort={playlistAriaSort(sort, direction, 'artist')}>
          <button type="button" class:active={sort === 'artist'} class="table-sort-button" onclick={() => onSort?.('artist')}>
            歌手 <span aria-hidden="true">{sort === 'artist' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
          </button>
        </th>
        <th class="col-album">专辑</th>
        <th class="col-added" aria-sort={playlistAriaSort(sort, direction, 'added')}>
          <button type="button" class:active={sort === 'added'} class="table-sort-button" onclick={() => onSort?.('added')}>
            加入时间 <span aria-hidden="true">{sort === 'added' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
          </button>
        </th>
        <th class="col-dur" aria-sort={playlistAriaSort(sort, direction, 'duration')}>
          <button type="button" class:active={sort === 'duration'} class="table-sort-button table-sort-button--end" onclick={() => onSort?.('duration')}>
            时长 <span aria-hidden="true">{sort === 'duration' ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
          </button>
        </th>
      {/if}
    </tr>
  {/snippet}
</SongList>

<style>
  /* 表头元素由本组件提供，样式也留在这里（共享列表只保留列宽） */
  .table-sort-button {
    max-width: 100%;
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: -7px;
    padding: 0 7px;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    transition: color 0.16s ease, background 0.16s ease;
  }

  .table-sort-button span {
    color: color-mix(in srgb, var(--text-tertiary) 58%, transparent);
    font-size: 10px;
  }

  .table-sort-button:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .table-sort-button.active,
  .table-sort-button.active span {
    color: var(--accent);
  }

  .table-sort-button--end {
    width: calc(100% + 7px);
    justify-content: flex-end;
  }
</style>
