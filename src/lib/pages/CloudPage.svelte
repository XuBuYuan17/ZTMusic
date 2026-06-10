<script>
  import { auth } from '../stores/auth.svelte.js'
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'
  import Spinner from '../components/Spinner.svelte'

  let {
    cloudSongs = [],
    cloudLoading = false,
    cloudTotal = 0,
    onOpenLogin,
    onPlayAll,
    onPlaySong,
  } = $props()
</script>

<div class="cloud-page fade-in">
  {#if !auth.isLoggedIn}
    <div class="cloud-logged-out">
      <div class="cloud-hero-icon">
        <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg>
      </div>
      <h2>登录后查看云音乐</h2>
      <p>在网易云音乐云盘存储的歌曲</p>
      <button class="cloud-login-btn" onclick={onOpenLogin}>立即登录</button>
    </div>
  {:else}
    <div class="cloud-section">
      {#if cloudLoading}
        <div class="loading-state" style="padding:60px 0"><Spinner size="lg" label="加载云盘音乐" /></div>
      {:else if cloudSongs.length > 0}
        <div class="cloud-actions">
          <button class="play-all-btn" onclick={onPlayAll}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            播放全部
          </button>
          <span class="cloud-count">共 {cloudTotal} 首</span>
        </div>
        <table class="track-table">
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th class="col-cover"></th>
              <th>标题</th>
              <th>歌手</th>
              <th class="col-dur">时长</th>
            </tr>
          </thead>
          <tbody>
            {#each cloudSongs as song, i}
              <tr class:active={player.id === song.id} onclick={() => onPlaySong?.(song)}>
                <td class="col-num">{i + 1}</td>
                <td class="col-cover">
                  {#if song.picUrl}
                    <img class="track-cover-img" src={song.picUrl + '?param=80y80'} alt="" loading="lazy" crossorigin="anonymous" referrerpolicy="no-referrer" />
                  {:else}
                    <div class="track-cover-placeholder">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    </div>
                  {/if}
                </td>
                <td class="col-title">{song.name}</td>
                <td class="col-artist">{(song.artists || []).map(a => a.name).join(', ') || ''}</td>
                <td class="col-dur">{formatDuration(song.duration)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div class="cloud-empty">
          <div class="cloud-empty-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg>
          </div>
          <p>云盘里还没有歌曲</p>
          <p class="cloud-empty-sub">在网易云音乐客户端上传歌曲到云盘吧</p>
        </div>
      {/if}
    </div>
  {/if}
</div>
