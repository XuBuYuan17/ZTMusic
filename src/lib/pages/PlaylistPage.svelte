<script>
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'

  let {
    playlistDetail = null,
    selectedId = null,
    heroColor = '#141414',
    detailType = '歌单',
    onBack,
    onPlayAll,
    onPlayTrack,
    onOpenArtist,
  } = $props()

  function artistsOf(track) {
    return track.artists || track.ar || []
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
      <div class="hero-section" style="margin: -24px -32px 0;padding:32px;border-radius:0;position:relative;">
        <button class="hero-back-btn" onclick={onBack} aria-label="返回">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        {#if playlistDetail.coverImgUrl || playlistDetail.picUrl}
          <img class="hero-cover" src={playlistDetail.coverImgUrl || playlistDetail.picUrl} alt={playlistDetail.name} />
        {:else}
          <div class="hero-cover" style="background:linear-gradient(135deg,{heroColor},#ff6b5f)"></div>
        {/if}
        <div class="hero-info">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-secondary);margin-bottom:4px;">{detailType}</div>
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
            <th class="col-cover"></th>
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
              <td class="col-cover">
                {#if track.al?.picUrl || track.album?.picUrl}
                  <img class="track-cover-img" src={(track.al?.picUrl || track.album?.picUrl) + '?param=80y80'} alt="" loading="lazy" />
                {:else}
                  <div class="track-cover-placeholder">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                  </div>
                {/if}
              </td>
              <td class="col-title">{track.name}</td>
              <td class="col-artist artist-links">
                {#each artistsOf(track) as artist, index (artist.id || artist.name)}
                  {#if index > 0}<span class="artist-sep">/</span>{/if}
                  {#if artist.id}
                    <button class="artist-link" onclick={(event) => { event.stopPropagation(); onOpenArtist?.(artist.id) }}>{artist.name}</button>
                  {:else}
                    <span>{artist.name}</span>
                  {/if}
                {/each}
              </td>
              <td class="col-album">{albumName(track)}</td>
              <td class="col-dur">{duration(track)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/key}
</div>
