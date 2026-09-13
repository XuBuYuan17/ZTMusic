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
  import ErrorBlock from '../../components/ui/ErrorBlock.svelte'

  type RecentTrack = NormalizedRecordSong | NormalizedLocalHistorySong
  interface TrackArtist { id?: SongId; name?: unknown }
  type RowBinder = (track: unknown) => { oncontextmenu: (event: MouseEvent) => void }

  let { onOpenArtist, onOpenAlbum }: {
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
  } = $props()

  let recentTracks = $state<RecentTrack[]>([])
  let recentLoading = $state(false)
  let error = $state('')
  let songActions = $state<{ bindRow: RowBinder } | null>(null)
  let _requestId = 0

  async function load(): Promise<void> {
    const rid = ++_requestId; recentLoading = true; recentTracks = []; error = ''
    try {
      const tracks = await loadRecentData(ncm, auth.user)
      if (rid === _requestId) recentTracks = tracks
    } catch (e) { if (rid === _requestId) error = (e as { message?: string } | null | undefined)?.message || '加载失败' }
    finally { if (rid === _requestId) recentLoading = false }
  }

  function playTrack(track: RecentTrack): void {
    const idx = recentTracks.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(recentTracks as unknown as CompactTrackInput[], idx); else player.playTrack(track as unknown as CompactTrackInput, 0)
  }
  function playAll(): void { if (recentTracks.length) player.playQueue(recentTracks as unknown as CompactTrackInput[], 0) }

  $effect(() => {
    load()
    const refresh = () => load()
    window.addEventListener('local-listening-history-change', refresh)
    return () => window.removeEventListener('local-listening-history-change', refresh)
  })

  function artistsOf(track: RecentTrack): TrackArtist[] {
    return (track.artists || track.ar || []) as TrackArtist[]
  }

  function albumNameOf(track: RecentTrack): string {
    return ((track.album as { name?: unknown } | null | undefined)?.name as string) || (track.al?.name as string) || ''
  }
</script>

<div class="fade-in">
  <div class="page-header">
    <h1>最近播放</h1>
    <div class="subtitle">共 {recentTracks.length} 首歌曲{#if !auth.isLoggedIn} · 本地记录{/if}</div>
  </div>
  {#if recentLoading && recentTracks.length === 0}
    <table class="track-table" aria-label="加载最近播放">
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
        {#each Array(9) as _, i}
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
  {:else if recentTracks.length > 0}
    <div class="recent-actions">
      <button class="play-all-btn" onclick={playAll}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        播放全部
      </button>
    </div>
    <table class="track-table">
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
        {#each recentTracks as track, i (track.id)}
          <tr class:active={player.id === track.id} onclick={() => playTrack(track)} {...songActions?.bindRow(track)}>
            <td class="col-num">{i + 1}</td>
            <td class="col-cover">
              {#if track.picUrl}
                <img class="track-cover-img" src={coverUrl(track.picUrl, 80)} alt="" loading="lazy" referrerpolicy="no-referrer" />
              {:else}
                <div class="track-cover-placeholder">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
              {/if}
            </td>
            <td class="col-title">{track.name}</td>
            <td class="col-artist artist-links">
              {#each artistsOf(track) as artist, index (artist.id || (artist.name as SongId))}
                {#if index > 0}<span class="artist-sep">/</span>{/if}
                {#if artist.id}
                  <button class="artist-link" onclick={(event) => { event.stopPropagation(); onOpenArtist?.(artist.id!) }}>{artist.name}</button>
                {:else}
                  <span>{artist.name}</span>
                {/if}
              {/each}
            </td>
            <td class="col-album">{albumNameOf(track)}</td>
            <td class="col-dur">{formatDuration((track.duration as number) || track.dt || 0)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
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
