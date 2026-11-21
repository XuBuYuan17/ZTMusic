<script lang="ts">
  import { tick } from 'svelte'
  import Icon from './ui/Icon.svelte'
  import {
    playlistSortDirectionLabel,
    playlistSortLabel,
    type PlaylistSortDir,
    type PlaylistSortKey,
  } from '../pages/playlist-sort.ts'

  // 只负责呈现与输入：不请求歌单详情，搜索/排序的值由页面持有
  let {
    title = '',
    cover = '',
    stuck = false,
    search = $bindable(''),
    sort,
    direction,
    waiting = false,
    visibleCount = 0,
    totalCount = 0,
    countLabel = '',
    sortSheetOpen = false,
    canPlay = false,
    onPlayAll,
    onSort,
    onFlipDirection,
    onOpenSortSheet,
  }: {
    title?: string
    cover?: string
    stuck?: boolean
    search?: string
    sort: PlaylistSortKey
    direction: PlaylistSortDir
    waiting?: boolean
    visibleCount?: number
    totalCount?: number
    /** 计数的完整语义（匹配 N 首 / 已加载 M 首），避免把局部结果说成全量 */
    countLabel?: string
    sortSheetOpen?: boolean
    canPlay?: boolean
    onPlayAll?: () => void
    onSort?: (sort: PlaylistSortKey) => void
    onFlipDirection?: () => void
    onOpenSortSheet?: () => void
  } = $props()

  let input = $state<HTMLInputElement | null>(null)
  /** 窄布局下工具栏默认收起；由页面通过 open() 展开并聚焦 */
  let expanded = $state(false)
  const sortName = $derived(playlistSortLabel(sort))
  const directionName = $derived(playlistSortDirectionLabel(sort, direction))

  /** 展开并把焦点送进搜索框：只用本地元素引用，不查文档 */
  export function open(): void {
    expanded = true
    void tick().then(() => input?.focus())
  }
</script>

<div class="playlist-toolbar" class:is-stuck={stuck} class:is-open={expanded}>
  <div class="playlist-toolbar-title" inert={!stuck}>
    {#if cover}<img src={cover} alt="" referrerpolicy="no-referrer" />{/if}
    <strong>{title}</strong>
    <button type="button" onclick={() => onPlayAll?.()} disabled={!canPlay} aria-label="播放全部">
      <Icon name="play" size={14} fill="currentColor" />
    </button>
  </div>
  <label class="playlist-search" aria-label="搜索歌单歌曲">
    <Icon name="search" size={16} strokeWidth={1.8} />
    <input bind:this={input} bind:value={search} placeholder="搜索歌单内歌曲、歌手、专辑" />
    {#if search}
      <button type="button" onclick={() => search = ''} aria-label="清空搜索">
        <Icon name="close" size={14} strokeWidth={2} />
      </button>
    {/if}
  </label>

  <div class="playlist-sort-controls">
    <button class="playlist-sort-mobile" type="button" aria-label="选择歌曲排序" aria-haspopup="dialog" aria-expanded={sortSheetOpen} onclick={() => onOpenSortSheet?.()}>
      <span>{sortName}</span><span>{directionName}</span><Icon name="chevron-down" size={18} />
    </button>
    <label class="playlist-sort-select">
      <span>排序</span>
      <select value={sort} onchange={(event) => onSort?.((event.currentTarget as HTMLSelectElement).value as PlaylistSortKey)} aria-label="歌曲排序方式">
        <option value="added">加入时间</option>
        <option value="title">歌曲</option>
        <option value="artist">歌手</option>
        <option value="duration">时长</option>
      </select>
    </label>
    <button
      class="playlist-sort-direction"
      type="button"
      onclick={() => onFlipDirection?.()}
      aria-label={`${sortName}：${directionName}，点击切换`}
      title={directionName}
    >
      <span aria-hidden="true">{direction === 'asc' ? '↑' : '↓'}</span>
      {directionName}
    </button>
  </div>

  <span class="playlist-toolbar-count" title={waiting ? '正在加载歌曲' : countLabel} aria-label={waiting ? '正在加载歌曲' : countLabel}>{#if waiting}正在加载歌曲…{:else}{visibleCount} / {totalCount}{/if}</span>
</div>

<style>
  .playlist-sort-mobile { display: none; }
  :global(html.mobile-runtime) .playlist-sort-mobile { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; min-height: 48px; padding: 0 12px; border: 0; border-radius: 999px; color: var(--text); background: var(--md-container); font-size: 13px; }
  :global(html.mobile-runtime) .playlist-sort-mobile span:first-child { font-weight: 500; }
  :global(html.mobile-runtime) .playlist-sort-mobile span:nth-child(2) { margin-left: auto; color: var(--md-primary); font-size: 11px; }
  :global(html.mobile-runtime) .playlist-sort-controls > :is(.playlist-sort-select, .playlist-sort-direction) { display: none; }

  .playlist-toolbar {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    animation: playlistToolbarIn 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0.06s both;
  }

  .playlist-sort-controls {
    height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--bg-elevated) 84%, transparent);
  }

  .playlist-sort-select {
    height: 32px;
    display: flex;
    align-items: center;
    gap: 5px;
    padding-left: 8px;
    color: var(--text-tertiary);
    font-size: 11px;
    white-space: nowrap;
  }

  .playlist-sort-select select {
    min-width: 76px;
    height: 30px;
    padding: 0 6px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .playlist-sort-direction {
    min-width: 88px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 9px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 9%, transparent);
    color: var(--accent);
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    transition: background 0.18s ease, transform 0.18s ease;
  }

  .playlist-sort-direction:hover {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
  }

  .playlist-sort-direction:active {
    transform: scale(0.97);
  }

  @keyframes playlistToolbarIn {
    from { opacity: 0; transform: translateY(7px); }
    to { opacity: 1; transform: translateY(0); }
  }

  :global(html.mobile-runtime) .playlist-toolbar {
    position: sticky;
    top: 0;
    z-index: 6;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 6px 0;
    background: var(--md-surface);
    border-bottom: 0;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* 窄布局：工具栏默认收起，页面通过 open() 展开；展开/收起由组件自己管，页面不再打标 */
  :global(html.mobile-runtime) .playlist-toolbar { display: none; }
  :global(html.mobile-runtime) .playlist-toolbar.is-open { display: grid; }

  :global(html.mobile-runtime) .playlist-sort-controls {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
    width: 100%;
    height: 54px;
    border: 0;
    background: var(--md-container);
  }

  :global(html.mobile-runtime) .playlist-sort-select {
    flex: 1;
    min-width: 0;
  }

  :global(html.mobile-runtime) .playlist-sort-select select {
    flex: 1;
    min-width: 0;
    height: 48px;
  }

  :global(html.mobile-runtime) .playlist-sort-direction { min-width: 48px; height: 48px; color: var(--md-primary); background: var(--md-primary-container); }

  :global(html.mobile-runtime) .playlist-search {
    grid-column: 1 / -1;
    min-width: 0;
    min-height: 48px;
    border-radius: var(--radius-sm);
    background: var(--md-container-high);
  }

  :global(html.mobile-runtime) .playlist-search input {
    min-width: 0;
    font-size: 16px;
  }

  :global(html.mobile-runtime) .playlist-toolbar-count {
    grid-column: 2;
    grid-row: 2;
    align-self: center;
    max-width: 82px;
    overflow: hidden;
    color: var(--text-tertiary);
    font-size: 11px;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 1060px) and (min-width: 721px) {
    .playlist-toolbar {
      grid-template-columns: minmax(220px, 1fr) auto;
    }

    .playlist-toolbar-count {
      display: none;
    }
  }

  @media (max-width: 820px) and (min-width: 721px) {
    .playlist-sort-direction {
      min-width: 36px;
      width: 36px;
      padding: 0;
      font-size: 0;
    }

    .playlist-sort-direction span {
      font-size: 14px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .playlist-toolbar {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }

  /* 桌面：页面整体入场由 host 的 pageMotion 处理，工具栏不再自己播放入场 */
  :global(html:not(.mobile-runtime)) .playlist-toolbar {
    animation: none;
    opacity: 1;
    transform: none;
    position: sticky;
    top: 0;
    z-index: 5;
    grid-template-columns: auto minmax(260px, 1fr) auto auto;
    margin: 0 -12px;
    padding: 8px 12px;
    border-bottom: 1px solid transparent;
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    transition: background-color var(--motion-release) var(--ease-out), border-color var(--motion-release) var(--ease-out), backdrop-filter var(--motion-release) var(--ease-out);
  }

  :global(html:not(.mobile-runtime)) .playlist-toolbar.is-stuck {
    /* 右上角全局返回胶囊占位 */
    padding-right: 104px;
    border-bottom-color: var(--border);
    background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .playlist-toolbar-title {
    display: none;
  }

  :global(html:not(.mobile-runtime)) .playlist-toolbar-title {
    min-width: 0;
    max-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    margin-right: -10px;
    overflow: hidden;
    opacity: 0;
    transform: translateX(-8px);
    transition: max-width var(--motion-panel) var(--ease-out), margin var(--motion-panel) var(--ease-out), opacity var(--motion-release) var(--ease-out), transform var(--motion-panel) var(--ease-out);
  }

  :global(html:not(.mobile-runtime)) .playlist-toolbar.is-stuck .playlist-toolbar-title {
    max-width: 320px;
    margin-right: 8px;
    opacity: 1;
    transform: none;
  }

  .playlist-toolbar-title img {
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: var(--radius-xs);
    object-fit: cover;
  }

  .playlist-toolbar-title strong {
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .playlist-toolbar-title button {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: white;
    background: var(--accent);
    transition: filter var(--motion-release) var(--ease-out);
  }

  .playlist-toolbar-title button:hover:not(:disabled) { filter: brightness(1.08); }
  .playlist-toolbar-title button:disabled { opacity: .48; }
</style>
