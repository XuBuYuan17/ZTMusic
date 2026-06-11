<script>
  import { slide } from 'svelte/transition'
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'
  import Spinner from '../components/Spinner.svelte'

  let {
    artist = null,
    songs = [],
    albums = [],
    loading = false,
    onBack,
    onPlayAll,
    onPlayTrack,
    onOpenAlbum,
    onOpenArtist,
  } = $props()

  function coverOf(track) {
    return track?.picUrl || track?.al?.picUrl || track?.album?.picUrl || ''
  }

  function artistsOf(track) {
    return track?.ar || track?.artists || []
  }

  function albumOf(track) {
    return track?.al || track?.album || {}
  }

  function durationOf(track) {
    return formatDuration(track?.dt || track?.duration || 0)
  }

  function publishYear(album) {
    if (!album?.publishTime) return ''
    return new Date(album.publishTime).getFullYear()
  }

  function handleRowKeydown(event, track) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPlayTrack?.(track)
    }
  }

  function handleCardKeydown(event, action) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action?.()
    }
  }
</script>

<div class="artist-page" transition:slide={{ duration: 280, axis: 'x' }}>
  {#if loading}
    <div class="artist-loading">
      <Spinner size="lg" label="加载歌手详情" />
    </div>
  {:else if artist}
    <div class="artist-hero">
      <div class="artist-hero-bg" style="background-image:url({(artist.cover || artist.avatar || artist.picUrl || '') + '?param=1000y500'})"></div>
      <div class="artist-hero-mask"></div>
      <button class="artist-back" onclick={onBack} aria-label="返回">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="artist-avatar-wrap">
        {#if artist.avatar || artist.picUrl || artist.cover}
          <img class="artist-avatar" src={(artist.avatar || artist.picUrl || artist.cover) + '?param=360y360'} alt={artist.name} loading="lazy" />
        {:else}
          <div class="artist-avatar artist-avatar-placeholder">{artist.name?.charAt(0) || '?'}</div>
        {/if}
      </div>
      <div class="artist-info">
        <div class="artist-label">歌手</div>
        <h1>{artist.name}</h1>
        {#if artist.alias?.length}
          <div class="artist-alias">{artist.alias.join(' / ')}</div>
        {/if}
        <div class="artist-meta">
          {#if artist.musicSize}<span>{artist.musicSize} 首歌曲</span>{/if}
          {#if artist.albumSize}<span>{artist.albumSize} 张专辑</span>{/if}
          {#if artist.identities?.length}<span>{artist.identities.join(' · ')}</span>{/if}
        </div>
        <button class="artist-play-all" onclick={onPlayAll} disabled={!songs.length}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          播放热门歌曲
        </button>
      </div>
    </div>

    {#if artist.briefDesc}
      <section class="artist-section">
        <h2>简介</h2>
        <p class="artist-desc">{artist.briefDesc}</p>
      </section>
    {/if}

    {#if songs.length > 0}
      <section class="artist-section">
        <div class="artist-section-header">
          <h2>热门歌曲</h2>
          <button class="artist-section-action" onclick={onPlayAll}>播放全部</button>
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
            {#each songs as track, i (track.id)}
              <tr
                class:active={player.id === track.id}
                role="button"
                tabindex="0"
                onclick={() => onPlayTrack?.(track)}
                onkeydown={(event) => handleRowKeydown(event, track)}
              >
                <td class="col-num">{i + 1}</td>
                <td class="col-cover">
                  {#if coverOf(track)}
                    <img class="track-cover-img" src={coverOf(track) + '?param=80y80'} alt="" loading="lazy" />
                  {:else}
                    <div class="track-cover-placeholder">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    </div>
                  {/if}
                </td>
                <td class="col-title">{track.name}</td>
                <td class="col-artist artist-links">
                  {#each artistsOf(track) as item, index (item.id || item.name)}
                    {#if index > 0}<span class="artist-sep">/</span>{/if}
                    {#if item.id}
                      <button class="artist-link" onclick={(event) => { event.stopPropagation(); onOpenArtist?.(item.id) }}>{item.name}</button>
                    {:else}
                      <span>{item.name}</span>
                    {/if}
                  {/each}
                </td>
                <td class="col-album">{albumOf(track).name || ''}</td>
                <td class="col-dur">{durationOf(track)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}

    {#if albums.length > 0}
      <section class="artist-section">
        <h2>专辑作品</h2>
        <div class="artist-albums">
          {#each albums as album (album.id)}
            <div class="artist-album-card" role="button" tabindex="0" onclick={() => onOpenAlbum?.(album.id)} onkeydown={(event) => handleCardKeydown(event, () => onOpenAlbum?.(album.id))}>
              <div class="artist-album-cover">
                {#if album.picUrl}
                  <img src={album.picUrl + '?param=400y400'} alt={album.name} loading="lazy" />
                {:else}
                  <div class="artist-album-placeholder">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                  </div>
                {/if}
              </div>
              <div class="artist-album-name">{album.name}</div>
              <div class="artist-album-meta">{publishYear(album)}{#if album.size} · {album.size} 首{/if}</div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {:else}
    <div class="artist-empty">
      <p>没有找到歌手信息</p>
    </div>
  {/if}
</div>

<style>
  .artist-page { min-height: 100%; }
  .artist-loading, .artist-empty { display: flex; justify-content: center; align-items: center; min-height: 360px; color: var(--text-secondary); }
  .artist-hero { position: relative; display: flex; align-items: flex-end; gap: 28px; min-height: 330px; margin: -24px -32px 32px; padding: 72px 32px 34px; overflow: hidden; }
  .artist-hero-bg { position: absolute; inset: 0; background-size: cover; background-position: center; filter: blur(22px) saturate(1.1); transform: scale(1.08); opacity: 0.42; }
  .artist-hero-mask { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.2), var(--bg) 96%); }
  .artist-back { position: absolute; left: 28px; top: 26px; z-index: 2; width: 38px; height: 38px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.18); background: rgba(20,20,20,0.45); color: #fff; display: grid; place-items: center; cursor: pointer; backdrop-filter: blur(16px); }
  .artist-avatar-wrap { position: relative; z-index: 1; flex-shrink: 0; }
  .artist-avatar { width: 184px; height: 184px; border-radius: 50%; object-fit: cover; box-shadow: 18px 24px 60px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.16); }
  .artist-avatar-placeholder { display: grid; place-items: center; background: var(--accent-bg); color: var(--accent); font-size: 48px; font-weight: 800; }
  .artist-info { position: relative; z-index: 1; min-width: 0; }
  .artist-label { font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 4px; }
  .artist-info h1 { font-size: clamp(42px, 8vw, 76px); line-height: 0.98; margin: 0 0 12px; letter-spacing: -3px; color: var(--text); }
  .artist-alias { color: var(--text-secondary); font-size: 15px; margin-bottom: 8px; }
  .artist-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; color: var(--text-secondary); font-size: 13px; margin-bottom: 20px; }
  .artist-play-all, .artist-section-action { display: inline-flex; align-items: center; gap: 7px; border: none; border-radius: 999px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 700; padding: 9px 18px; cursor: pointer; transition: transform .15s, background .15s; }
  .artist-play-all:hover, .artist-section-action:hover { background: var(--accent-hover); transform: scale(1.03); }
  .artist-play-all:disabled { opacity: .5; cursor: default; transform: none; }
  .artist-section { margin-bottom: 34px; }
  .artist-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .artist-section h2 { margin: 0 0 14px; color: var(--text); font-size: 22px; letter-spacing: -0.4px; }
  .artist-desc { margin: 0; max-width: 920px; color: var(--text-secondary); line-height: 1.8; white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .artist-links { display: flex; align-items: center; gap: 5px; min-width: 0; }
  .artist-link { border: none; background: transparent; color: inherit; padding: 0; font: inherit; cursor: pointer; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .artist-link:hover { color: var(--accent); text-decoration: underline; }
  .artist-sep { color: var(--text-tertiary); }
  .artist-albums { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 18px; }
  .artist-album-card { cursor: pointer; transition: transform .18s; min-width: 0; }
  .artist-album-card:hover { transform: translateY(-3px); }
  .artist-album-cover { width: 100%; aspect-ratio: 1; border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-sm); background: var(--bg-surface); margin-bottom: 10px; }
  .artist-album-cover img { width: 100%; height: 100%; object-fit: cover; }
  .artist-album-placeholder { width: 100%; height: 100%; display: grid; place-items: center; color: var(--text-tertiary); }
  .artist-album-name { color: var(--text); font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .artist-album-meta { color: var(--text-tertiary); font-size: 11px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  :global([data-theme='light']) .artist-hero-mask { background: linear-gradient(180deg, rgba(255,255,255,0.05), var(--bg) 96%); }
  :global([data-theme='light']) .artist-back { background: rgba(255,255,255,0.62); color: var(--text); border-color: rgba(0,0,0,0.08); }
  :global([data-theme='light']) .artist-avatar { box-shadow: 18px 24px 56px rgba(0,0,0,0.24), 0 0 0 1px rgba(0,0,0,0.06); }

  @media (max-width: 720px) {
    .artist-hero { flex-direction: column; align-items: flex-start; min-height: 420px; }
    .artist-avatar { width: 142px; height: 142px; }
    .artist-info h1 { font-size: 42px; letter-spacing: -1.6px; }
    .artist-albums { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  }
</style>
