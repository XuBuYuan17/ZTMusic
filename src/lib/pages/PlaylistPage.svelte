<script>
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'

  let {
    playlistDetail = null,
    selectedId = null,
    heroColor = '#141414',
    onBack,
    onPlayAll,
    onPlayTrack,
  } = $props()

  function artistNames(track) {
    return track.artists?.map(a => a.name).join(', ') || track.ar?.map(a => a.name).join(', ') || ''
  }

  function albumName(track) {
    return track.album?.name || track.al?.name || ''
  }

  function duration(track) {
    return formatDuration(track.duration || track.dt || 0)
  }

  function handleRowKeydown(event, track) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPlayTrack?.(track.id)
    }
  }
</script>

<div class="fade-in">
  {#key playlistDetail?.id || selectedId}
    {#if playlistDetail}
      <div class="hero-section" style="background: linear-gradient(135deg, {heroColor}44, transparent 70%);margin: -24px -32px 0;padding:32px;border-radius:0;">
        <button class="hero-back-btn" onclick={onBack} title="返回">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        {#if playlistDetail.coverImgUrl || playlistDetail.picUrl}
          <img class="hero-cover" src={playlistDetail.coverImgUrl || playlistDetail.picUrl} alt={playlistDetail.name} />
        {:else}
          <div class="hero-cover" style="background:linear-gradient(135deg,{heroColor},#ff6b5f)"></div>
        {/if}
        <div class="hero-info">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-secondary);margin-bottom:4px;">歌单</div>
          <h1>{playlistDetail.name}</h1>
          <div class="hero-meta">{playlistDetail.creator?.nickname ?? ''} · {playlistDetail.trackCount ?? 0} 首</div>
          {#if playlistDetail.description}
            <div class="hero-desc">{playlistDetail.description}</div>
          {/if}
          <button class="hero-play-btn" onclick={onPlayAll}>播放全部</button>
        </div>
      </div>
      <table class="track-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th>标题</th>
            <th>歌手</th>
            <th class="col-album">专辑</th>
            <th class="col-dur">时长</th>
          </tr>
        </thead>
        <tbody>
          {#each playlistDetail.tracks ?? [] as track, i}
            <tr
              class:active={player.id === track.id}
              role="button"
              tabindex="0"
              onclick={() => onPlayTrack?.(track.id)}
              onkeydown={(event) => handleRowKeydown(event, track)}
            >
              <td class="col-num">{i + 1}</td>
              <td class="col-title">{track.name}</td>
              <td class="col-artist">{artistNames(track)}</td>
              <td class="col-album">{albumName(track)}</td>
              <td class="col-dur">{duration(track)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/key}
</div>
