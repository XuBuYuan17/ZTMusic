<script>
  import { musicService } from '../music/service.js'
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'
  import { coverUrl as imageCoverUrl } from '../utils/image.js'
  import ArtistNames from '../components/ArtistNames.svelte'
  import SongListActions from '../components/SongListActions.svelte'
  import Icon from '../components/ui/Icon.svelte'

  let { onOpenArtist, onOpenAlbum, onOpenPlaylist } = $props()

  let keyword = $state('')
  let loading = $state(false)
  let results = $state({ songs: [], artists: [], playlists: [] })
  let hotList = $state([])
  let hotSongs = $state([])
  let hotLoading = $state(true)
  let hotSongsLoading = $state(true)
  let activeCategory = $state('all')
  let requestId = 0
  let songActions = $state(null)

  $effect(() => {
    hotLoading = true
    hotSongsLoading = true
    musicService.getHotSearch().then(items => {
      hotList = items
    }).catch(() => {}).finally(() => { hotLoading = false })
    musicService.getTopSongs(12).then(songs => {
      hotSongs = songs
    }).catch(() => {}).finally(() => { hotSongsLoading = false })
  })

  async function doSearch() {
    const kw = keyword.trim()
    if (!kw) return
    const currentRequest = ++requestId
    loading = true
    activeCategory = 'all'
    results = { songs: [], artists: [], playlists: [] }
    try {
      const searchResults = await musicService.search(kw, { songLimit: 30, artistLimit: 16, playlistLimit: 16 })
      if (currentRequest !== requestId) return
      results = searchResults
    } catch {
      if (currentRequest === requestId) results = { songs: [], artists: [], playlists: [] }
    }
    if (currentRequest === requestId) loading = false
  }

  function playSong(track) {
    player.playTrack(track, 0)
  }

  function playAllSongs() {
    if (results.songs.length) player.playQueue(results.songs, 0)
  }

  function chooseHot(item) {
    keyword = item.keyword || ''
    doSearch()
  }

  const searchCategories = $derived([
    { key: 'all', label: '综合', count: results.songs.length + results.artists.length + results.playlists.length },
    { key: 'songs', label: '歌曲', count: results.songs.length },
    { key: 'artists', label: '歌手', count: results.artists.length },
    { key: 'playlists', label: '歌单', count: results.playlists.length },
  ])
</script>

<div class="search-page fade-in">
  <header class="search-header">
    <div>
      <span class="search-kicker">Search</span>
      <h1>搜索</h1>
      <p>查找歌曲、歌手和歌单。</p>
    </div>
  </header>

  <form class="search-toolbar" onsubmit={(e) => { e.preventDefault(); doSearch() }}>
    <label class="search-input-wrap" aria-label="搜索音乐">
      <Icon name="search" size={18} strokeWidth={1.8} />
      <input class="search-input" type="search" placeholder="歌曲、歌手、歌单" bind:value={keyword} />
        {#if keyword}
          <button type="button" class="search-clear" onclick={() => keyword = ''} aria-label="清空搜索">
            <Icon name="close" size={15} strokeWidth={2} />
          </button>
        {/if}
    </label>
    <button class="search-submit" type="submit" disabled={!keyword.trim() || loading}>
      {loading ? '搜索中' : '搜索'}
    </button>
  </form>

  {#if keyword.trim() !== '' && !loading}
    <nav class="search-category-tabs" aria-label="搜索结果分类">
      {#each searchCategories as category (category.key)}
        <button class:active={activeCategory === category.key} onclick={() => activeCategory = category.key}>
          <span>{category.label}</span>
          <em>{category.count}</em>
        </button>
      {/each}
    </nav>
  {/if}

  {#if loading}
    <div class="search-loading"><div class="search-spinner"></div></div>
  {:else if keyword.trim() === ''}
    <div class="search-empty-layout">
      <section class="search-chart-panel">
        <div class="search-section-header"><h2>热搜榜</h2><span>实时趋势</span></div>
        <div class="search-hot-list">
          {#if hotLoading}
            {#each Array(10) as _, i}
              <div class="search-hot-row search-chart-skeleton" class:top={i < 3} aria-hidden="true">
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong class="skeleton-line"></strong>
                <em class="skeleton-line tiny"></em>
              </div>
            {/each}
          {:else}
          {#each hotList.slice(0, 10) as item, i}
            <button class="search-hot-row" class:top={i < 3} onclick={() => chooseHot(item)}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <strong>{item.keyword}</strong>
              <em>{i < 3 ? '热门' : '趋势'}</em>
            </button>
          {/each}
          {/if}
        </div>
      </section>

      <section class="search-chart-panel search-song-chart-panel">
        <div class="search-section-header"><h2>热歌榜</h2><span>新歌热度</span></div>
        <div class="search-chart-songs">
          {#if hotSongsLoading}
            {#each Array(10) as _, i}
              <div class="search-chart-song-row search-chart-skeleton" aria-hidden="true">
                <span class="search-chart-rank">{String(i + 1).padStart(2, '0')}</span>
                <span class="search-song-info"><strong class="skeleton-line"></strong><em class="skeleton-line narrow"></em></span>
                <span class="search-song-dur skeleton-line tiny"></span>
              </div>
            {/each}
          {:else}
          {#each hotSongs.slice(0, 10) as track, i (track.id)}
            <button class="search-chart-song-row" onclick={() => playSong(track)}>
              <span class="search-chart-rank">{String(i + 1).padStart(2, '0')}</span>
              <span class="search-song-info"><strong>{track.name}</strong><em><ArtistNames artists={track.ar || track.artists || []} {onOpenArtist} /></em></span>
              <span class="search-song-dur">{formatDuration(track.dt)}</span>
            </button>
          {/each}
          {/if}
        </div>
      </section>
    </div>
  {:else if results.songs.length === 0 && results.artists.length === 0 && results.playlists.length === 0}
    <div class="search-empty">
      <Icon name="search" size={42} strokeWidth={1.2} />
      <p>未找到相关结果</p>
    </div>
  {:else}
    <div class="search-results-layout">
      {#if activeCategory === 'all'}
        {#if results.songs.length > 0}
          <section class="search-top-result">
            <div class="search-section-header"><h2>最佳匹配</h2><button onclick={() => activeCategory = 'songs'}>查看歌曲</button></div>
            <button class="search-feature-song" onclick={() => playSong(results.songs[0])}>
              {#if results.songs[0].picUrl}<img src={imageCoverUrl(results.songs[0].picUrl, 220)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="search-feature-cover search-cover-placeholder">♫</span>{/if}
              <span><small>歌曲</small><strong>{results.songs[0].name}</strong><em><ArtistNames artists={results.songs[0].ar || results.songs[0].artists || []} {onOpenArtist} /></em></span>
            </button>
          </section>
        {/if}

        {#if results.songs.length > 0}
          <section class="search-songs-panel">
            <div class="search-section-header"><h2>歌曲</h2><button onclick={playAllSongs}>播放全部</button></div>
            <div class="search-songs">
              {#each results.songs.slice(0, 8) as track (track.id)}
                <button class="search-song-row" class:active={player.id === track.id} onclick={() => playSong(track)} {...songActions?.bindRow(track)}>
                  {#if track.picUrl}<img class="search-song-cover" src={imageCoverUrl(track.picUrl, 80)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<div class="search-song-cover search-cover-placeholder">♫</div>{/if}
                  <span class="search-song-info"><strong>{track.name}</strong><em><ArtistNames artists={track.ar || track.artists || []} {onOpenArtist} />{#if track.al?.name} · {track.al.name}{/if}</em></span>
                  <span class="search-song-dur">{formatDuration(track.dt)}</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if results.artists.length > 0}
          <section class="search-side-card">
            <div class="search-section-header"><h2>歌手</h2><button onclick={() => activeCategory = 'artists'}>查看全部</button></div>
            <div class="search-compact-list search-result-grid">
              {#each results.artists.slice(0, 8) as artist (artist.id)}
                <button onclick={() => onOpenArtist?.(artist.id)}>
                  {#if artist.picUrl}<img src={imageCoverUrl(artist.picUrl, 120)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="search-avatar-ph">{artist.name?.charAt(0) || '?'}</span>{/if}
                  <span><strong>{artist.name}</strong><em>{artist.musicSize || 0} 首歌曲</em></span>
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if results.playlists.length > 0}
          <section class="search-side-card">
            <div class="search-section-header"><h2>歌单</h2><button onclick={() => activeCategory = 'playlists'}>查看全部</button></div>
            <div class="search-playlist-grid">
              {#each results.playlists.slice(0, 8) as pl (pl.id)}
                <button onclick={() => onOpenPlaylist?.(pl.id, true, pl)}>
                  {#if pl.picUrl}<img src={imageCoverUrl(pl.picUrl, 180)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="search-cover-placeholder">♫</span>{/if}
                  <strong>{pl.name}</strong>
                  <em>{pl.creator || '歌单'} · {pl.trackCount} 首</em>
                </button>
              {/each}
            </div>
          </section>
        {/if}
      {:else if activeCategory === 'songs'}
        <section class="search-songs-panel">
          <div class="search-section-header"><h2>歌曲</h2><button onclick={playAllSongs}>播放全部</button></div>
          <div class="search-songs">
            {#each results.songs as track (track.id)}
              <button class="search-song-row" class:active={player.id === track.id} onclick={() => playSong(track)} {...songActions?.bindRow(track)}>
                {#if track.picUrl}<img class="search-song-cover" src={imageCoverUrl(track.picUrl, 80)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<div class="search-song-cover search-cover-placeholder">♫</div>{/if}
                <span class="search-song-info"><strong>{track.name}</strong><em><ArtistNames artists={track.ar || track.artists || []} {onOpenArtist} />{#if track.al?.name} · {track.al.name}{/if}</em></span>
                <span class="search-song-dur">{formatDuration(track.dt)}</span>
              </button>
            {/each}
          </div>
        </section>
      {:else if activeCategory === 'artists'}
        <section class="search-side-card">
          <div class="search-section-header"><h2>歌手</h2><span>{results.artists.length}</span></div>
          <div class="search-compact-list search-result-grid">
            {#each results.artists as artist (artist.id)}
              <button onclick={() => onOpenArtist?.(artist.id)}>
                {#if artist.picUrl}<img src={imageCoverUrl(artist.picUrl, 120)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="search-avatar-ph">{artist.name?.charAt(0) || '?'}</span>{/if}
                <span><strong>{artist.name}</strong><em>{artist.musicSize || 0} 首歌曲</em></span>
              </button>
            {/each}
          </div>
        </section>
      {:else if activeCategory === 'playlists'}
        <section class="search-side-card">
          <div class="search-section-header"><h2>歌单</h2><span>{results.playlists.length}</span></div>
          <div class="search-playlist-grid">
            {#each results.playlists as pl (pl.id)}
              <button onclick={() => onOpenPlaylist?.(pl.id, true, pl)}>
                {#if pl.picUrl}<img src={imageCoverUrl(pl.picUrl, 180)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="search-cover-placeholder">♫</span>{/if}
                <strong>{pl.name}</strong>
                <em>{pl.creator || '歌单'} · {pl.trackCount} 首</em>
              </button>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
  <SongListActions onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum} onBindRow={(fn) => { songActions = { bindRow: fn } }} />
</div>

<style>
  .search-page { display: grid; gap: 18px; }
  .search-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
  .search-kicker { display: block; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; margin-bottom: 6px; }
  .search-header h1 { margin: 0 0 5px; font-size: 36px; line-height: 1.08; letter-spacing: 0; }
  .search-header p { color: var(--text-tertiary); font-size: 13px; }
  .search-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--bg-elevated) 76%, transparent); }
  .search-input-wrap { min-width: 0; height: 42px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-layer); color: var(--text-tertiary); }
  .search-input-wrap:focus-within { border-color: var(--accent); color: var(--accent); }
  .search-input { flex: 1; min-width: 0; border: none; background: none; outline: none; font-size: 15px; color: var(--text); }
  .search-input::placeholder { color: var(--text-tertiary); }
  .search-clear, .search-submit { border: none; cursor: pointer; }
  .search-clear { flex-shrink: 0; color: var(--text-tertiary); width: 28px; height: 28px; border-radius: var(--radius-sm); display: grid; place-items: center; background: transparent; }
  .search-clear:hover { background: var(--bg-hover); }
  .search-submit { height: 42px; min-width: 78px; padding: 0 18px; border-radius: var(--radius-md); background: var(--accent); color: white; font-size: 13px; font-weight: 700; white-space: nowrap; }
  .search-submit:disabled { opacity: .48; cursor: default; }
  .search-loading { display: flex; justify-content: center; padding: 72px 0; }
  .search-spinner { width: 30px; height: 30px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  .search-category-tabs { display: inline-flex; align-items: center; gap: 6px; width: fit-content; max-width: 100%; padding: 5px; border: 1px solid var(--border); border-radius: var(--radius-md); background: color-mix(in srgb, var(--bg-elevated) 76%, transparent); overflow-x: auto; }
  .search-category-tabs button { display: inline-flex; align-items: center; gap: 8px; min-height: 34px; padding: 0 12px; border: none; border-radius: var(--radius-md); background: transparent; color: var(--text-secondary); font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer; }
  .search-category-tabs button:hover { background: var(--bg-hover); color: var(--text); }
  .search-category-tabs button.active { background: var(--accent-bg); color: var(--accent); }
  .search-category-tabs em { color: inherit; font-size: 11px; font-style: normal; opacity: 0.72; }
  .search-empty-layout { display: grid; grid-template-columns: minmax(280px, 0.82fr) minmax(0, 1.18fr); gap: 18px; align-items: start; }
  .search-results-layout { display: grid; gap: 18px; align-items: start; }
  .search-chart-panel, .search-top-result, .search-songs-panel, .search-side-card { border: 1px solid var(--border); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--bg-elevated) 76%, transparent); padding: 16px; }
  .search-section-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  .search-section-header h2 { font-size: 18px; font-weight: 700; letter-spacing: 0; }
  .search-section-header span, .search-section-header button { color: var(--text-tertiary); font-size: 12px; font-weight: 700; }
  .search-section-header button { color: var(--accent); border: none; background: transparent; cursor: pointer; }
  .search-hot-list, .search-songs, .search-compact-list { display: grid; gap: 5px; }
  .search-hot-row, .search-song-row, .search-compact-list button { display: grid; align-items: center; width: 100%; border: none; background: transparent; color: var(--text); cursor: pointer; text-align: left; border-radius: var(--radius-md); }
  .search-hot-row { grid-template-columns: 44px minmax(0, 1fr) 58px; min-height: 44px; padding: 0 12px; }
  .search-hot-row:hover, .search-song-row:hover, .search-compact-list button:hover { background: var(--bg-hover); }
  .search-hot-row.top { background: color-mix(in srgb, var(--accent-bg) 72%, transparent); }
  .search-hot-row.top span { color: var(--accent); }
  .search-hot-row span { color: var(--text-tertiary); font-weight: 700; }
  .search-hot-row strong, .search-song-info strong, .search-compact-list strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-hot-row em { justify-self: end; color: var(--text-tertiary); font-size: 11px; font-style: normal; }
  .search-chart-songs { display: grid; gap: 5px; }
  .search-chart-song-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) 58px; gap: 12px; align-items: center; min-height: 44px; width: 100%; padding: 0 12px; border: none; border-radius: var(--radius-md); background: transparent; color: var(--text); text-align: left; cursor: pointer; }
  .search-chart-song-row:hover { background: var(--bg-hover); }
  .search-chart-skeleton { cursor: default; pointer-events: none; }
  .search-chart-skeleton .skeleton-line { display: block; width: 100%; height: 12px; border-radius: 999px; background: linear-gradient(90deg, color-mix(in srgb, var(--bg-hover) 70%, transparent), color-mix(in srgb, var(--border) 72%, transparent), color-mix(in srgb, var(--bg-hover) 70%, transparent)); background-size: 220% 100%; animation: searchSkeleton 1.15s ease-in-out infinite; }
  .search-chart-skeleton .skeleton-line.narrow { width: 48%; height: 10px; margin-top: 6px; }
  .search-chart-skeleton .skeleton-line.tiny { width: 38px; height: 10px; }
  @keyframes searchSkeleton { 0% { background-position: 100% 0; } 100% { background-position: -120% 0; } }
  .search-chart-rank { color: var(--text-tertiary); font-size: 13px; font-weight: 700; text-align: center; }
  .search-chart-song-row:nth-child(-n + 3) .search-chart-rank { color: var(--accent); }
  .search-feature-song { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 15px; align-items: end; width: 100%; text-align: left; color: var(--text); cursor: pointer; border: none; background: transparent; }
  .search-feature-song img, .search-feature-cover { width: 96px; height: 96px; object-fit: cover; border-radius: var(--radius-md); box-shadow: var(--shadow-md); }
  .search-feature-song span, .search-song-info, .search-compact-list span { min-width: 0; display: grid; }
  .search-feature-song small { color: var(--accent); font-size: 12px; font-weight: 700; }
  .search-feature-song strong { font-size: 22px; line-height: 1.14; letter-spacing: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-feature-song em, .search-song-info em, .search-compact-list em, .search-playlist-grid em { color: var(--text-tertiary); font-size: 12px; font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .search-song-row { grid-template-columns: 48px minmax(0, 1fr) 48px; gap: 12px; min-height: 60px; padding: 6px 8px; }
  .search-song-row.active { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .search-song-cover { width: 48px; height: 48px; border-radius: var(--radius-sm); object-fit: cover; }
  .search-cover-placeholder, .search-avatar-ph { display: grid; place-items: center; background: var(--bg-surface); color: var(--text-tertiary); }
  .search-song-dur { color: var(--text-tertiary); font-size: 12px; justify-self: end; }
  .search-compact-list button { grid-template-columns: 48px minmax(0, 1fr); gap: 12px; min-height: 60px; padding: 6px; }
  .search-compact-list img, .search-avatar-ph { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
  .search-result-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .search-playlist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .search-playlist-grid button { min-width: 0; text-align: left; cursor: pointer; color: var(--text); border: none; background: transparent; }
  .search-playlist-grid img, .search-playlist-grid .search-cover-placeholder { width: 100%; aspect-ratio: 1; border-radius: var(--radius-md); object-fit: cover; margin-bottom: 8px; }
  .search-playlist-grid strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .search-empty { display: grid; place-items: center; gap: 10px; min-height: 280px; color: var(--text-tertiary); border: 1px dashed var(--border-strong); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--bg-elevated) 58%, transparent); }
  @media (max-width: 980px) { .search-empty-layout { grid-template-columns: 1fr; } }
  @media (max-width: 560px) {
    .search-page { gap: 14px; }
    .search-header h1 { font-size: 30px; }
    .search-toolbar { position: sticky; top: 0; z-index: 12; grid-template-columns: minmax(0, 1fr) auto; padding: 8px; margin: 0 -2px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--bg) 86%, transparent); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
    .search-input-wrap { height: 40px; gap: 8px; padding: 0 10px; border-radius: var(--radius-md); }
    .search-input { font-size: 15px; }
    .search-submit { min-width: 60px; height: 40px; padding: 0 12px; }
    .search-category-tabs { width: 100%; background: color-mix(in srgb, var(--bg-elevated) 86%, transparent); }
    .search-chart-panel, .search-top-result, .search-songs-panel, .search-side-card { padding: 12px; border-radius: var(--radius-md); }
    .search-empty-layout { gap: 12px; }
    .search-song-chart-panel { padding-bottom: 10px; }
    .search-section-header { margin-bottom: 10px; }
    .search-section-header h2 { font-size: 16px; }
    .search-section-header span, .search-section-header button { font-size: 11px; }
    .search-chart-songs, .search-hot-list, .search-songs, .search-compact-list { gap: 3px; }
    .search-hot-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .search-hot-row { grid-template-columns: 26px minmax(0, 1fr); min-height: 36px; padding: 0 8px; background: color-mix(in srgb, var(--bg-surface) 58%, transparent); }
    .search-hot-row em { display: none; }
    .search-chart-song-row { grid-template-columns: 30px minmax(0, 1fr); gap: 8px; min-height: 40px; padding: 0 8px; }
    .search-chart-rank { font-size: 12px; }
    .search-chart-song-row .search-song-dur { display: none; }
    .search-feature-song { grid-template-columns: 72px minmax(0, 1fr); gap: 12px; }
    .search-feature-song img, .search-feature-cover { width: 72px; height: 72px; border-radius: var(--radius-md); }
    .search-feature-song strong { font-size: 18px; }
    .search-song-row { grid-template-columns: 42px minmax(0, 1fr); min-height: 54px; }
    .search-song-cover { width: 42px; height: 42px; }
    .search-song-dur { display: none; }
    .search-playlist-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 10px; }
    .search-playlist-grid img, .search-playlist-grid .search-cover-placeholder { border-radius: var(--radius-md); }
  }
</style>
