<script module lang="ts">
  import type { DailyDateItem as SnapshotDate } from '../../services/dailyHistory.ts'
  import type { NormalizedSong as SnapshotSong } from '../../utils/normalize.ts'
  let dailySnapshot: { userId: unknown; dates: SnapshotDate[]; selectedDate: string; songs: SnapshotSong[] } | null = null
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import type { CompactTrackInput } from '../../player/queue.ts'
  import type { DailyDateItem } from '../../services/dailyHistory.ts'
  import type { NormalizedSong } from '../../utils/normalize.ts'
  import { player } from '../../stores/player.svelte.ts'
  import { auth } from '../../stores/auth.svelte.ts'
  import { ncm } from '../../api/client.ts'
  import { loadDailyHistoryDatesData, loadDailyHistoryDetailData } from '../../services/dailyHistory.ts'
  import dailyCover from '../../../assets/discovery/daily.svg'
  import PlaylistHero from '../../components/PlaylistHero.svelte'
  import SongListActions from '../../components/SongListActions.svelte'
  import SongList from '../../components/SongList.svelte'
  import { toSongRows } from '../../components/song-row.ts'
  import { getScrollViewport, trackScrollTop, restoreScrollTop } from '../../app/scroll-viewport.ts'

  import ErrorBlock from '../../components/ui/ErrorBlock.svelte'
  import Icon from '../../components/ui/Icon.svelte'

  type RowBinder = (track: unknown) => { oncontextmenu: (event: MouseEvent) => void }

  let { mobile = false, onOpenArtist, onOpenAlbum }: {
    mobile?: boolean
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
  } = $props()

  const initial = dailySnapshot?.userId === auth.user?.userId ? dailySnapshot : null
  let dailyHistoryDates = $state<DailyDateItem[]>(initial?.dates ?? [])
  let dailyHistorySongs = $state<NormalizedSong[]>(initial?.songs ?? [])
  let dailyHistoryLoading = $state(auth.isLoggedIn && !initial)
  let error = $state('')
  let selectedDailyDate = $state(initial?.selectedDate ?? '')
  let ownerId = auth.user?.userId

  function save(): void {
    dailySnapshot = { userId: auth.user?.userId, dates: [...dailyHistoryDates], selectedDate: selectedDailyDate, songs: [...dailyHistorySongs] }
  }
  let _requestId = 0
  let songActions = $state<{ bindRow: RowBinder } | null>(null)

  async function load(): Promise<void> {
    const rid = ++_requestId
    dailyHistoryLoading = true; error = ''
    try {
      const dates = await loadDailyHistoryDatesData(ncm)
      if (rid !== _requestId) return
      dailyHistoryDates = dates
      const date = dates.some(item => item.date === selectedDailyDate) ? selectedDailyDate : dates[0]?.date
      if (date) await loadDetail(date)
      else {
        selectedDailyDate = ''; dailyHistorySongs = []
        save()
      }
    } catch (e) {
      if (rid === _requestId) error = e instanceof Error ? e.message : '历史日期加载失败'
    } finally {
      if (rid === _requestId) dailyHistoryLoading = false
    }
  }

  async function loadDetail(date: string): Promise<void> {
    if (!date || !auth.isLoggedIn) return
    const rid = ++_requestId
    if (selectedDailyDate !== date) dailyHistorySongs = []
    selectedDailyDate = date; dailyHistoryLoading = true; error = ''
    try {
      const songs = await loadDailyHistoryDetailData(ncm, date)
      if (rid !== _requestId) return
      dailyHistorySongs = songs
      save()
    } catch (e) {
      if (rid === _requestId) error = e instanceof Error ? e.message : '日推歌曲加载失败'
    } finally {
      if (rid === _requestId) dailyHistoryLoading = false
    }
  }

  const scrollViewport = getScrollViewport()

  // 移动外壳负责路由滚动；桌面页在挂载时恢复并记录。
  $effect(() => {
    const cancelRestore = restoreScrollTop('dailyHistory', scrollViewport)
    const stopTracking = trackScrollTop('dailyHistory', scrollViewport)
    return () => { cancelRestore(); stopTracking() }
  })

  const rows = $derived(toSongRows(dailyHistorySongs))

  function playAll(shuffled = false): void {
    if (dailyHistoryLoading || !dailyHistorySongs.length) return
    if (shuffled) player.setMode('shuffle')
    player.playQueue(dailyHistorySongs as unknown as CompactTrackInput[], 0)
  }
  function playTrack(track: NormalizedSong): void {
    const idx = dailyHistorySongs.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(dailyHistorySongs as unknown as CompactTrackInput[], idx); else player.playTrack(track as unknown as CompactTrackInput, 0)
  }

  $effect(() => {
    const uid = auth.user?.userId
    const loggedIn = auth.isLoggedIn
    if (!loggedIn || uid !== ownerId) {
      ownerId = uid
      dailyHistoryDates = []; selectedDailyDate = ''; dailyHistorySongs = []
      dailyHistoryLoading = false; error = ''
    }
    if (loggedIn) void untrack(load)
    return () => { _requestId++ }
  })

  function formatDateLabel(date: string, summary = false): string {
    const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date)
    if (!match) return date
    return summary ? `${Number(match[1])} 月 ${Number(match[2])} 日` : `${match[1]}.${match[2]}`
  }

  const dailyArtwork = $derived(rows.find(row => row.cover)?.cover || '')
  const dailyDetail = $derived({
    name: mobile ? selectedDailyDate ? `${formatDateLabel(selectedDailyDate, true)}的日推` : '历史日推' : '每日推荐',
    picUrl: dailyArtwork || (mobile ? dailyCover : ''),
    creator: mobile ? '历史日推' : selectedDailyDate || '历史日推',
  })
  const availableCount = $derived(dailyHistoryLoading ? 0 : dailyHistorySongs.length)
  function retry(): void {
    if (selectedDailyDate && dailyHistoryDates.length) void loadDetail(selectedDailyDate)
    else void load()
  }
</script>

<div class="daily-page fade-in" class:daily-page--mobile={mobile} class:playlist-detail-page={mobile}>
  <PlaylistHero detail={dailyDetail} detailType="历史日推" loading={dailyHistoryLoading}
    showPlayingRecord={false} coverIsBundled={mobile && !dailyArtwork} totalCount={availableCount}
    visibleCount={availableCount} onPlayAll={() => playAll()} onShuffle={mobile ? () => playAll(true) : undefined} />

  {#if dailyHistoryLoading && dailyHistoryDates.length === 0}
    <section class="daily-date-surface" aria-label="加载历史日期">
      {#if !mobile}<div class="daily-date-heading"><strong>选择日期</strong><span>左右滑动查看更多</span></div>{/if}
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
      {#if !mobile}<div class="daily-date-heading"><strong>选择日期</strong><span>左右滑动查看更多</span></div>{/if}
      <div class="daily-date-scroll">
        {#each dailyHistoryDates as item (item.date)}
          {@const date = item.date}
          <button class="daily-date-chip" class:active={selectedDailyDate === date} aria-current={selectedDailyDate === date ? 'date' : undefined} onclick={() => loadDetail(date)}>
            <span>{formatDateLabel(date)}</span>
            {#if item.weekday}<small>{item.weekday}</small>{/if}
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if dailyHistoryLoading}
    {#if !mobile}<div class="daily-toolbar"><strong>{selectedDailyDate || '每日推荐'} 的歌曲</strong><span>正在同步</span></div>{/if}
    <div class="daily-track-surface" class:playlist-track-surface={mobile}>
      <SongList skeleton rows={[]} skeletonLabel="加载每日推荐" />
    </div>
  {:else if dailyHistorySongs.length > 0}
    {#if !mobile}<div class="daily-toolbar"><strong>{selectedDailyDate || '每日推荐'} 的歌曲</strong><span>{dailyHistorySongs.length} 首</span></div>{/if}
    <div class="daily-track-surface" class:playlist-track-surface={mobile}>
      <SongList
        {rows}
        currentId={player.id}
        rowActions={songActions?.bindRow ?? null}
        onPlay={(row) => playTrack(row.source as NormalizedSong)}
        {onOpenArtist}
        {onOpenAlbum}
      />
    </div>
  {:else if !error}
    <div class="daily-empty">
      <Icon name="calendar" size={40} />
      <p>{selectedDailyDate ? '这一天没有推荐歌曲' : '暂无历史日推'}</p>
      {#if !auth.isLoggedIn}<p class="daily-empty-hint">需要登录后获取</p>{/if}
    </div>
  {/if}
  {#if error}
    <ErrorBlock message={error} onRetry={retry} />
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

  .daily-page--mobile .daily-date-surface { padding: 0; border: 0; background: transparent; }
  .daily-page--mobile .daily-date-scroll { gap: 4px; }
  .daily-page--mobile .daily-date-chip { min-width: 58px; min-height: 44px; padding: 4px 10px; justify-items: center; border: 0; border-radius: 999px; background: transparent; color: var(--text-secondary); }
  .daily-page--mobile .daily-date-chip:hover { background: var(--bg-hover); }
  .daily-page--mobile .daily-date-chip.active { background: var(--md-primary-container); color: var(--md-primary); }
  .daily-page--mobile .daily-date-chip.active small { color: inherit; }

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
