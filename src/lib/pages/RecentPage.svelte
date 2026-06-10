<script>
  import { auth } from '../stores/auth.svelte.js'
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'
  import Spinner from '../components/Spinner.svelte'

  let {
    recentTracks = [],
    recentLoading = false,
    onPlayAll,
    onPlayTrack,
  } = $props()
</script>

<div class="fade-in">
  <div class="page-header">
    <h1>最近播放</h1>
    <div class="subtitle">共 {recentTracks.length} 首歌曲{#if !auth.isLoggedIn} · 本地记录{/if}</div>
  </div>
  {#if recentLoading}
    <div class="loading-state">
      <Spinner size="lg" label="加载最近播放" />
    </div>
  {:else if recentTracks.length > 0}
    <div class="recent-actions">
      <button class="play-all-btn" onclick={onPlayAll}>
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
        {#each recentTracks as track, i}
          <tr class:active={player.id === track.id} onclick={() => onPlayTrack?.(track)}>
            <td class="col-num">{i + 1}</td>
            <td class="col-cover">
              {#if track.picUrl}
                <img class="track-cover-img" src={track.picUrl + '?param=80y80'} alt="" loading="lazy" />
              {:else}
                <div class="track-cover-placeholder">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
              {/if}
            </td>
            <td class="col-title">{track.name}</td>
            <td class="col-artist">{track.artists?.map(a => a.name).join(', ') || track.ar?.map(a => a.name).join(', ') || ''}</td>
            <td class="col-album">{track.album?.name || track.al?.name || ''}</td>
            <td class="col-dur">{formatDuration(track.duration || track.dt || 0)}</td>
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
</div>
