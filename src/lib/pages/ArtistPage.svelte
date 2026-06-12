<script>
  import { slide } from 'svelte/transition'
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'

  let {
    artist = null,
    songs = [],
    albums = [],
    loading = false,
    error = '',
    onBack,
    onPlayAll,
    onPlayTrack,
    onOpenAlbum,
    onOpenArtist,
    onToggleFollow,
  } = $props()

  let showAllSongs = $state(false)

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

  const featuredSongs = $derived(songs.slice(0, 5))
  const visibleSongs = $derived(showAllSongs ? songs : songs.slice(0, 5))

  $effect(() => {
    artist?.id
    showAllSongs = false
  })

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
    <div class="artist-hero">
      <div class="artist-hero-bg"></div>
      <div class="artist-hero-mask"></div>
      <button class="artist-back" onclick={onBack} aria-label="返回">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="artist-avatar-wrap">
        <div class="artist-avatar skeleton-block"></div>
      </div>
      <div class="artist-info">
        <div class="artist-label skeleton-line short"></div>
        <div class="skeleton-line medium" style="height:64px;margin:0 0 12px"></div>
        <div class="artist-alias skeleton-line narrow"></div>
        <div class="artist-meta"><span class="skeleton-line medium"></span></div>
      </div>
    </div>
    <section class="artist-section" aria-label="加载热门歌曲">
      <div class="artist-section-header">
        <h2>热门歌曲</h2>
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
          {#each Array(8) as _, i}
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
    </section>
    <section class="artist-section" aria-label="加载专辑作品">
      <h2>专辑作品</h2>
      <div class="artist-albums">
        {#each Array(6) as _}
          <div class="artist-album-card skeleton-row">
            <div class="artist-album-cover skeleton-block"></div>
            <div class="artist-album-name skeleton-line"></div>
            <div class="artist-album-meta skeleton-line narrow"></div>
          </div>
        {/each}
      </div>
    </section>
  {:else if error}
    <div class="artist-empty">
      <p>{error}</p>
      <button onclick={onBack}>返回</button>
    </div>
  {:else if artist}
    <div class="artist-hero">
      <div class="artist-hero-bg" style="background-image:url({(artist.cover || artist.avatar || artist.picUrl || '') + '?param=1000y500'})"></div>
      <div class="artist-hero-grain"></div>
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
        <div class="artist-label"><span></span>艺人档案</div>
        <h1>{artist.name}</h1>
        {#if artist.alias?.length}
          <div class="artist-alias">{artist.alias.join(' / ')}</div>
        {/if}
        <div class="artist-meta">
          {#if artist.musicSize}<span>{artist.musicSize} 首歌曲</span>{/if}
          {#if artist.albumSize}<span>{artist.albumSize} 张专辑</span>{/if}
          {#if artist.identities?.length}<span>{artist.identities.join(' · ')}</span>{/if}
        </div>
        <div class="artist-actions">
          <button class="artist-play-all" onclick={onPlayAll} disabled={!songs.length}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            播放热门歌曲
          </button>
          <button class="artist-follow-btn" class:active={artist.followed} onclick={onToggleFollow}>
            {artist.followed ? '已关注' : '关注'}
          </button>
          {#if albums.length}<span class="artist-work-count">{albums.length} 张作品已收录</span>{/if}
        </div>
      </div>
    </div>

    {#if featuredSongs.length > 0}
      <section class="artist-feature-strip" aria-label="代表作品">
        {#each featuredSongs as track, index (track.id)}
          <button class="artist-feature-card" onclick={() => onPlayTrack?.(track)}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{track.name}</strong>
            <em>{albumOf(track).name || '热门单曲'}</em>
          </button>
        {/each}
      </section>
    {/if}

    {#if artist.briefDesc}
      <section class="artist-section artist-bio-section">
        <h2>简介</h2>
        <p class="artist-desc">{artist.briefDesc}</p>
      </section>
    {/if}

    {#if songs.length > 0}
      <section class="artist-section">
        <div class="artist-section-header">
          <h2>热门歌曲</h2>
          <div class="artist-section-actions">
            {#if songs.length > 5}
              <button class="artist-section-action secondary" onclick={() => showAllSongs = !showAllSongs}>{showAllSongs ? '收起' : `查看全部 ${songs.length} 首`}</button>
            {/if}
            <button class="artist-section-action" onclick={onPlayAll}>播放全部</button>
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
            {#each visibleSongs as track, i (track.id)}
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
  .artist-page { min-height: 100%; padding-bottom: 18px; }
  .artist-empty { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 14px; min-height: 360px; color: var(--text-secondary); }
  .artist-empty p { margin: 0; }
  .artist-empty button { min-height: 36px; padding: 0 16px; border-radius: var(--r-lg); background: var(--accent-bg); color: var(--accent); font-size: 13px; font-weight: 750; }
  .artist-empty button:hover { background: var(--accent-bg-hover); }
  .artist-hero { position: relative; display: grid; grid-template-columns: minmax(160px, 220px) minmax(0, 1fr); align-items: end; gap: 34px; min-height: 390px; margin: -24px -32px 22px; padding: 78px 40px 40px; overflow: hidden; isolation: isolate; }
  .artist-hero-bg { position: absolute; inset: 0; background-size: cover; background-position: center 30%; filter: blur(10px) saturate(1.2); transform: scale(1.04); opacity: 0.58; }
  .artist-hero-grain { position: absolute; inset: 0; background: radial-gradient(circle at 18% 18%, rgba(255,255,255,0.18), transparent 24%), linear-gradient(135deg, rgba(0,0,0,0.12), transparent 48%); mix-blend-mode: overlay; opacity: 0.75; }
  .artist-hero-mask { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.14), rgba(0,0,0,0.38) 54%, var(--bg) 100%), linear-gradient(90deg, rgba(0,0,0,0.38), transparent 64%); }
  .artist-back { position: absolute; left: 32px; top: 28px; z-index: 2; width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.18); background: rgba(20,20,20,0.45); color: #fff; display: grid; place-items: center; cursor: pointer; backdrop-filter: blur(16px); transition: transform .18s, background .18s; }
  .artist-back:hover { transform: translateX(-2px); background: rgba(20,20,20,0.62); }
  .artist-avatar-wrap { position: relative; z-index: 1; flex-shrink: 0; }
  .artist-avatar { width: clamp(158px, 18vw, 220px); height: clamp(158px, 18vw, 220px); border-radius: 28px; object-fit: cover; box-shadow: 18px 24px 60px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.18); }
  .artist-avatar-placeholder { display: grid; place-items: center; background: var(--accent-bg); color: var(--accent); font-size: 48px; font-weight: 800; }
  .artist-info { position: relative; z-index: 1; min-width: 0; color: #fff; text-shadow: 0 2px 18px rgba(0,0,0,0.36); }
  .artist-label { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(255,255,255,0.76); margin-bottom: 8px; }
  .artist-label span { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 18px var(--accent); }
  .artist-info h1 { font-size: clamp(46px, 8vw, 88px); line-height: 0.92; margin: 0 0 14px; letter-spacing: -3px; color: #fff; max-width: 980px; }
  .artist-alias { color: rgba(255,255,255,0.74); font-size: 15px; margin-bottom: 12px; }
  .artist-meta { display: flex; flex-wrap: wrap; gap: 8px; color: rgba(255,255,255,0.82); font-size: 13px; margin-bottom: 22px; }
  .artist-meta span { padding: 5px 10px; border-radius: 999px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(16px); }
  .artist-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
  .artist-work-count { color: rgba(255,255,255,0.68); font-size: 12px; font-weight: 700; }
  .artist-play-all, .artist-section-action, .artist-follow-btn { display: inline-flex; align-items: center; gap: 7px; border: none; border-radius: 999px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 700; padding: 9px 18px; cursor: pointer; transition: transform .15s, background .15s, color .15s; }
  .artist-play-all:hover, .artist-section-action:hover { background: var(--accent-hover); transform: scale(1.03); }
  .artist-play-all:disabled { opacity: .5; cursor: default; transform: none; }
  .artist-follow-btn { background: rgba(255,255,255,0.14); color: #fff; border: 1px solid rgba(255,255,255,0.16); backdrop-filter: blur(16px); }
  .artist-follow-btn:hover { background: rgba(255,255,255,0.22); transform: scale(1.03); }
  .artist-follow-btn.active { background: #fff; color: #111; }
  .artist-section-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .artist-section-action.secondary { background: var(--accent-bg); color: var(--accent); }
  .artist-section-action.secondary:hover { background: var(--accent-bg-hover); }
  .artist-feature-strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin: 0 0 28px; }
  .artist-feature-card { display: grid; gap: 6px; min-width: 0; min-height: 112px; padding: 14px; border-radius: 14px; background: var(--bg-surface); border: 1px solid var(--border); text-align: left; box-shadow: var(--shadow-sm); transition: transform .18s, background .18s, border-color .18s; }
  .artist-feature-card:hover { transform: translateY(-3px); background: var(--bg-elevated); border-color: var(--border-strong); }
  .artist-feature-card span { color: var(--accent); font-size: 12px; font-weight: 850; }
  .artist-feature-card strong { color: var(--text); font-size: 14px; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .artist-feature-card em { align-self: end; color: var(--text-tertiary); font-size: 11px; font-style: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .artist-section { margin-bottom: 34px; }
  .artist-bio-section { padding: 22px; border-radius: 18px; background: linear-gradient(135deg, var(--bg-surface), var(--bg-layer)); border: 1px solid var(--border); }
  .artist-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .artist-section h2 { margin: 0 0 14px; color: var(--text); font-size: 22px; letter-spacing: -0.4px; }
  .artist-desc { margin: 0; max-width: 980px; color: var(--text-secondary); line-height: 1.82; white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
  .artist-links { display: flex; align-items: center; gap: 5px; min-width: 0; }
  .artist-link { border: none; background: transparent; color: inherit; padding: 0; font: inherit; cursor: pointer; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .artist-link:hover { color: var(--accent); text-decoration: underline; }
  .artist-sep { color: var(--text-tertiary); }
  .artist-albums { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 18px; }
  .artist-album-card { cursor: pointer; transition: transform .18s; min-width: 0; padding: 8px; border-radius: 16px; }
  .artist-album-card:hover { transform: translateY(-3px); background: var(--bg-hover); }
  .artist-album-cover { width: 100%; aspect-ratio: 1; border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-sm); background: var(--bg-surface); margin-bottom: 10px; }
  .artist-album-cover img { width: 100%; height: 100%; object-fit: cover; }
  .artist-album-placeholder { width: 100%; height: 100%; display: grid; place-items: center; color: var(--text-tertiary); }
  .artist-album-name { color: var(--text); font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .artist-album-meta { color: var(--text-tertiary); font-size: 11px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  :global([data-theme='light']) .artist-hero-mask { background: linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.24) 58%, var(--bg) 100%), linear-gradient(90deg, rgba(0,0,0,0.28), transparent 64%); }
  :global([data-theme='light']) .artist-back { background: rgba(255,255,255,0.62); color: var(--text); border-color: rgba(0,0,0,0.08); }
  :global([data-theme='light']) .artist-avatar { box-shadow: 18px 24px 56px rgba(0,0,0,0.24), 0 0 0 1px rgba(0,0,0,0.06); }

  @media (max-width: 720px) {
    .artist-hero { grid-template-columns: 1fr; align-items: end; min-height: 520px; padding: 78px 24px 32px; margin-left: -24px; margin-right: -24px; }
    .artist-avatar { width: 142px; height: 142px; border-radius: 22px; }
    .artist-info h1 { font-size: 42px; letter-spacing: -1.6px; }
    .artist-feature-strip { grid-template-columns: 1fr; }
    .artist-albums { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  }
</style>
