<script>
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'
  import { coverUrl } from '../utils/image.js'
  import SongListActions from '../components/SongListActions.svelte'

  let {
    playlistDetail = null,
    loading = false,
    loadingMore = false,
    error = '',
    selectedId = null,
    heroColor = '#141414',
    detailType = '歌单',
    onBack,
    onPlayAll,
    onPlayTrack,
    onOpenArtist,
    onOpenAlbum,
  } = $props()

  let songActions = $state(null)
  let trackSearch = $state('')
  let trackSort = $state('added')
  let trackSortDir = $state('desc')
  let lastSelectedId = $state(null)

  let visibleTracks = $derived(filterAndSortTracks(playlistDetail?.tracks || [], trackSearch, trackSort, trackSortDir))

  $effect(() => {
    if (lastSelectedId !== selectedId) {
      lastSelectedId = selectedId
      trackSearch = ''
      trackSort = 'added'
      trackSortDir = 'desc'
    }
  })

  function setSort(sort) {
    if (trackSort === sort) {
      trackSortDir = trackSortDir === 'asc' ? 'desc' : 'asc'
      return
    }
    trackSort = sort
    trackSortDir = sort === 'alpha' ? 'asc' : 'desc'
  }

  function artistsOf(track) {
    return track.artists || track.ar || []
  }

  function artistText(track) {
    return artistsOf(track).map(artist => artist.name).join(' / ')
  }

  function albumName(track) {
    return track.album?.name || track.al?.name || ''
  }

  function searchText(track) {
    return [track.name, artistText(track), albumName(track)].filter(Boolean).join(' ').toLowerCase()
  }

  function firstLetter(track) {
    return (track.name || '').trim().localeCompare ? (track.name || '').trim() : ''
  }

  function addedTime(track) {
    return track.addTime || track.addedAt || 0
  }

  function filterAndSortTracks(tracks, search, sort, direction) {
    const keyword = search.trim().toLowerCase()
    const filtered = keyword ? tracks.filter(track => searchText(track).includes(keyword)) : [...tracks]
    const dir = direction === 'asc' ? 1 : -1
    if (sort === 'alpha') {
      return filtered.sort((a, b) => firstLetter(a).localeCompare(firstLetter(b), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }) * dir)
    }
    return filtered.sort((a, b) => {
      const aTime = addedTime(a)
      const bTime = addedTime(b)
      const diff = aTime - bTime
      if (diff !== 0) return diff
      if (!aTime && !bTime) return (a.playlistIndex ?? 0) - (b.playlistIndex ?? 0)
      return ((a.playlistIndex ?? 0) - (b.playlistIndex ?? 0)) * dir
    })
  }

  function duration(track) {
    return formatDuration(track.duration || track.dt || 0)
  }

  function handleRowKeydown(event, track) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPlayTrack?.(track.id, visibleTracks)
    }
  }
</script>

{#key selectedId}
  <div class="fade-in">
    {#if loading && !playlistDetail}
      <div class="hero-section" style="margin: -24px -32px 0;padding:32px;border-radius:0;position:relative;">
        <button class="hero-back-btn" onclick={onBack} aria-label="返回">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div class="hero-cover skeleton-block"></div>
        <div class="hero-info">
          <div class="skeleton-line short" style="margin-bottom:10px"></div>
          <div class="skeleton-line medium" style="height:52px;margin-bottom:12px"></div>
          <div class="hero-meta skeleton-line narrow"></div>
          <div class="hero-desc skeleton-line"></div>
        </div>
      </div>
      <table class="track-table" aria-label="加载详情歌曲">
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
          {#each Array(10) as _, i}
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
    {:else if error}
      <div class="detail-state">
        <p>{error}</p>
        <button onclick={onBack}>返回</button>
      </div>
    {:else if playlistDetail}
      <div class="hero-section" style="margin: -24px -32px 0;padding:32px;border-radius:0;position:relative;">
        <button class="hero-back-btn" onclick={onBack} aria-label="返回">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        {#if playlistDetail.coverImgUrl || playlistDetail.picUrl}
          <img class="hero-cover" src={coverUrl(playlistDetail.coverImgUrl || playlistDetail.picUrl, 420)} alt={playlistDetail.name} referrerpolicy="no-referrer" />
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
          <button class="hero-play-btn" onclick={() => onPlayAll?.(visibleTracks)} disabled={loading || !visibleTracks.length}>播放全部</button>
        </div>
      </div>
      <div class="playlist-toolbar">
        <label class="playlist-search" aria-label="搜索歌单歌曲">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input bind:value={trackSearch} placeholder="搜索歌单内歌曲、歌手、专辑" />
          {#if trackSearch}
            <button type="button" onclick={() => trackSearch = ''} aria-label="清空搜索">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          {/if}
        </label>

        <span class="playlist-toolbar-count">{visibleTracks.length} / {playlistDetail.tracks?.length || 0}</span>
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
          {#if loading && (!playlistDetail?.tracks || playlistDetail.tracks.length === 0)}
            {#each Array(10) as _, i}
              <tr class="skeleton-table-row">
                <td class="col-num">{i + 1}</td>
                <td class="col-cover"><div class="track-cover-placeholder skeleton-block"></div></td>
                <td class="col-title"><span class="skeleton-line"></span></td>
                <td class="col-artist"><span class="skeleton-line medium"></span></td>
                <td class="col-album"><span class="skeleton-line narrow"></span></td>
                <td class="col-dur"><span class="skeleton-line short"></span></td>
              </tr>
            {/each}
          {:else}
            {#if visibleTracks.length === 0 && !loading}
              <tr class="track-empty-row">
                <td colspan="6">没有匹配的歌曲</td>
              </tr>
            {/if}
            {#each visibleTracks as track, i (track.id)}
              <tr
                class:active={player.id === track.id}
                role="button"
                tabindex="0"
                onclick={() => onPlayTrack?.(track.id, visibleTracks)}
                onkeydown={(event) => handleRowKeydown(event, track)}
                {...songActions?.bindRow(track)}
              >
                <td class="col-num">{i + 1}</td>
                <td class="col-cover">
                  {#if track.al?.picUrl || track.album?.picUrl}
                    <img class="track-cover-img" src={coverUrl(track.al?.picUrl || track.album?.picUrl, 80)} alt="" loading="lazy" referrerpolicy="no-referrer" />
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
            {#if loadingMore && playlistDetail?.tracks?.length}
              <tr class="loading-more-row">
                <td colspan="6">
                  <span class="loading-more-spinner"></span>
                  正在加载更多歌曲…
                </td>
              </tr>
            {/if}
          {/if}
        </tbody>
      </table>
    {:else}
      <div class="detail-state">
        <p>没有找到详情信息</p>
        <button onclick={onBack}>返回</button>
      </div>
    {/if}
  </div>
  <SongListActions onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onBindRow={(fn) => { songActions = { bindRow: fn } }} />
{/key}

<style>
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
    font-weight: 750;
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
</style>
