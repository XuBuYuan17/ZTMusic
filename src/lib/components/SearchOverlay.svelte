<script>
  import { tick } from 'svelte'
  import { musicService } from '../music/service.js'
  import { player } from '../stores/player.svelte.js'
  import { coverUrl } from '../utils/image.js'
  import { formatDuration } from '../format.js'
  import ArtistNames from './ArtistNames.svelte'
  import Spinner from './Spinner.svelte'
  import Icon from './ui/Icon.svelte'

  let {
    show = false,
    onClose,
    onOpenArtist,
    onOpenAlbum,
    onOpenPlaylist,
  } = $props()

  let keyword = $state('')
  let loading = $state(false)
  let results = $state({ songs: [], artists: [], playlists: [] })
  let activeType = $state('all')
  let error = $state('')
  let inputEl = $state(null)
  let requestId = 0
  let _debounceTimer = null

  // ---- 定时器管理器 ----
  const timers = new Set()
  function safeTimeout(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  let total = $derived(results.songs.length + results.artists.length + results.playlists.length)

  const categories = $derived([
    { id: 'all', label: '综合', count: total },
    { id: 'songs', label: '歌曲', count: results.songs.length },
    { id: 'artists', label: '歌手', count: results.artists.length },
    { id: 'playlists', label: '歌单', count: results.playlists.length },
  ])

  /** 最佳匹配：Apple Music 的「Top Result」——取第一首歌 */
  let topResult = $derived(results.songs[0] || null)

  function withTimeout(promise, fallback, timeout = 4500) {
    return Promise.race([
      promise.catch(() => fallback),
      new Promise(resolve => safeTimeout(() => resolve(fallback), timeout)),
    ])
  }

  $effect(() => {
    if (show) {
      tick().then(() => inputEl?.focus())
    } else {
      timers.forEach(id => clearTimeout(id))
    }
    return () => timers.forEach(id => clearTimeout(id))
  })

  $effect(() => {
    if (show) {
      tick().then(() => inputEl?.focus())
    } else {
      // 关闭时清理防抖和结果
      if (_debounceTimer) clearTimeout(_debounceTimer)
      keyword = ''
      results = { songs: [], artists: [], playlists: [] }
      error = ''
    }
  })

  function handleInput() {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer)
      timers.delete(_debounceTimer)
    }
    _debounceTimer = safeTimeout(() => doSearch(), 250)
  }

  async function doSearch() {
    const query = keyword.trim()
    if (!query) { results = { songs: [], artists: [], playlists: [] }; return }
    const currentRequest = ++requestId
    loading = true
    error = ''
    results = { songs: [], artists: [], playlists: [] }
    try {
      const searchResults = await withTimeout(
        musicService.search(query, { songLimit: 20, artistLimit: 12, playlistLimit: 12 }),
        { songs: [], artists: [], playlists: [] },
      )
      if (currentRequest !== requestId) return
      results = searchResults
      activeType = 'all'
    } catch (err) {
      if (currentRequest === requestId) error = err?.message || '搜索失败'
    } finally {
      if (currentRequest === requestId) loading = false
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Enter') {
      if (_debounceTimer) clearTimeout(_debounceTimer)
      doSearch()
    }
    if (event.key === 'Escape') onClose?.()
  }

  function playTrack(track) {
    player.playTrack(track, 0)
    onClose?.()
  }

  function openArtist(artist) {
    if (!artist?.id) return
    onOpenArtist?.(artist.id)
    onClose?.()
  }

  function openPlaylist(playlist) {
    if (!playlist?.id) return
    onOpenPlaylist?.(playlist.id, true, playlist)
    onClose?.()
  }
</script>

{#snippet songRow(track)}
  <button type="button" class="so-row" class:active={player.id === track.id} onclick={() => playTrack(track)}>
    {#if track.picUrl}
      <img class="so-art" src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
    {:else}
      <span class="so-art so-art--ph">♫</span>
    {/if}
    <span class="so-copy">
      <strong>{track.name}</strong>
      <em><ArtistNames artists={track.ar || []} {onOpenArtist} />{#if track.al?.name} · {track.al.name}{/if}</em>
    </span>
    {#if track.dt}<span class="so-dur">{formatDuration(track.dt)}</span>{/if}
  </button>
{/snippet}

{#snippet artistRow(artist)}
  <button type="button" class="so-row" onclick={() => openArtist(artist)}>
    {#if artist.picUrl}
      <img class="so-art so-art--round" src={coverUrl(artist.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
    {:else}
      <span class="so-art so-art--round so-art--ph">{artist.name?.charAt(0) || '?'}</span>
    {/if}
    <span class="so-copy">
      <strong>{artist.name}</strong>
      <em>歌手 · {artist.musicSize || 0} 首歌曲</em>
    </span>
  </button>
{/snippet}

{#snippet playlistRow(playlist)}
  <button type="button" class="so-row" onclick={() => openPlaylist(playlist)}>
    {#if playlist.picUrl}
      <img class="so-art" src={coverUrl(playlist.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
    {:else}
      <span class="so-art so-art--ph">♫</span>
    {/if}
    <span class="so-copy">
      <strong>{playlist.name}</strong>
      <em>歌单 · {playlist.creator || '未知'} · {playlist.trackCount || 0} 首</em>
    </span>
  </button>
{/snippet}

{#if show}
  <div class="search-overlay" role="dialog" aria-modal="true" aria-label="搜索音乐">
    <button class="search-overlay__scrim" type="button" aria-label="关闭搜索" onclick={onClose}></button>
    <section class="search-overlay__panel">
      <div class="so-head">
        <label class="so-field" aria-label="搜索音乐">
          <Icon name="search" size={18} />
          <input bind:this={inputEl} bind:value={keyword} oninput={handleInput} onkeydown={handleKeydown} placeholder="歌曲、歌手、歌单" />
          {#if keyword}
            <button type="button" class="so-clear" aria-label="清空搜索" onclick={() => { keyword = ''; results = { songs: [], artists: [], playlists: [] }; error = '' }}>
              <Icon name="close" size={15} />
            </button>
          {/if}
        </label>
        <button type="button" class="so-cancel" onclick={onClose}>取消</button>
      </div>

      {#if total > 0 && !loading}
        <nav class="so-tabs" aria-label="搜索结果分类">
          {#each categories as category (category.id)}
            <button type="button" class:active={activeType === category.id} disabled={category.count === 0} onclick={() => activeType = category.id}>
              {category.label}
            </button>
          {/each}
        </nav>
      {/if}

      <div class="search-overlay__body">
        {#if loading}
          <div class="so-state"><Spinner size="sm" /> 搜索中…</div>
        {:else if error}
          <div class="so-state">{error}</div>
        {:else if keyword.trim() && total === 0}
          <div class="so-state">没有找到「{keyword.trim()}」的相关结果</div>
        {:else if total > 0}
          {#if activeType === 'all'}
            {#if topResult}
              <section class="so-section">
                <h3>最佳匹配</h3>
                <button type="button" class="so-top" onclick={() => playTrack(topResult)}>
                  {#if topResult.picUrl}
                    <img src={coverUrl(topResult.picUrl, 240)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                  {:else}
                    <span class="so-top__ph">♫</span>
                  {/if}
                  <span class="so-top__copy">
                    <small>歌曲</small>
                    <strong>{topResult.name}</strong>
                    <em><ArtistNames artists={topResult.ar || []} {onOpenArtist} /></em>
                  </span>
                </button>
              </section>
            {/if}

            {#if results.songs.length > 1}
              <section class="so-section">
                <h3>歌曲</h3>
                <div class="so-list">
                  {#each results.songs.slice(1, 6) as track (track.id)}{@render songRow(track)}{/each}
                </div>
                {#if results.songs.length > 6}
                  <button type="button" class="so-more" onclick={() => activeType = 'songs'}>查看全部 {results.songs.length} 首歌曲</button>
                {/if}
              </section>
            {/if}

            {#if results.artists.length}
              <section class="so-section">
                <h3>歌手</h3>
                <div class="so-list">
                  {#each results.artists.slice(0, 4) as artist (artist.id)}{@render artistRow(artist)}{/each}
                </div>
                {#if results.artists.length > 4}
                  <button type="button" class="so-more" onclick={() => activeType = 'artists'}>查看全部 {results.artists.length} 位歌手</button>
                {/if}
              </section>
            {/if}

            {#if results.playlists.length}
              <section class="so-section">
                <h3>歌单</h3>
                <div class="so-list">
                  {#each results.playlists.slice(0, 4) as playlist (playlist.id)}{@render playlistRow(playlist)}{/each}
                </div>
                {#if results.playlists.length > 4}
                  <button type="button" class="so-more" onclick={() => activeType = 'playlists'}>查看全部 {results.playlists.length} 个歌单</button>
                {/if}
              </section>
            {/if}
          {:else if activeType === 'songs'}
            <div class="so-list">
              {#each results.songs as track (track.id)}{@render songRow(track)}{/each}
            </div>
          {:else if activeType === 'artists'}
            <div class="so-list">
              {#each results.artists as artist (artist.id)}{@render artistRow(artist)}{/each}
            </div>
          {:else}
            <div class="so-list">
              {#each results.playlists as playlist (playlist.id)}{@render playlistRow(playlist)}{/each}
            </div>
          {/if}
        {:else}
          <div class="so-state">输入关键词搜索歌曲、歌手或歌单</div>
        {/if}
      </div>
    </section>
  </div>
{/if}
