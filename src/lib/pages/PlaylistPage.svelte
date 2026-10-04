<script lang="ts">
  import { tick } from 'svelte'
  import type { SongId } from '../types/music.ts'
  import { player } from '../stores/player.svelte.ts'
  import { formatDuration } from '../format.ts'
  import { coverUrl } from '../utils/image.ts'
  import SongListActions from '../components/SongListActions.svelte'
  import { queuePlaylist } from '../components/PlaylistActionSheet.svelte'
  import type { CompactTrackInput } from '../player/queue.ts'
  import PlaylistHero from '../components/PlaylistHero.svelte'
  import PlaylistSortSheet from '../components/PlaylistSortSheet.svelte'
  import Icon from '../components/ui/Icon.svelte'
  import {
    filterAndSortPlaylistTracks,
    playlistAddedTime,
    playlistArtistText,
    playlistDuration,
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
  interface TrackArtist { id?: SongId; name?: unknown }
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
    onBack,
    onPlayAll,
    onPlayTrack,
    onOpenArtist,
    onOpenAlbum,
    onLoadMore,
  }: {
    playlistDetail?: PlaylistDetailLike | null
    loading?: boolean
    loadingMore?: boolean
    hasMore?: boolean
    error?: string
    selectedId?: SongId | null
    heroColor?: string
    detailType?: string
    onBack?: () => void
    onPlayAll?: (tracks?: DetailTrackLike[] | null) => void
    onPlayTrack?: (id: SongId, tracks?: DetailTrackLike[] | null) => void
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
    onLoadMore?: () => void
  } = $props()

  let songActions = $state<{ bindRow: RowBinder } | null>(null)
  let trackSearch = $state('')
  let trackSort = $state<PlaylistSortKey>('added')
  let trackSortDir = $state<PlaylistSortDir>('desc')
  let showSortSheet = $state(false)
  let showMobileTools = $state(false)
  let lastSelectedId = $state<SongId | null>(null)

  let visibleTracks = $derived(filterAndSortPlaylistTracks(playlistDetail?.tracks || [], trackSearch, trackSort, trackSortDir))

  // 滚动触底自动加载更多：底部哨兵行进入视口即触发；hasMore/loadingMore 用 getter 读取，
  // action 只挂一次，回调时取的是最新值
  function loadMoreSentinel(
    node: Element,
    control: { hasMore: () => boolean; loadingMore: () => boolean },
  ): { destroy: () => void } {
    if (typeof IntersectionObserver === 'undefined') return { destroy: () => {} }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry?.isIntersecting && control.hasMore() && !control.loadingMore()) onLoadMore?.()
    }, { rootMargin: '240px 0px' })
    observer.observe(node)
    return { destroy: () => observer.disconnect() }
  }
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
    onPlayAll?.(visibleTracks)
  }

  // 桌面：进入时滚回顶部；滚动时给 hero 写 --hero-p（0→1）驱动视差收缩，hero 滚出后工具栏吸顶显示小标题
  // ponytail: WebKitGTK 支持 animation-timeline: scroll() 后，--hero-p 可改纯 CSS，只留吸顶判断
  function heroScroll(node: HTMLElement, onStuck: (stuck: boolean) => void) {
    const mobile = document.documentElement.classList.contains('mobile-runtime')
    const scroller = node.closest<HTMLElement>(mobile ? '.mobile-page-content' : '.content-scroll')
    if (!scroller) return {}
    if (!mobile) scroller.scrollTo({ top: 0 })
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const update = () => {
      frame = 0
      const hero = node.querySelector<HTMLElement>('.playlist-detail-hero')
      if (!hero) return
      const rect = hero.getBoundingClientRect()
      const top = scroller.getBoundingClientRect().top
      if (!still) hero.style.setProperty('--hero-p', String(Math.min(1, Math.max(0, (top - rect.top) / rect.height)).toFixed(3)))
      if (!mobile) onStuck(rect.bottom <= top)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    scroller.addEventListener('scroll', schedule, { passive: true })
    return { destroy() { cancelAnimationFrame(frame); scroller.removeEventListener('scroll', schedule) } }
  }

  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }

  $effect(() => {
    if (lastSelectedId !== selectedId) {
      lastSelectedId = selectedId
      trackSearch = ''
      showSortSheet = false
      showMobileTools = false
      trackSort = 'added'
      trackSortDir = 'desc'
    }
  })

  function setSort(sort: PlaylistSortKey): void {
    if (trackSort === sort) {
      trackSortDir = trackSortDir === 'asc' ? 'desc' : 'asc'
      return
    }
    trackSort = sort
    trackSortDir = sort === 'title' || sort === 'artist' ? 'asc' : 'desc'
  }

  function artistsOf(track: DetailTrackLike): TrackArtist[] {
    const list = track.artists || track.ar || []
    return Array.isArray(list) ? list as TrackArtist[] : []
  }

  function artistText(track: DetailTrackLike): string {
    return playlistArtistText(track)
  }

  function albumName(track: DetailTrackLike): unknown {
    return rec(track.album)?.name || rec(track.al)?.name || ''
  }

  function coverOf(track: DetailTrackLike): unknown {
    return rec(track.al)?.picUrl || rec(track.album)?.picUrl
  }

  function duration(track: DetailTrackLike): string {
    return formatDuration(playlistDuration(track))
  }

  function addedDate(track: DetailTrackLike): string {
    const time = playlistAddedTime(track)
    if (!time) return '—'
    const date = new Date(time)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}.${month}.${day}`
  }

  function sortName(sort: PlaylistSortKey): string {
    if (sort === 'title') return '歌曲'
    if (sort === 'artist') return '歌手'
    if (sort === 'duration') return '时长'
    return '加入时间'
  }

  function sortDirectionName(): string {
    if (trackSort === 'added') return trackSortDir === 'desc' ? '最新优先' : '最早优先'
    if (trackSort === 'duration') return trackSortDir === 'desc' ? '从长到短' : '从短到长'
    return trackSortDir === 'asc' ? 'A 到 Z' : 'Z 到 A'
  }

  function ariaSort(sort: PlaylistSortKey): 'ascending' | 'descending' | 'none' {
    if (trackSort !== sort) return 'none'
    return trackSortDir === 'asc' ? 'ascending' : 'descending'
  }

  function handleRowKeydown(event: KeyboardEvent, track: DetailTrackLike): void {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onPlayTrack?.(track.id, visibleTracks)
    }
  }
</script>

{#key selectedId}
  <div class="playlist-detail-page" class:is-loading={loading} class:is-ready={!loading && Boolean(playlistDetail)} class:rows-intro={rowsIntro} class:show-mobile-tools={showMobileTools} use:heroScroll={(stuck) => toolbarStuck = stuck}>
    {#if loading && !playlistDetail}
      <PlaylistHero {onBack} />
      <div class="playlist-loading-status" role="status" aria-live="polite">
        <span class="playlist-loading-orbit"><Icon name="music" size={17} strokeWidth={1.7} /></span>
        <span><strong>正在打开歌单</strong><small>同步封面、介绍与歌曲信息</small></span>
        <span class="playlist-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
      <div class="playlist-track-surface playlist-loading-surface">
      <table class="track-table" aria-label="加载详情歌曲" aria-busy="true">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-cover"></th>
            <th>标题</th>
            <th>歌手</th>
            <th class="col-album">专辑</th>
            <th class="col-added">加入时间</th>
            <th class="col-dur">时长</th>
          </tr>
        </thead>
        <tbody>
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
        </tbody>
      </table>
      </div>
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
        {totalDuration}
        {onBack}
        onPlayAll={() => onPlayAll?.(visibleTracks)}
        onShuffle={playShuffled}
        onQueue={() => void queuePlaylist(playlistDetail!.id, 'append', visibleTracks as unknown as CompactTrackInput[])}
        onNext={() => void queuePlaylist(playlistDetail!.id, 'next', visibleTracks as unknown as CompactTrackInput[])}
        onTools={() => { showMobileTools = true; void tick().then(() => document.querySelector<HTMLInputElement>('.mobile-route-page:not([inert]) .playlist-search input')?.focus()) }}
      />
      <div class="playlist-toolbar" class:is-stuck={toolbarStuck}>
        <div class="playlist-toolbar-title" inert={!toolbarStuck}>
          {#if playlistDetail.coverImgUrl || playlistDetail.picUrl}<img src={coverUrl(playlistDetail.coverImgUrl || playlistDetail.picUrl, 64)} alt="" referrerpolicy="no-referrer" />{/if}
          <strong>{playlistDetail.name}</strong>
          <button type="button" onclick={() => onPlayAll?.(visibleTracks)} disabled={!visibleTracks.length} aria-label="播放全部">
            <Icon name="play" size={14} fill="currentColor" />
          </button>
        </div>
        <label class="playlist-search" aria-label="搜索歌单歌曲">
          <Icon name="search" size={16} strokeWidth={1.8} />
          <input bind:value={trackSearch} placeholder="搜索歌单内歌曲、歌手、专辑" />
          {#if trackSearch}
            <button type="button" onclick={() => trackSearch = ''} aria-label="清空搜索">
              <Icon name="close" size={14} strokeWidth={2} />
            </button>
          {/if}
        </label>

        <div class="playlist-sort-controls">
          <button class="playlist-sort-mobile" type="button" aria-label="选择歌曲排序" aria-haspopup="dialog" aria-expanded={showSortSheet} onclick={() => showSortSheet = true}>
            <span>{sortName(trackSort)}</span><span>{sortDirectionName()}</span><Icon name="chevron-down" size={18} />
          </button>
          <label class="playlist-sort-select">
            <span>排序</span>
            <select value={trackSort} onchange={(event) => setSort((event.currentTarget as HTMLSelectElement).value as PlaylistSortKey)} aria-label="歌曲排序方式">
              <option value="added">加入时间</option>
              <option value="title">歌曲</option>
              <option value="artist">歌手</option>
              <option value="duration">时长</option>
            </select>
          </label>
          <button
            class="playlist-sort-direction"
            type="button"
            onclick={() => trackSortDir = trackSortDir === 'asc' ? 'desc' : 'asc'}
            aria-label={`${sortName(trackSort)}：${sortDirectionName()}，点击切换`}
            title={sortDirectionName()}
          >
            <span aria-hidden="true">{trackSortDir === 'asc' ? '↑' : '↓'}</span>
            {sortDirectionName()}
          </button>
        </div>

        <span class="playlist-toolbar-count">{#if isWaitingForTracks}正在加载歌曲…{:else}{visibleTracks.length} / {playlistDetail.tracks?.length || 0}{/if}</span>
      </div>
      <div class="playlist-track-surface">
      {#if isWaitingForTracks}
        <div class="playlist-loading-status playlist-loading-status--compact" role="status" aria-live="polite">
          <span class="playlist-loading-orbit"><Icon name="music" size={15} strokeWidth={1.7} /></span>
          <span><strong>正在准备歌曲列表</strong><small>歌单信息已就绪</small></span>
          <span class="playlist-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>
      {/if}
      <table class="track-table playlist-track-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-cover"></th>
            <th aria-sort={ariaSort('title')}>
              <button type="button" class:active={trackSort === 'title'} class="table-sort-button" onclick={() => setSort('title')}>
                歌曲 <span aria-hidden="true">{trackSort === 'title' ? (trackSortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
              </button>
            </th>
            <th aria-sort={ariaSort('artist')}>
              <button type="button" class:active={trackSort === 'artist'} class="table-sort-button" onclick={() => setSort('artist')}>
                歌手 <span aria-hidden="true">{trackSort === 'artist' ? (trackSortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
              </button>
            </th>
            <th class="col-album">专辑</th>
            <th class="col-added" aria-sort={ariaSort('added')}>
              <button type="button" class:active={trackSort === 'added'} class="table-sort-button" onclick={() => setSort('added')}>
                加入时间 <span aria-hidden="true">{trackSort === 'added' ? (trackSortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
              </button>
            </th>
            <th class="col-dur" aria-sort={ariaSort('duration')}>
              <button type="button" class:active={trackSort === 'duration'} class="table-sort-button table-sort-button--end" onclick={() => setSort('duration')}>
                时长 <span aria-hidden="true">{trackSort === 'duration' ? (trackSortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {#if isWaitingForTracks}
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
            {#if visibleTracks.length === 0 && !loading}
              <tr class="track-empty-row">
                <td colspan="7">没有匹配的歌曲</td>
              </tr>
            {/if}
            {#each visibleTracks as track, i (track.id)}
              <tr
                class:playlist-track-row={i < 14}
                class:active={player.id === track.id}
                style={`--playlist-row-i:${Math.min(i, 12)}`}
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
                <td class="col-title">{track.name}<button class="m-track-more" type="button" aria-label={`更多操作：${track.name}`} onkeydown={(event) => event.stopPropagation()} onclick={(event) => songActions?.bindRow(track).oncontextmenu(event)}><Icon name="more" size={20} /></button></td>
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
                <td class="col-added" title={playlistAddedTime(track) ? new Date(playlistAddedTime(track)).toLocaleString('zh-CN') : '没有加入时间'}>{addedDate(track)}</td>
                <td class="col-dur" data-duration-missing={!track.dt && !track.duration}>{duration(track)}</td>
              </tr>
            {/each}
            {#if (loadingMore || hasMore) && playlistDetail?.tracks?.length}
              <tr class="loading-more-row" use:loadMoreSentinel={{ hasMore: () => hasMore, loadingMore: () => loadingMore }}>
                <td colspan="7">
                  {#if loadingMore}
                    <span class="loading-more-spinner"></span>
                  {/if}
                  {loadingMore ? '正在加载更多歌曲…' : '下滑加载更多'}
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
  <PlaylistSortSheet show={showSortSheet} sort={trackSort} direction={trackSortDir} onSort={(sort) => { if (sort !== trackSort) setSort(sort) }} onDirection={(direction) => trackSortDir = direction} onClose={() => showSortSheet = false} />
{/key}

<style>
  .playlist-sort-mobile { display: none; }
  :global(html.mobile-runtime) .playlist-sort-mobile { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; min-height: 48px; padding: 0 12px; border: 0; border-radius: 999px; color: var(--text); background: var(--md-container); font-size: 13px; }
  :global(html.mobile-runtime) .playlist-sort-mobile span:first-child { font-weight: 500; }
  :global(html.mobile-runtime) .playlist-sort-mobile span:nth-child(2) { margin-left: auto; color: var(--md-primary); font-size: 11px; }
  :global(html.mobile-runtime) .playlist-sort-controls > :is(.playlist-sort-select, .playlist-sort-direction) { display: none; }
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

  .playlist-loading-status {
    min-height: 62px;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-elevated) 66%, transparent);
    animation: playlistStatusIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both;
  }

  .playlist-loading-status--compact {
    min-height: 54px;
    margin: 10px 12px 4px;
    padding: 8px 10px;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
    border-radius: 0;
    background: transparent;
  }

  .playlist-loading-orbit {
    position: relative;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 11%, var(--bg-elevated));
  }

  .playlist-loading-orbit::after {
    content: '';
    position: absolute;
    inset: -3px;
    border: 1px solid transparent;
    border-top-color: color-mix(in srgb, var(--accent) 76%, transparent);
    border-right-color: color-mix(in srgb, var(--accent) 24%, transparent);
    border-radius: 50%;
    animation: playlistOrbit 0.9s linear infinite;
  }

  .playlist-loading-status > span:nth-child(2) {
    min-width: 0;
  }

  .playlist-loading-status strong,
  .playlist-loading-status small {
    display: block;
  }

  .playlist-loading-status strong {
    color: var(--text);
    font-size: 12px;
    font-weight: 700;
  }

  .playlist-loading-status small {
    margin-top: 3px;
    color: var(--text-tertiary);
    font-size: 10px;
  }

  .playlist-loading-dots {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 4px;
  }

  .playlist-loading-dots i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--accent);
    animation: playlistDot 1s ease-in-out infinite;
  }

  .playlist-loading-dots i:nth-child(2) { animation-delay: 0.14s; }
  .playlist-loading-dots i:nth-child(3) { animation-delay: 0.28s; }

  .playlist-skeleton-row {
    opacity: 0;
    animation: playlistSkeletonRowIn 0.34s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(0.08s + var(--playlist-row-i, 0) * 34ms);
  }

  .playlist-skeleton-row .skeleton-block,
  .playlist-skeleton-row .skeleton-line {
    background: color-mix(in srgb, var(--bg-elevated) 78%, var(--border) 22%);
  }

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

  .playlist-track-row {
    opacity: 0;
    animation: playlistTrackRowIn 0.36s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(0.12s + var(--playlist-row-i, 0) * 24ms);
  }

  .playlist-track-table thead th {
    height: 42px;
    padding-top: 0;
    padding-bottom: 0;
    background: color-mix(in srgb, var(--bg-layer) 48%, transparent);
  }

  .playlist-track-table {
    table-layout: fixed;
  }

  .playlist-track-table .col-num { width: 46px; padding-right: 8px; }
  .playlist-track-table .col-cover { width: 56px; }
  .playlist-track-table .col-title { width: 27%; }
  .playlist-track-table .col-artist { width: 24%; }
  .playlist-track-table .col-album { width: 22%; }
  .playlist-track-table .col-added { width: 116px; }
  .playlist-track-table .col-dur { width: 74px; }

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

  .playlist-track-table tbody tr {
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    transition: background 0.16s ease, box-shadow 0.16s ease;
  }

  .playlist-track-table tbody tr:hover {
    background: color-mix(in srgb, var(--bg-hover) 82%, transparent);
    box-shadow: inset 3px 0 color-mix(in srgb, var(--accent) 38%, transparent);
  }

  .playlist-track-table tbody tr.active {
    box-shadow: inset 3px 0 var(--accent);
  }

  .playlist-track-table tbody td {
    height: 54px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .playlist-track-table .col-title {
    color: var(--text);
    font-weight: 500;
  }

  .playlist-track-table .col-added {
    color: var(--text-tertiary);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .playlist-track-table .col-dur {
    font-variant-numeric: tabular-nums;
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

  @keyframes playlistPageIn {
    from { opacity: 0; transform: translateY(12px) scale(0.992); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes playlistSurfaceIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes playlistStatusIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes playlistSkeletonRowIn {
    from { opacity: 0; transform: translateX(-8px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes playlistToolbarIn {
    from { opacity: 0; transform: translateY(7px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes playlistTrackRowIn {
    from { opacity: 0; transform: translateY(7px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes playlistOrbit { to { transform: rotate(360deg); } }

  @keyframes playlistDot {
    0%, 70%, 100% { opacity: 0.25; transform: translateY(0); }
    35% { opacity: 1; transform: translateY(-3px); }
  }

  :global(html.mobile-runtime) .playlist-detail-page {
    gap: 12px;
    min-width: 0;
  }

  :global(html.mobile-runtime) .playlist-loading-status {
    min-height: 56px;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    margin: 0;
    border-radius: var(--radius-md);
  }

  :global(html.mobile-runtime) .playlist-loading-status--compact {
    margin: 6px 4px 2px;
  }

  :global(html.mobile-runtime) .playlist-loading-orbit {
    width: 32px;
    height: 32px;
  }

  :global(html.mobile-runtime) .playlist-toolbar {
    position: sticky;
    top: 0;
    z-index: 6;
    display: grid;
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

  :global(html.mobile-runtime) .playlist-track-surface {
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table,
  :global(html.mobile-runtime) .playlist-detail-page .track-table tbody,
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
  :global(html.mobile-runtime) .playlist-detail-page .track-table .col-added {
    display: none !important;
  }

  :global(html.mobile-runtime) .playlist-detail-page .track-table tbody {
    display: grid;
    gap: 4px;
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

  @media (max-width: 1060px) and (min-width: 721px) {
    .playlist-toolbar {
      grid-template-columns: minmax(220px, 1fr) auto;
    }

    .playlist-toolbar-count {
      display: none;
    }

    .playlist-track-table .col-album {
      display: none;
    }

    .playlist-track-table .col-title { width: 34%; }
    .playlist-track-table .col-artist { width: 30%; }
  }

  @media (max-width: 820px) and (min-width: 721px) {
    .playlist-track-table .col-added {
      display: none;
    }

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
    .playlist-detail-page,
    .playlist-track-surface,
    .playlist-loading-status,
    .playlist-skeleton-row,
    .playlist-toolbar,
    .playlist-track-row,
    .playlist-loading-orbit::after,
    .playlist-loading-dots i {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }

  /* 桌面：页面整体入场由 host 的 pageMotion 处理；只保留首屏行错峰 */
  :global(html:not(.mobile-runtime)) .playlist-detail-page,
  :global(html:not(.mobile-runtime)) .playlist-track-surface,
  :global(html:not(.mobile-runtime)) .playlist-loading-status,
  :global(html:not(.mobile-runtime)) .playlist-skeleton-row,
  :global(html:not(.mobile-runtime)) .playlist-toolbar,
  :global(html:not(.mobile-runtime)) .playlist-track-row {
    animation: none;
    opacity: 1;
    transform: none;
  }

  /* 特异性需压过 desktop-system.css 对 .track-table 行的 animation: none */
  :global(html:not(.mobile-runtime)) .playlist-detail-page.rows-intro .playlist-track-table tbody tr.playlist-track-row {
    animation: playlistTrackRowIn var(--motion-panel) var(--ease-out) backwards;
    animation-delay: calc(80ms + var(--playlist-row-i, 0) * 24ms);
  }

  :global(html:not(.mobile-runtime)) .playlist-toolbar {
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
