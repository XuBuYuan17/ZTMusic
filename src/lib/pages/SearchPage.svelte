<script>
  import { slide } from 'svelte/transition'
  import { ncm } from '../api/client.js'
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'

  let { onOpenArtist, onOpenPlaylist } = $props()

  let keyword = $state('')
  let loading = $state(false)
  let results = $state({ songs: [], artists: [], playlists: [] })
  let hotList = $state([])
  let requestId = 0

  $effect(() => {
    ncm.searchHot().then(res => {
      hotList = res?.result?.hots || res?.data || []
    }).catch(() => {})
  })

  async function doSearch() {
    const kw = keyword.trim()
    if (!kw) return
    const currentRequest = ++requestId
    loading = true
    results = { songs: [], artists: [], playlists: [] }
    try {
      const [songRes, artistRes, playlistRes] = await Promise.all([
        ncm.searchSongs(kw, 30).catch(() => ({ result: {} })),
        ncm.searchArtists(kw, 16).catch(() => ({ result: {} })),
        ncm.searchPlaylists(kw, 16).catch(() => ({ result: {} })),
      ])
      if (currentRequest !== requestId) return
      const songs = songRes?.result?.songs || []
      const artists = artistRes?.result?.artists || []
      const playlists = playlistRes?.result?.playlists || []
      const detailRes = songs.length ? await ncm.songDetail(songs.map(t => t.id)).catch(() => ({ songs: [] })) : { songs: [] }
      if (currentRequest !== requestId) return
      const detailMap = new Map((detailRes?.songs || []).map(song => [song.id, song]))
      results = {
        songs: songs.map(t => {
          const detail = detailMap.get(t.id) || {}
          const album = detail.al || t.album || t.al || {}
          const picId = album.picId || album.picId_str || album.picIdStr || album.imgId || 0
          const coverUrl = album.picUrl || album.imgUrl || t.album?.picUrl || t.al?.picUrl || (picId ? `https://p1.music.126.net/${picId}.jpg` : '')
          return { ...detail, id: t.id, name: t.name, ar: detail.ar || t.artists || t.ar || [], al: album, dt: detail.dt || t.duration || t.dt || 0, picUrl: coverUrl }
        }),
        artists: artists.map(a => ({ id: a.id, name: a.name, picUrl: a.picUrl || a.img1v1Url || a.img1Url || '', albumSize: a.albumSize || 0, musicSize: a.musicSize || 0 })),
        playlists: playlists.map(pl => ({ id: pl.id, name: pl.name, picUrl: pl.coverImgUrl || pl.picUrl || (pl.coverImgIdStr ? `https://p1.music.126.net/${pl.coverImgIdStr}.jpg` : ''), trackCount: pl.trackCount || 0, creator: pl.creator?.nickname || '' })),
      }
    } catch {
      if (currentRequest === requestId) results = { songs: [], artists: [], playlists: [] }
    }
    if (currentRequest === requestId) loading = false
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') doSearch()
  }

  function playSong(track) {
    player.playTrack(track, 0)
  }

  function playAllSongs() {
    if (results.songs.length) player.playQueue(results.songs, 0)
  }

  function chooseHot(item) {
    keyword = item.first || item.searchWord || ''
    doSearch()
  }
</script>

<div class="search-page fade-in" transition:slide={{ duration: 240, axis: 'x' }}>
  <div class="search-command">
    <div>
      <div class="search-kicker">搜索</div>
      <h1>查找音乐</h1>
    </div>
    <div class="search-input-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="search-input" type="text" placeholder="歌曲、歌手、歌单" bind:value={keyword} onkeydown={handleKeydown} />
      {#if keyword}
        <button class="search-clear" onclick={() => keyword = ''} aria-label="清空搜索">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      {/if}
      <button class="search-submit" onclick={doSearch}>搜索</button>
    </div>
  </div>

  {#if loading}
    <div class="search-loading"><div class="search-spinner"></div></div>
  {:else if keyword.trim() === ''}
    <div class="search-empty-layout">
      <section class="search-chart-panel">
        <div class="search-section-header"><h2>热门搜索</h2><span>实时趋势</span></div>
        <div class="search-hot-list">
          {#each hotList.slice(0, 10) as item, i}
            <button class="search-hot-row" class:top={i < 3} onclick={() => chooseHot(item)}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <strong>{item.first || item.searchWord}</strong>
              <em>{i < 3 ? '热门' : '趋势'}</em>
            </button>
          {/each}
        </div>
      </section>

      <aside class="search-browse-panel">
        <div class="search-browse-hero">
          <small>快速开始</small>
          <strong>输入关键词，或从趋势里进入</strong>
        </div>
        <div class="search-browse-grid">
          <button onclick={() => { keyword = '新歌'; doSearch() }}>新歌</button>
          <button onclick={() => { keyword = '华语'; doSearch() }}>华语</button>
          <button onclick={() => { keyword = '轻音乐'; doSearch() }}>轻音乐</button>
          <button onclick={() => { keyword = '电子'; doSearch() }}>电子</button>
        </div>
      </aside>
    </div>
  {:else if results.songs.length === 0 && results.artists.length === 0 && results.playlists.length === 0}
    <div class="search-empty">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <p>未找到相关结果</p>
    </div>
  {:else}
    <div class="search-results-layout">
      <section class="search-main-results">
        {#if results.songs.length > 0}
          <div class="search-top-result">
            <div class="search-section-header"><h2>最佳匹配</h2><button onclick={playAllSongs}>播放歌曲结果</button></div>
            <button class="search-feature-song" onclick={() => playSong(results.songs[0])}>
              {#if results.songs[0].picUrl}<img src={results.songs[0].picUrl + '?param=220y220'} alt="" loading="lazy" />{:else}<span class="search-feature-cover search-cover-placeholder">♫</span>{/if}
              <span><small>歌曲</small><strong>{results.songs[0].name}</strong><em>{(results.songs[0].ar || []).map(a => a.name).join(' / ')}</em></span>
            </button>
          </div>

          <div class="search-songs-panel">
            <div class="search-section-header"><h2>歌曲</h2><span>{results.songs.length} 首</span></div>
            <div class="search-songs">
              {#each results.songs.slice(0, 18) as track (track.id)}
                <button class="search-song-row" class:active={player.id === track.id} onclick={() => playSong(track)}>
                  {#if track.picUrl}<img class="search-song-cover" src={track.picUrl + '?param=80y80'} alt="" loading="lazy" />{:else}<div class="search-song-cover search-cover-placeholder">♫</div>{/if}
                  <span class="search-song-info"><strong>{track.name}</strong><em>{(track.ar || []).map(a => a.name).join(' / ')}{#if track.al?.name} · {track.al.name}{/if}</em></span>
                  <span class="search-song-dur">{formatDuration(track.dt)}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </section>

      <aside class="search-side-results">
        {#if results.artists.length > 0}
          <section class="search-side-card">
            <div class="search-section-header"><h2>歌手</h2><span>{results.artists.length}</span></div>
            <div class="search-compact-list">
              {#each results.artists.slice(0, 6) as artist (artist.id)}
                <button onclick={() => onOpenArtist?.(artist.id)}>
                  {#if artist.picUrl}<img src={artist.picUrl + '?param=120y120'} alt="" loading="lazy" />{:else}<span class="search-avatar-ph">{artist.name?.charAt(0) || '?'}</span>{/if}
                  <span><strong>{artist.name}</strong><em>{artist.musicSize || 0} 首歌曲</em></span>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if results.playlists.length > 0}
          <section class="search-side-card">
            <div class="search-section-header"><h2>歌单</h2><span>{results.playlists.length}</span></div>
            <div class="search-playlist-grid">
              {#each results.playlists.slice(0, 6) as pl (pl.id)}
                <button onclick={() => onOpenPlaylist?.(pl.id)}>
                  {#if pl.picUrl}<img src={pl.picUrl + '?param=180y180'} alt="" loading="lazy" />{:else}<span class="search-cover-placeholder">♫</span>{/if}
                  <strong>{pl.name}</strong>
                  <em>{pl.creator || '歌单'} · {pl.trackCount} 首</em>
                </button>
              {/each}
            </div>
          </section>
        {/if}
      </aside>
    </div>
  {/if}
</div>

<style>
  .search-page { display: grid; gap: 26px; }
  .search-command { display: grid; grid-template-columns: minmax(180px, 280px) minmax(280px, 1fr); align-items: end; gap: 24px; }
  .search-kicker { color: var(--accent); font-size: 13px; font-weight: 800; margin-bottom: 4px; }
  .search-command h1 { font-size: clamp(36px, 4vw, 58px); line-height: 0.95; letter-spacing: -0.04em; }
  .search-input-wrap { display: flex; align-items: center; gap: 10px; min-height: 54px; background: color-mix(in srgb, var(--bg-layer) 86%, transparent); border: 1px solid var(--border); border-radius: 18px; padding: 8px 10px 8px 16px; transition: border-color 0.2s, box-shadow 0.2s; }
  .search-input-wrap:focus-within { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent); }
  .search-icon { color: var(--text-tertiary); flex-shrink: 0; }
  .search-input { flex: 1; min-width: 0; border: none; background: none; outline: none; font-size: 16px; color: var(--text); }
  .search-clear, .search-submit { border: none; cursor: pointer; }
  .search-clear { color: var(--text-tertiary); width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; }
  .search-clear:hover { background: var(--bg-hover); }
  .search-submit { height: 38px; padding: 0 18px; border-radius: 999px; background: var(--accent); color: white; font-weight: 800; }
  .search-loading { display: flex; justify-content: center; padding: 80px 0; }
  .search-spinner { width: 28px; height: 28px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .search-empty-layout, .search-results-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr); gap: 22px; align-items: start; }
  .search-chart-panel, .search-browse-panel, .search-top-result, .search-songs-panel, .search-side-card { border: 1px solid var(--border); border-radius: 26px; background: color-mix(in srgb, var(--bg-layer) 84%, transparent); padding: 18px; }
  .search-section-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .search-section-header h2 { font-size: 18px; font-weight: 850; letter-spacing: -0.03em; }
  .search-section-header span, .search-section-header button { color: var(--text-tertiary); font-size: 12px; font-weight: 760; }
  .search-section-header button { color: var(--accent); }
  .search-hot-list, .search-songs, .search-compact-list { display: grid; gap: 4px; }
  .search-hot-row, .search-song-row, .search-compact-list button { display: grid; align-items: center; width: 100%; border: none; background: transparent; color: var(--text); cursor: pointer; text-align: left; border-radius: 14px; }
  .search-hot-row { grid-template-columns: 44px minmax(0, 1fr) 58px; min-height: 46px; padding: 0 12px; }
  .search-hot-row:hover, .search-song-row:hover, .search-compact-list button:hover { background: var(--bg-hover); }
  .search-hot-row.top span { color: var(--accent); }
  .search-hot-row span { color: var(--text-tertiary); font-weight: 850; }
  .search-hot-row strong, .search-song-info strong, .search-compact-list strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-hot-row em { justify-self: end; color: var(--text-tertiary); font-size: 11px; font-style: normal; }
  .search-browse-hero { min-height: 178px; display: flex; flex-direction: column; justify-content: flex-end; padding: 22px; border-radius: 24px; background: radial-gradient(circle at 18% 18%, rgba(255,59,48,0.38), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); }
  .search-browse-hero small { color: rgba(255,255,255,0.62); font-weight: 800; }
  .search-browse-hero strong { color: white; font-size: 22px; line-height: 1.08; margin-top: 8px; }
  .search-browse-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
  .search-browse-grid button { min-height: 54px; border-radius: 18px; background: var(--bg-surface); color: var(--text); border: 1px solid var(--border); cursor: pointer; font-weight: 800; }
  .search-main-results { display: grid; gap: 18px; }
  .search-feature-song { display: grid; grid-template-columns: 106px minmax(0, 1fr); gap: 16px; align-items: end; width: 100%; text-align: left; color: var(--text); cursor: pointer; }
  .search-feature-song img, .search-feature-cover { width: 106px; height: 106px; object-fit: cover; border-radius: 20px; box-shadow: var(--shadow-md); }
  .search-feature-song span, .search-song-info, .search-compact-list span { min-width: 0; display: grid; }
  .search-feature-song small { color: var(--accent); font-size: 12px; font-weight: 850; }
  .search-feature-song strong { font-size: 26px; line-height: 1.05; letter-spacing: -0.04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-feature-song em, .search-song-info em, .search-compact-list em, .search-playlist-grid em { color: var(--text-tertiary); font-size: 12px; font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-song-row { grid-template-columns: 46px minmax(0, 1fr) 48px; gap: 12px; min-height: 58px; padding: 6px 8px; }
  .search-song-row.active { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .search-song-cover { width: 46px; height: 46px; border-radius: 12px; object-fit: cover; }
  .search-cover-placeholder, .search-avatar-ph { display: grid; place-items: center; background: var(--bg-surface); color: var(--text-tertiary); }
  .search-song-dur { color: var(--text-tertiary); font-size: 12px; justify-self: end; }
  .search-side-results { display: grid; gap: 18px; }
  .search-compact-list button { grid-template-columns: 48px minmax(0, 1fr); gap: 12px; min-height: 58px; padding: 6px; }
  .search-compact-list img, .search-avatar-ph { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
  .search-playlist-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .search-playlist-grid button { min-width: 0; text-align: left; cursor: pointer; color: var(--text); }
  .search-playlist-grid img, .search-playlist-grid .search-cover-placeholder { width: 100%; aspect-ratio: 1; border-radius: 16px; object-fit: cover; margin-bottom: 8px; }
  .search-playlist-grid strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .search-empty { display: grid; place-items: center; gap: 10px; padding: 80px 0; color: var(--text-tertiary); }
  @media (max-width: 980px) { .search-command, .search-empty-layout, .search-results-layout { grid-template-columns: 1fr; } }
</style>
