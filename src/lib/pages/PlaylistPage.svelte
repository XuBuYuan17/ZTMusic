<script lang="ts">
  import { untrack } from 'svelte'
  import type { SongId } from '../types/music.ts'
  import { player } from '../stores/player.svelte.ts'
  import { coverUrl } from '../utils/image.ts'
  import SongListActions from '../components/SongListActions.svelte'
  import { queuePlaylist, sharePlaylist } from '../components/PlaylistActionSheet.svelte'
  import type { CompactTrackInput } from '../player/queue.ts'
  import PlaylistHero from '../components/PlaylistHero.svelte'
  import PlaylistSortSheet from '../components/PlaylistSortSheet.svelte'
  import PlaylistToolbar from '../components/PlaylistToolbar.svelte'
  import PlaylistTrackTable from '../components/PlaylistTrackTable.svelte'
  import PlaylistStatus from '../components/PlaylistStatus.svelte'
  import { getScrollViewport } from '../app/scroll-viewport.ts'
  import { getPageChromeHost, type PageAction } from '../app/page-chrome.svelte.ts'
  import { playlistViewKey, recallPlaylistView, rememberPlaylistView, type PlaylistViewKind } from './playlist-view-state.ts'
  import { playlistCountLabel, playlistEmptyText } from './playlist-copy.ts'
  import { playlistDisplayState, playlistFooterState } from './playlist-state.ts'
  import {
    filterAndSortPlaylistTracks,
    type PlaylistSortDir,
    type PlaylistSortKey,
  } from './playlist-sort.ts'

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
  type RowBinder = (track: unknown) => { oncontextmenu: (event: MouseEvent) => void }

  let {
    playlistDetail = null,
    loading = false,
    loadingMore = false,
    hasMore = false,
    error = '',
    selectedId = null,
    heroColor = '#141414',
    detailType = '歌单',
    recommendation = false,
    active = true,
    onBack,
    onPlayAll,
    onPlayTrack,
    onOpenArtist,
    onOpenAlbum,
    onLoadMore,
    onRetryLoad,
  }: {
    playlistDetail?: PlaylistDetailLike | null
    loading?: boolean
    loadingMore?: boolean
    hasMore?: boolean
    error?: string
    selectedId?: SongId | null
    heroColor?: string
    detailType?: string
    recommendation?: boolean
    /** 本页此刻是否可见；移动端会缓存多页，只有可见的那页向外壳声明操作 */
    active?: boolean
    onBack?: () => void
    onPlayAll?: (tracks?: DetailTrackLike[] | null, shuffled?: boolean) => void
    onPlayTrack?: (id: SongId, tracks?: DetailTrackLike[] | null) => void
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
    onLoadMore?: () => void
    /** 整页失败时重新进入详情（与「追加失败」的重试区分开） */
    onRetryLoad?: () => void
  } = $props()

  // 访问状态（搜索/排序）放在组件外：布局切换会销毁外壳并重新挂载本页
  const viewKind = (): PlaylistViewKind => recommendation ? 'recommendation' : detailType === '专辑' ? 'album' : 'playlist'
  // 首帧只需要初始资源的 key；后续变化由 viewKey 的 $derived 跟踪
  const initialViewKey = untrack(() => playlistViewKey(viewKind(), selectedId))
  const initialView = recallPlaylistView(initialViewKey)
  let songActions = $state<{ bindRow: RowBinder } | null>(null)
  let trackSearch = $state(initialView?.search ?? '')
  let trackSort = $state<PlaylistSortKey>(initialView?.sort ?? 'added')
  let trackSortDir = $state<PlaylistSortDir>(initialView?.dir ?? 'desc')
  let showSortSheet = $state(false)
  let heroMenuOpen = $state(false)
  let toolbar = $state<{ open: () => void } | null>(null)
  let lastViewKey = $state(initialViewKey)
  const viewKey = $derived(playlistViewKey(viewKind(), selectedId))
  const heroCover = $derived(playlistDetail?.coverImgUrl || playlistDetail?.picUrl ? coverUrl(playlistDetail.coverImgUrl || playlistDetail.picUrl, 64) : '')
  // 上下文只在组件初始化期可读；action / effect 内部只消费这份引用
  const scrollViewport = getScrollViewport()
  const pageChrome = getPageChromeHost()

  let visibleTracks = $derived(filterAndSortPlaylistTracks(playlistDetail?.tracks || [], trackSearch, trackSort, trackSortDir))
  // 搜索与排序只作用于「已加载的曲目」，不是整张歌单；界面上必须说清楚这一点
  const loadedCount = $derived(playlistDetail?.tracks?.length || 0)
  const emptyText = $derived(playlistEmptyText({ loadedCount, hasMore }))
  const countLabel = $derived(playlistCountLabel({ visibleCount: visibleTracks.length, loadedCount, hasMore }))
  const displayState = $derived(playlistDisplayState({
    loading,
    error,
    hasDetail: Boolean(playlistDetail),
    loadedCount,
  }))
  const footerState = $derived(playlistFooterState({
    loadingMore,
    error,
    hasMore,
    hasLoadedTracks: loadedCount > 0,
  }))


  let totalTrackCount = $derived(playlistDetail?.trackCount || playlistDetail?.trackIds?.length || playlistDetail?.tracks?.length || 0)
  let isWaitingForTracks = $derived(Boolean(loading && playlistDetail && (!playlistDetail.tracks || playlistDetail.tracks.length === 0)))
  let totalDuration = $derived((playlistDetail?.tracks || []).reduce((sum, track) => sum + (track.dt || 0), 0))
  let toolbarStuck = $state(false)
  // 首屏行错峰只播一次：之后搜索/排序让行跨过 i<14 边界也不重播
  let rowsIntro = $state(true)
  $effect(() => {
    if (!visibleTracks.length || !rowsIntro) return
    const timer = setTimeout(() => rowsIntro = false, 900)
    return () => clearTimeout(timer)
  })

  function playShuffled(): void {
    player.setMode('shuffle')
    onPlayAll?.(visibleTracks, true)
  }

  // ── 页面操作 ──
  // 顶部栏与内容区（hero 的「更多」、菜单里的「分享/搜索与排序」）调用的是同一批函数，
  // 不再靠查 DOM + 派发 playlist-share / playlist-more 自定义事件。
  function shareCurrent(): void {
    const detail = playlistDetail
    if (recommendation || !detail?.id) return
    void sharePlaylist(detail.id, detail.name, detailType)
  }
  function openMoreMenu(): void { heroMenuOpen = true }
  // 展开与聚焦都交给工具栏自己（它持有搜索框的本地引用），页面只负责转发一次调用
  function focusTools(): void { toolbar?.open() }
  function pageActions(): PageAction[] {
    return [
      { id: 'share', label: `分享${detailType}`, icon: 'share', placement: 'top', disabled: recommendation || !playlistDetail?.id, run: shareCurrent },
      { id: 'more', label: `${detailType}操作`, icon: 'more', placement: 'top', disabled: !playlistDetail, run: openMoreMenu },
      { id: 'tools', label: '搜索与排序', icon: 'search', placement: 'content', run: focusTools },
    ]
  }
  // 只有可见的那一页向外壳声明操作；离开时自动注销，顶部栏不会残留上一个歌单的操作
  $effect(() => {
    if (!active || !pageChrome) return
    return pageChrome.register(() => ({
      title: playlistDetail?.name || '',
      back: () => onBack?.(),
      actions: pageActions(),
    }))
  })

  // 滚动容器与可见区域由外壳经上下文提供，页面不再猜自己是宽屏还是窄屏
  // ponytail: WebKitGTK 支持 animation-timeline: scroll() 后，--hero-p 可改纯 CSS，只留吸顶判断
  function heroScroll(node: HTMLElement, onStuck: (stuck: boolean) => void) {
    const viewport = scrollViewport
    const scroller = viewport?.element() ?? null
    if (!viewport || !scroller) return {}
    viewport.entered()
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const update = () => {
      frame = 0
      const hero = node.querySelector<HTMLElement>('.playlist-detail-hero')
      if (!hero) return
      const rect = hero.getBoundingClientRect()
      const top = viewport.top()
      if (!still) hero.style.setProperty('--hero-p', String(Math.min(1, Math.max(0, (top - rect.top) / rect.height)).toFixed(3)))
      // 吸顶外观只在桌面生效，由 CSS 门控；这里不按布局分支
      onStuck(rect.bottom <= top)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    scroller.addEventListener('scroll', schedule, { passive: true })
    return { destroy() { cancelAnimationFrame(frame); scroller.removeEventListener('scroll', schedule) } }
  }

  // 换资源：取该资源自己的暂存，没有就用默认值（绝不继承上一个资源的筛选）
  $effect(() => {
    const key = viewKey
    if (lastViewKey === key) return
    lastViewKey = key
    const saved = recallPlaylistView(key)
    trackSearch = saved?.search ?? ''
    trackSort = saved?.sort ?? 'added'
    trackSortDir = saved?.dir ?? 'desc'
    showSortSheet = false
    heroMenuOpen = false
  })
  // 写回当前资源；刚切换的那一帧由上面的重置负责，避免把旧值写到新 key 上
  $effect(() => {
    const key = viewKey
    if (key !== lastViewKey) return
    rememberPlaylistView(key, { search: trackSearch, sort: trackSort, dir: trackSortDir })
  })

  function setSort(sort: PlaylistSortKey): void {
    if (trackSort === sort) {
      trackSortDir = trackSortDir === 'asc' ? 'desc' : 'asc'
      return
    }
    trackSort = sort
    trackSortDir = sort === 'title' || sort === 'artist' ? 'asc' : 'desc'
  }

</script>
{#key selectedId}
  <div class="playlist-detail-page" class:is-loading={loading} class:is-ready={!loading && Boolean(playlistDetail)} class:rows-intro={rowsIntro} use:heroScroll={(stuck) => toolbarStuck = stuck}>
    {#if !playlistDetail && displayState !== 'failed'}
      <PlaylistHero {onBack} />
    {:else if playlistDetail}
      <PlaylistHero
        detail={playlistDetail}
        {loading}
        {loadingMore}
        {heroColor}
        {detailType}
        coverIsBundled={recommendation}
        bind:showMenu={heroMenuOpen}
        totalCount={totalTrackCount}
        visibleCount={visibleTracks.length}
        {totalDuration}
        {onBack}
        onPlayAll={() => onPlayAll?.(visibleTracks)}
        onShuffle={playShuffled}
        onQueue={() => void queuePlaylist(playlistDetail!.id, 'append', visibleTracks as unknown as CompactTrackInput[])}
        onNext={() => void queuePlaylist(playlistDetail!.id, 'next', visibleTracks as unknown as CompactTrackInput[])}
        onMore={openMoreMenu}
        onShare={recommendation ? undefined : shareCurrent}
        onTools={focusTools}
      />
    {/if}

    {#if displayState === 'initial-loading'}
      <PlaylistStatus variant="loading" />
      <div class="playlist-track-surface playlist-loading-surface">
        <PlaylistTrackTable skeleton sort={trackSort} direction={trackSortDir} />
      </div>
    {:else if displayState === 'failed'}
      <PlaylistStatus variant="error" message={error} retrying={loading} onRetry={onRetryLoad} {onBack} />
    {:else if displayState === 'missing'}
      <PlaylistStatus variant="empty" {onBack} />
    {:else if displayState === 'batch-failed'}
      <PlaylistStatus variant="error" message={error} retrying={loadingMore} onRetry={onLoadMore} {onBack} />
    {:else if playlistDetail}
      <PlaylistToolbar
        bind:this={toolbar}
        title={playlistDetail.name}
        cover={heroCover}
        stuck={toolbarStuck}
        bind:search={trackSearch}
        sort={trackSort}
        direction={trackSortDir}
        waiting={isWaitingForTracks}
        visibleCount={visibleTracks.length}
        totalCount={loadedCount}
        {countLabel}
        sortSheetOpen={showSortSheet}
        canPlay={visibleTracks.length > 0}
        onPlayAll={() => onPlayAll?.(visibleTracks)}
        onSort={setSort}
        onFlipDirection={() => trackSortDir = trackSortDir === 'asc' ? 'desc' : 'asc'}
        onOpenSortSheet={() => showSortSheet = true}
      />
      <div class="playlist-track-surface">
        {#if isWaitingForTracks}<PlaylistStatus variant="waiting" />{/if}
        <PlaylistTrackTable
          tracks={visibleTracks}
          waiting={isWaitingForTracks}
          {loading}
          {hasMore}
          {loadingMore}
          {error}
          currentId={player.id}
          showFooter={footerState !== 'hidden'}
          {emptyText}
          sort={trackSort}
          direction={trackSortDir}
          rowActions={songActions?.bindRow ?? null}
          onSort={setSort}
          onPlay={(id, list) => onPlayTrack?.(id, list)}
          {onOpenArtist}
          {onOpenAlbum}
          {onLoadMore}
        />
      </div>
    {/if}
  </div>
  <SongListActions onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onBindRow={(fn) => { songActions = { bindRow: fn } }} />
  <PlaylistSortSheet show={showSortSheet} sort={trackSort} direction={trackSortDir} onSort={(sort) => { if (sort !== trackSort) setSort(sort) }} onDirection={(direction) => trackSortDir = direction} onClose={() => showSortSheet = false} />
{/key}

<style>
  /* 页面只剩自己的布局容器：工具栏、曲目表、状态展示已交给子组件 */
  .playlist-detail-page {
    display: grid;
    gap: 18px;
    transform-origin: 50% 0;
    animation: playlistPageIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .playlist-track-surface {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-elevated) 70%, transparent);
    animation: playlistSurfaceIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
  }

  .playlist-loading-surface {
    animation-delay: 0.06s;
  }

  @keyframes playlistPageIn {
    from { opacity: 0; transform: translateY(12px) scale(0.992); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes playlistSurfaceIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  :global(html.mobile-runtime) .playlist-detail-page {
    gap: 12px;
    min-width: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .playlist-detail-page,
    .playlist-track-surface {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }

  /* 桌面：页面整体入场由 host 的 pageMotion 处理 */
  :global(html:not(.mobile-runtime)) .playlist-detail-page,
  :global(html:not(.mobile-runtime)) .playlist-track-surface {
    animation: none;
    opacity: 1;
    transform: none;
  }
</style>
