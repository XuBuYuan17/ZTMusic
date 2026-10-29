<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { SongId } from '../types/music.ts'
  import SongRow from './SongRow.svelte'
  import { withRowKeys, type SongRowData } from './song-row.ts'

  // 共享歌曲列表：只负责表格骨架、表头插槽、行渲染、序号与当前播放标识。
  // 搜索、排序、队列策略全部由上层通过 rows / onPlay / header 决定，这里不碰播放器。
  let {
    rows = [],
    header,
    skeleton = false,
    waiting = false,
    loading = false,
    currentId = null,
    rowActions = null,
    emptyText = '没有匹配的歌曲',
    skeletonLabel = '加载歌曲',
    showFooter = false,
    hasMore = false,
    loadingMore = false,
    error = '',
    onPlay,
    onOpenArtist,
    onOpenAlbum,
    onLoadMore,
    /** 行菜单：右键/更多/键盘/长按最终都走同一个入口 */
    onRowMenu,
  }: {
    /** 已归一、已按上层策略排好序的行 */
    rows?: SongRowData[]
    /** 表头由上层提供（例如歌单的可排序表头）；不传则只有列宽样式 */
    header?: Snippet
    /** 纯骨架：表头仍由上层提供，表体显示占位行 */
    skeleton?: boolean
    /** 曲目还在补：表头正常、表体骨架 */
    waiting?: boolean
    loading?: boolean
    /** 与播放器当前曲目一致的行（沿用播放器状态来源） */
    currentId?: SongId | number | null
    rowActions?: ((track: unknown) => { oncontextmenu: (event: MouseEvent) => void }) | null
    emptyText?: string
    skeletonLabel?: string
    /** 是否渲染底部「加载更多」行（由上层根据分页状态决定） */
    showFooter?: boolean
    hasMore?: boolean
    loadingMore?: boolean
    error?: string
    onPlay?: (row: SongRowData) => void
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
    onLoadMore?: () => void
    onRowMenu?: (row: SongRowData, event: MouseEvent) => void
  } = $props()

  const keyed = $derived(withRowKeys(rows))
  const showSkeleton = $derived(skeleton || waiting)

  // ── 触摸长按打开行菜单 ──
  // 逐行挂手势会产生成百上千个监听器，这里在 <tbody> 上统一识别一次；
  // 位移超过阈值、列表滚动、抬手都会取消，避免滚动时误开菜单。
  const LONG_PRESS_MS = 500
  const MOVE_TOLERANCE_PX = 10
  const CLICK_BLOCK_MS = 700
  let pressPointer: { id: number; index: number; element: HTMLElement } | null = null
  let pressTimer: ReturnType<typeof setTimeout> | undefined
  let pressOrigin = { x: 0, y: 0 }
  let clickBlockedUntil = 0
  let blockedPointer: number | null = null

  function cancelPress(): void {
    clearTimeout(pressTimer)
    pressTimer = undefined
    pressPointer = null
  }

  function isClickBlocked(): boolean {
    return Date.now() < clickBlockedUntil
  }

  function rowOf(target: EventTarget | null): { index: number; element: HTMLElement } | null {
    if (!(target instanceof Element)) return null
    const element = target.closest<HTMLElement>('[data-row-index]')
    if (!element) return null
    const index = Number(element.dataset.rowIndex)
    return Number.isInteger(index) ? { index, element } : null
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!(onRowMenu || rowActions) || event.pointerType === 'mouse' || !event.isPrimary) return
    // 行内按钮/链接有自己的点击语义，长按不接管
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select')) return
    const hit = rowOf(event.target)
    if (!hit) return
    cancelPress()
    pressPointer = { id: event.pointerId, index: hit.index, element: hit.element }
    pressOrigin = { x: event.clientX, y: event.clientY }
    pressTimer = setTimeout(() => {
      pressTimer = undefined
      const press = pressPointer
      pressPointer = null
      const entry = press ? keyed[press.index] : undefined
      if (!press || !entry) return
      // 与右键/键盘一致：先把焦点放到行上，Escape 关闭后焦点能回到这一行
      press.element.focus({ preventScroll: true })
      blockedPointer = event.pointerId
      clickBlockedUntil = Number.POSITIVE_INFINITY
      if (onRowMenu) onRowMenu(entry.row, event)
      else rowActions?.(entry.row.source).oncontextmenu(event)
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!pressPointer || event.pointerId !== pressPointer.id) return
    if (Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > MOVE_TOLERANCE_PX) cancelPress()
  }

  function handlePointerEnd(event: PointerEvent): void {
    if (blockedPointer === event.pointerId) {
      blockedPointer = null
      clickBlockedUntil = Date.now() + CLICK_BLOCK_MS
    }
    if (pressPointer && event.pointerId === pressPointer.id) cancelPress()
  }

  // 列表滚动时取消待触发/进行中的长按：手指按住不动、内容却被滚走时不该弹菜单
  $effect(() => {
    window.addEventListener('scroll', cancelPress, true)
    window.addEventListener('pointerup', handlePointerEnd, true)
    window.addEventListener('pointercancel', handlePointerEnd, true)
    return () => {
      window.removeEventListener('scroll', cancelPress, true)
      window.removeEventListener('pointerup', handlePointerEnd, true)
      window.removeEventListener('pointercancel', handlePointerEnd, true)
      cancelPress()
      blockedPointer = null
      clickBlockedUntil = 0
    }
  })

  // 滚动触底自动加载更多：哨兵行进入视口即触发。action 只挂一次，回调里读最新状态
  function loadMoreSentinel(
    node: Element,
    control: { hasMore: () => boolean; loadingMore: () => boolean; error: () => string },
  ): { destroy: () => void } {
    if (typeof IntersectionObserver === 'undefined') return { destroy: () => {} }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry?.isIntersecting && control.hasMore() && !control.loadingMore() && !control.error()) onLoadMore?.()
    }, { rootMargin: '240px 0px' })
    observer.observe(node)
    return { destroy: () => observer.disconnect() }
  }
</script>

<table class="track-table" class:playlist-track-table={!skeleton} aria-label={skeleton ? skeletonLabel : undefined} aria-busy={skeleton ? 'true' : undefined}>
  <thead>{@render header?.()}</thead>
  <tbody
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerEnd}
    onpointercancel={handlePointerEnd}
  >
    {#if showSkeleton}
      {#each Array(10) as _, i}
        <tr class="skeleton-table-row playlist-skeleton-row" style={`--playlist-row-i:${i}`}>
          <td class="col-num">{i + 1}</td>
          <td class="col-cover"><div class="track-cover-placeholder skeleton-block"></div></td>
          <td class="col-title"><span class="skeleton-line"></span></td>
          <td class="col-artist"><span class="skeleton-line medium"></span></td>
          <td class="col-album"><span class="skeleton-line narrow"></span></td>
          <td class="col-added"><span class="skeleton-line short"></span></td>
          <td class="col-dur"><span class="skeleton-line short"></span></td>
        </tr>
      {/each}
    {:else}
      {#if rows.length === 0 && !loading}
        <tr class="track-empty-row">
          <td colspan="7">{emptyText}</td>
        </tr>
      {/if}
      {#each keyed as { key, row }, i (key)}
        <SongRow {row} index={i} current={currentId === row.id} {rowActions} clickBlocked={isClickBlocked}
          onPlay={() => onPlay?.(row)} {onOpenArtist} {onOpenAlbum} />
      {/each}
      {#if showFooter}
        <tr class="loading-more-row" use:loadMoreSentinel={{ hasMore: () => hasMore, loadingMore: () => loadingMore, error: () => error }}>
          <td colspan="7">
            {#if error && !loadingMore}
              <span role="status">{error}</span>
              {#if hasMore}<button type="button" onclick={() => onLoadMore?.()}>重试加载</button>{/if}
            {:else}
              {#if loadingMore}
                <span class="loading-more-spinner"></span>
              {/if}
              {loadingMore ? '正在加载更多歌曲…' : '下滑加载更多'}
            {/if}
          </td>
        </tr>
      {/if}
    {/if}
  </tbody>
</table>

<style>
  /* 骨架行属于列表自己 */
  .playlist-skeleton-row {
    opacity: 0;
    animation: playlistSkeletonRowIn 0.34s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(0.08s + var(--playlist-row-i, 0) * 34ms);
  }

  .playlist-skeleton-row .skeleton-block,
  .playlist-skeleton-row .skeleton-line {
    background: color-mix(in srgb, var(--bg-elevated) 78%, var(--border) 22%);
  }

  /* 表头与列宽由上层提供的表头元素承载，只能整段 global */
  :global(.playlist-track-table thead th) {
    height: 42px;
    padding-top: 0;
    padding-bottom: 0;
    background: color-mix(in srgb, var(--bg-layer) 48%, transparent);
  }

  .playlist-track-table {
    table-layout: fixed;
  }

  :global(.playlist-track-table .col-num) { width: 46px; padding-right: 8px; }
  :global(.playlist-track-table .col-cover) { width: 56px; }
  :global(.playlist-track-table .col-title) { width: 27%; }
  :global(.playlist-track-table .col-artist) { width: 24%; }
  :global(.playlist-track-table .col-album) { width: 22%; }
  :global(.playlist-track-table .col-added) { width: 116px; }
  :global(.playlist-track-table .col-dur) { width: 74px; }

  /* 行与单元格的实际元素在 SongRow / 上层表头里，必须整段 global 才能命中，
     同时继续覆盖列表自己的空态行与加载更多行。 */
  :global(.playlist-track-table tbody tr) {
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    transition: background 0.16s ease, box-shadow 0.16s ease;
  }

  :global(.playlist-track-table tbody tr:hover) {
    background: color-mix(in srgb, var(--bg-hover) 82%, transparent);
  }

  :global(html:not(.mobile-runtime) .playlist-track-table tbody tr.active) { background: color-mix(in srgb, var(--text) 7%, var(--bg-surface)); box-shadow: none; }
  :global(html:not(.mobile-runtime) .playlist-track-table tbody tr.active .col-title) { color: var(--accent); }

  :global(.playlist-track-table tbody td) {
    height: 54px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.playlist-track-table .col-title) {
    color: var(--text);
    font-weight: 500;
  }

  :global(.playlist-track-table .col-added) {
    color: var(--text-tertiary);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  :global(.playlist-track-table .col-dur) {
    font-variant-numeric: tabular-nums;
  }

  :global(.playlist-track-table tbody tr:last-child) {
    border-bottom: 0;
  }

  .loading-more-row td {
    text-align: center;
    padding: 16px !important;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .loading-more-row button {
    min-height: 36px;
    margin-left: 12px;
    padding: 0 16px;
    border-radius: var(--radius-lg);
    background: var(--accent-bg);
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
  }

  .loading-more-row button:hover {
    background: var(--accent-bg-hover);
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

  @keyframes playlistSkeletonRowIn {
    from { opacity: 0; transform: translateX(-8px); }
    to { opacity: 1; transform: translateX(0); }
  }

  /* 窄布局：表格结构变卡片。td 在 SongRow 里，单列出来整段 global */
  :global(html.mobile-runtime) :global(.playlist-detail-page) .track-table,
  :global(html.mobile-runtime) :global(.playlist-detail-page) .track-table tbody {
    display: block;
  }

  :global(html.mobile-runtime .playlist-detail-page .track-table td) {
    display: block;
  }

  :global(html.mobile-runtime) :global(.playlist-detail-page) .track-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
  }

  :global(html.mobile-runtime .playlist-detail-page .track-table thead),
  :global(html.mobile-runtime .playlist-detail-page .track-table .col-num),
  :global(html.mobile-runtime .playlist-detail-page .track-table .col-added) {
    display: none !important;
  }

  :global(html.mobile-runtime) :global(.playlist-detail-page) .track-table tbody {
    display: grid;
    gap: 4px;
  }

  :global(html.mobile-runtime) :global(.playlist-detail-page) .track-empty-row,
  :global(html.mobile-runtime) :global(.playlist-detail-page) .loading-more-row {
    display: block !important;
    min-height: 76px !important;
  }

  :global(html.mobile-runtime) :global(.playlist-detail-page) .track-empty-row td,
  :global(html.mobile-runtime) :global(.playlist-detail-page) .loading-more-row td {
    display: flex !important;
    justify-content: center;
    padding: 22px 0 !important;
  }

  /* 列显隐同时作用于表头 th 与 SongRow 的 td */
  @media (max-width: 1060px) and (min-width: 721px) {
    :global(.playlist-track-table .col-album) {
      display: none;
    }

    :global(.playlist-track-table .col-title) { width: 34%; }
    :global(.playlist-track-table .col-artist) { width: 30%; }
  }

  @media (max-width: 820px) and (min-width: 721px) {
    :global(.playlist-track-table .col-added) {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .playlist-skeleton-row {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }

  :global(html:not(.mobile-runtime)) .playlist-skeleton-row {
    animation: none;
    opacity: 1;
    transform: none;
  }
</style>
