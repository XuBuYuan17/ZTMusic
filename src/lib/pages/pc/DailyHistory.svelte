<script module lang="ts">
  import type { DailyDateItem as SnapshotDate } from '../../services/dailyHistory.ts'
  import type { NormalizedSong as SnapshotSong } from '../../utils/normalize.ts'
  let dailySnapshot: { userId: unknown; dates: SnapshotDate[]; selectedDate: string; songs: SnapshotSong[] } | null = null
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import type { SongId } from '../../types/music.ts'
  import type { CompactTrackInput } from '../../player/queue.ts'
  import type { DailyDateItem } from '../../services/dailyHistory.ts'
  import type { NormalizedSong } from '../../utils/normalize.ts'
  import { player } from '../../stores/player.svelte.ts'
  import { auth } from '../../stores/auth.svelte.ts'
  import { ncm } from '../../api/client.ts'
  import { loadDailyHistoryData, loadDailyHistoryDetailData } from '../../services/dailyHistory.ts'
  import { formatDuration } from '../../format.ts'
  import PlaylistHero from '../../components/PlaylistHero.svelte'
  import SongListActions from '../../components/SongListActions.svelte'
  import SongList from '../../components/SongList.svelte'
  import { toSongRows } from '../../components/song-row.ts'
  import { getScrollViewport, trackScrollTop, restoreScrollTop } from '../../app/scroll-viewport.ts'

  import ErrorBlock from '../../components/ui/ErrorBlock.svelte'
  import Icon from '../../components/ui/Icon.svelte'

  interface TrackArtist { id?: SongId; name?: unknown }
  type RowBinder = (track: unknown) => { oncontextmenu: (event: MouseEvent) => void }
  type ChipDate = string | DailyDateItem

  let { onOpenArtist, onOpenAlbum }: {
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
  } = $props()

  const initial = dailySnapshot?.userId === auth.user?.userId ? dailySnapshot : null
  let dailyHistoryDates = $state<DailyDateItem[]>(initial?.dates ?? [])
  let dailyHistorySongs = $state<NormalizedSong[]>(initial?.songs ?? [])
  let dailyHistoryLoading = $state(false)
  let error = $state('')
  let selectedDailyDate = $state(initial?.selectedDate ?? '')

  function save(): void {
    dailySnapshot = { userId: auth.user?.userId, dates: [...dailyHistoryDates], selectedDate: selectedDailyDate, songs: [...dailyHistorySongs] }
  }
  let _requestId = 0
  let songActions = $state<{ bindRow: RowBinder } | null>(null)

  async function load(): Promise<void> {
    const rid = ++_requestId; dailyHistoryLoading = !dailyHistoryDates.length; error = ''
    try { const d = await loadDailyHistoryData(ncm); if (rid !== _requestId) return; dailyHistoryDates = d.dates; selectedDailyDate = d.selectedDate; dailyHistorySongs = d.songs; save() }
    catch (e) { if (rid === _requestId) error = (e as { message?: string } | null | undefined)?.message || '加载失败' }
    finally { if (rid === _requestId) dailyHistoryLoading = false }
  }

  async function loadDetail(date: ChipDate): Promise<void> {
    if (!date) return; const rid = ++_requestId; selectedDailyDate = date as string; dailyHistoryLoading = true
    // ponytail: date 正常是 string；item.date 为空串时 {item.date || item} 会传入整个日期对象，
    // 原 JS 行为原样保留（service 内部 String 化），这里只做类型层 cast。
    try { const s = await loadDailyHistoryDetailData(ncm, date as string | number); if (rid === _requestId) { dailyHistorySongs = s; save() } }
    finally { if (rid === _requestId) dailyHistoryLoading = false }
  }

  const scrollViewport = getScrollViewport()

  // 移动外壳负责路由滚动；桌面页在挂载时恢复并记录。
  $effect(() => {
    const cancelRestore = restoreScrollTop('dailyHistory', scrollViewport)
    const stopTracking = trackScrollTop('dailyHistory', scrollViewport)
    return () => { cancelRestore(); stopTracking() }
  })

  const rows = $derived(toSongRows(dailyHistorySongs))

  function playAll(): void { if (dailyHistorySongs.length) player.playQueue(dailyHistorySongs as unknown as CompactTrackInput[], 0) }
  function playTrack(track: NormalizedSong): void {
    const idx = dailyHistorySongs.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(dailyHistorySongs as unknown as CompactTrackInput[], idx); else player.playTrack(track as unknown as CompactTrackInput, 0)
  }

  $effect(() => { if (auth.isLoggedIn) untrack(load) })

  function artistsOf(track: NormalizedSong): TrackArtist[] {
    return (track.artists || track.ar || []) as TrackArtist[]
  }

  function albumOf(track: NormalizedSong): string {
    return ((track.album as { name?: unknown } | null | undefined)?.name as string) || (track.al?.name as string) || ''
  }

  function handleSongKeydown(event: KeyboardEvent, track: NormalizedSong): void {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      playTrack(track)
    }
  }

  function formatDateLabel(date: ChipDate | null | undefined): string {
    if (!date) return '选择日期'
    const parts = String(date).split('-')
    return parts.length === 3 ? `${parts[1]}.${parts[2]}` : String(date)
  }

  const dailyDetail = $derived({ name: '每日推荐', picUrl: rows.find(row => row.cover)?.cover || '', creator: selectedDailyDate || '历史日推' })
</script>

<div class="daily-page fade-in">
  <PlaylistHero detail={dailyDetail} detailType="历史日推" loading={dailyHistoryLoading} totalCount={dailyHistoryLoading ? 0 : dailyHistorySongs.length} visibleCount={dailyHistoryLoading ? 0 : dailyHistorySongs.length} onPlayAll={playAll} />

  {#if dailyHistoryLoading && dailyHistoryDates.length === 0}
    <section class="daily-date-surface" aria-label="加载历史日期">
      <div class="daily-date-heading"><strong>选择日期</strong><span>左右滑动查看更多</span></div>
      <div class="daily-date-scroll">
        {#each Array(7) as _}
          <div class="daily-date-chip skeleton-row">
            <span class="skeleton-line short"></span>
            <small class="skeleton-line short"></small>
          </div>
        {/each}
      </div>
    </section>
  {:else if dailyHistoryDates.length > 0}
    <section class="daily-date-surface" aria-label="历史日期">
      <div class="daily-date-heading"><strong>选择日期</strong><span>左右滑动查看更多</span></div>
      <div class="daily-date-scroll">
        {#each dailyHistoryDates as item (item.date || item)}
          {@const date = item.date || item}
          <button class="daily-date-chip" class:active={selectedDailyDate === date} aria-current={selectedDailyDate === date ? 'date' : undefined} onclick={() => loadDetail(date)}>
            <span>{formatDateLabel(date)}</span>
            {#if item.weekday}<small>{item.weekday}</small>{/if}
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if dailyHistoryLoading}
    <div class="daily-toolbar"><strong>{selectedDailyDate || '每日推荐'} 的歌曲</strong><span>正在同步</span></div>
    <div class="daily-track-surface">
      <SongList skeleton rows={[]} skeletonLabel="加载每日推荐" />
    </div>
  {:else if dailyHistorySongs.length > 0}
    <div class="daily-toolbar"><strong>{selectedDailyDate || '每日推荐'} 的歌曲</strong><span>{dailyHistorySongs.length} 首</span></div>
    <div class="daily-track-surface">
      <SongList
        {rows}
        currentId={player.id}
        rowActions={songActions?.bindRow ?? null}
        onPlay={(row) => playTrack(row.source as NormalizedSong)}
        {onOpenArtist}
        {onOpenAlbum}
      />
    </div>
  {:else}
    <div class="daily-empty">
      <Icon name="calendar" size={40} />
      <p>暂无历史日推</p>
      <p class="daily-empty-hint">需要登录后获取</p>
    </div>
  {/if}
  {#if error}
    <ErrorBlock message={error} onRetry={load} />
  {/if}

  <SongListActions onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onBindRow={(fn: RowBinder) => { songActions = { bindRow: fn } }} />
</div>

<style>
  /* 版式对齐歌单页：页面容器 → 工具条 → 曲目面板，都是同一套圆角/描边/入场节奏。 */
  .daily-page { display: grid; gap: 18px; min-width: 0; max-width: 1180px; margin: 0 auto; color: var(--text); transform-origin: 50% 0; animation: dailyPageIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) both; }
  :global(html.mobile-runtime) .daily-page { gap: 12px; }

  .daily-date-surface { min-width: 0; display: grid; gap: 12px; padding: 14px 16px 16px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-surface); animation: dailySurfaceIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) 0.06s both; }
  .daily-date-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .daily-date-heading strong { font-size: 15px; font-weight: 500; }
  .daily-date-heading span { color: var(--text-tertiary); font-size: 11px; }
  .daily-date-scroll { min-width: 0; display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
  .daily-date-scroll::-webkit-scrollbar { display: none; }
  .daily-date-chip { flex: 0 0 auto; min-width: 78px; min-height: 52px; display: grid; gap: 1px; align-content: center; padding: 8px 12px; border: 1px solid transparent; border-radius: var(--radius-md); background: var(--bg-elevated); color: var(--text); text-align: left; cursor: pointer; transition: border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out); }
  .daily-date-chip:hover { background: var(--bg-hover); }
  .daily-date-chip span { font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; }
  .daily-date-chip small { color: var(--text-tertiary); font-size: 11px; }
  .daily-date-chip.active { border-color: var(--accent); background: var(--accent-bg); }

  .daily-toolbar { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 0 16px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-surface); animation: dailySurfaceIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both; }
  .daily-toolbar strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 500; }
  .daily-toolbar span { flex: none; color: var(--text-tertiary); font-size: 12px; font-variant-numeric: tabular-nums; }

  .daily-track-surface { position: relative; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-surface); animation: dailySurfaceIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) 0.12s both; }

  .daily-empty { display: grid; place-items: center; gap: 10px; padding: 64px 20px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-surface); color: var(--text-secondary); text-align: center; }
  .daily-empty :global(svg) { color: var(--text-tertiary); }
  .daily-empty p { margin: 0; font-size: 14px; }
  .daily-empty-hint { color: var(--text-tertiary); font-size: 12px; }

  @keyframes dailyPageIn { from { opacity: 0; transform: translateY(12px) scale(0.992); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes dailySurfaceIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  :global(html.mobile-runtime) .daily-page :global(.playlist-detail-hero) { gap: 14px; padding: 4px 0 10px; }
  :global(html.mobile-runtime) .daily-page :global(.playlist-cover), :global(html.mobile-runtime) .daily-page :global(.playlist-cover-open) { width: min(58vw, 292px); }
  :global(html.mobile-runtime) .daily-page :global(.playlist-hero-copy) { gap: 5px; }
  :global(html.mobile-runtime) .daily-page :global(.playlist-hero-copy h1) { font-size: 22px; font-weight: 500; line-height: 1.22; }
  :global(html.mobile-runtime) .daily-page :global(.playlist-mobile-creator) { font-size: 14px; line-height: 20px; color: var(--text-secondary); }
  :global(html.mobile-runtime) .daily-page :global(.playlist-hero-actions) { grid-template-columns: 44px minmax(0, 1fr) 44px; gap: 12px; margin-top: 8px; }
  :global(html.mobile-runtime) .daily-page :global(.playlist-play-btn) { min-height: 48px; font-size: 16px; }

  @media (prefers-reduced-motion: reduce) {
    .daily-page, .daily-date-surface, .daily-toolbar, .daily-track-surface { animation: none; opacity: 1; transform: none; }
    .daily-date-chip { transition: none; }
  }
  @media (max-width: 560px) { .daily-date-chip { min-width: 72px; } }
  :global(html:not(.mobile-runtime)) .daily-page,
  :global(html:not(.mobile-runtime)) .daily-date-surface,
  :global(html:not(.mobile-runtime)) .daily-toolbar,
  :global(html:not(.mobile-runtime)) .daily-track-surface { animation: none; opacity: 1; transform: none; }
</style>
