<script module lang="ts">
  let recentSnapshot: { userId: unknown; tracks: unknown[] } | null = null
</script>

<script lang="ts">
  import type { SongId } from '../../types/music.ts'
  import type { CompactTrackInput } from '../../player/queue.ts'
  import type { NormalizedRecordSong, NormalizedLocalHistorySong } from '../../utils/normalize.ts'
  import { auth } from '../../stores/auth.svelte.ts'
  import { player } from '../../stores/player.svelte.ts'
  import { ncm } from '../../api/client.ts'
  import { loadRecentData } from '../../services/home.ts'
  import { formatDuration } from '../../format.ts'
  import { coverUrl } from '../../utils/image.ts'
  import SongListActions from '../../components/SongListActions.svelte'
  import SongList from '../../components/SongList.svelte'
  import { toSongRows } from '../../components/song-row.ts'
  import { getScrollViewport, trackScrollTop, restoreScrollTop } from '../../app/scroll-viewport.ts'
  import ErrorBlock from '../../components/ui/ErrorBlock.svelte'

  type RecentTrack = NormalizedRecordSong | NormalizedLocalHistorySong
  interface TrackArtist { id?: SongId; name?: unknown }
  type RowBinder = (track: unknown) => { oncontextmenu: (event: MouseEvent) => void }

  let { onOpenArtist, onOpenAlbum }: {
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
  } = $props()

  let recentTracks = $state<RecentTrack[]>((recentSnapshot && recentSnapshot.userId === auth.user?.userId ? recentSnapshot.tracks : []) as RecentTrack[])
  let recentLoading = $state(false)
  let error = $state('')
  let songActions = $state<{ bindRow: RowBinder } | null>(null)
  let _requestId = 0

  async function load(): Promise<void> {
    const rid = ++_requestId; recentLoading = true; error = ''
    try {
      const tracks = await loadRecentData(ncm, auth.user)
      if (rid === _requestId) { recentTracks = tracks; recentSnapshot = { userId: auth.user?.userId, tracks: [...tracks] } }
    } catch (e) { if (rid === _requestId) error = (e as { message?: string } | null | undefined)?.message || '加载失败' }
    finally { if (rid === _requestId) recentLoading = false }
  }

  function playTrack(track: RecentTrack): void {
    const idx = recentTracks.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(recentTracks as unknown as CompactTrackInput[], idx); else player.playTrack(track as unknown as CompactTrackInput, 0)
  }
  function playAll(): void { if (recentTracks.length) player.playQueue(recentTracks as unknown as CompactTrackInput[], 0) }

  function handleRowKeydown(event: KeyboardEvent, track: RecentTrack): void {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); playTrack(track) }
  }

  $effect(() => {
    load()
    const refresh = () => load()
    window.addEventListener('local-listening-history-change', refresh)
    return () => window.removeEventListener('local-listening-history-change', refresh)
  })

  const scrollViewport = getScrollViewport()

  // 移动外壳负责路由滚动；桌面页在挂载时恢复并记录。
  $effect(() => {
    const cancelRestore = restoreScrollTop('recent', scrollViewport)
    const stopTracking = trackScrollTop('recent', scrollViewport)
    return () => { cancelRestore(); stopTracking() }
  })

  const rows = $derived(toSongRows(recentTracks))

  function artistsOf(track: RecentTrack): TrackArtist[] {
    return (track.artists || track.ar || []) as TrackArtist[]
  }

  function albumNameOf(track: RecentTrack): string {
    return ((track.album as { name?: unknown } | null | undefined)?.name as string) || (track.al?.name as string) || ''
  }
</script>

<div class="recent-page fade-in">
  <div class="page-header">
    <h1>最近播放</h1>
    <div class="subtitle">共 {recentTracks.length} 首歌曲{#if !auth.isLoggedIn} · 本地记录{/if}</div>
  </div>
  {#if recentLoading && recentTracks.length === 0}
    <SongList skeleton rows={[]} skeletonLabel="加载最近播放" />
  {:else if recentTracks.length > 0}
    <div class="recent-actions">
      <button class="play-all-btn" onclick={playAll}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        播放全部
      </button>
    </div>
    <SongList
      {rows}
      currentId={player.id}
      rowActions={songActions?.bindRow ?? null}
      onPlay={(row) => playTrack(row.source as RecentTrack)}
      {onOpenArtist}
      {onOpenAlbum}
    />
  {:else}
    <div class="empty-state">
      <div class="large-icon">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <p>还没有播放记录</p>
      <p style="font-size:13px;color:var(--text-tertiary);margin-top:4px;">去首页听听歌吧</p>
    </div>
  {/if}
  {#if error}
    <ErrorBlock message={error} onRetry={load} />
  {/if}

  <SongListActions onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onBindRow={(fn: RowBinder) => { songActions = { bindRow: fn } }} />
</div>
