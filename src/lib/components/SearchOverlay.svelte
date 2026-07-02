<script>
  import { tick } from 'svelte'
  import { ncm } from '../api/client.js'
  import { player } from '../stores/player.svelte.js'
  import { coverUrl } from '../utils/image.js'
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
  let activeType = $state('songs')
  let error = $state('')
  let inputEl = $state(null)
  let requestId = 0
  let _debounceTimer = null

  const categories = $derived([
    { id: 'songs', label: '歌曲', count: results.songs.length },
    { id: 'artists', label: '歌手', count: results.artists.length },
    { id: 'playlists', label: '歌单', count: results.playlists.length },
  ])

  let activeItems = $derived(results[activeType] || [])

  function withTimeout(promise, fallback, timeout = 4500) {
    return Promise.race([
      promise.catch(() => fallback),
      new Promise(resolve => setTimeout(() => resolve(fallback), timeout)),
    ])
  }

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
    if (_debounceTimer) clearTimeout(_debounceTimer)
    _debounceTimer = setTimeout(() => doSearch(), 250)
  }

  async function doSearch() {
    const query = keyword.trim()
    if (!query) { results = { songs: [], artists: [], playlists: [] }; return }
    const currentRequest = ++requestId
    loading = true
    error = ''
    results = { songs: [], artists: [], playlists: [] }
    try {
      const [songRes, artistRes, playlistRes] = await Promise.all([
        withTimeout(ncm.searchSongs(query, 16), { result: {} }),
        withTimeout(ncm.searchArtists(query, 10), { result: {} }),
        withTimeout(ncm.searchPlaylists(query, 10), { result: {} }),
      ])
      if (currentRequest !== requestId) return
      const songs = songRes?.result?.songs || []
      const detailRes = songs.length ? await withTimeout(ncm.songDetail(songs.map(song => song.id)), { songs: [] }, 3500) : { songs: [] }
      if (currentRequest !== requestId) return
      const detailMap = new Map((detailRes?.songs || []).map(song => [song.id, song]))
      results = {
        songs: songs.map(song => {
        const detail = detailMap.get(song.id) || {}
        const album = detail.al || song.album || song.al || {}
        const picUrl = album.picUrl || album.imgUrl || song.album?.picUrl || song.al?.picUrl || ''
        return { ...detail, id: song.id, name: song.name, ar: detail.ar || song.artists || song.ar || [], al: album, dt: detail.dt || song.duration || song.dt || 0, picUrl }
        }),
        artists: (artistRes?.result?.artists || []).map(artist => ({
          id: artist.id,
          name: artist.name,
          picUrl: artist.picUrl || artist.img1v1Url || artist.img1Url || '',
          musicSize: artist.musicSize || 0,
          albumSize: artist.albumSize || 0,
        })),
        playlists: (playlistRes?.result?.playlists || []).map(playlist => ({
          id: playlist.id,
          name: playlist.name,
          picUrl: playlist.coverImgUrl || playlist.picUrl || '',
          trackCount: playlist.trackCount || 0,
          creator: playlist.creator?.nickname || '',
        })),
      }
      activeType = results.songs.length ? 'songs' : results.artists.length ? 'artists' : results.playlists.length ? 'playlists' : 'songs'
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

{#if show}
  <div class="search-overlay" role="dialog" aria-modal="true" aria-label="搜索音乐">
    <button class="search-overlay__scrim" type="button" aria-label="关闭搜索" onclick={onClose}></button>
    <section class="search-overlay__panel">
      <div class="search-overlay__titlebar">
        <div>
          <span>Search</span>
          <strong>快速搜索</strong>
        </div>
        <button type="button" class="search-overlay__close" aria-label="关闭搜索" onclick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div class="search-overlay__head">
        <label class="search-overlay__input-wrap" aria-label="搜索音乐">
          <Icon name="search" size={18} />
          <input bind:this={inputEl} bind:value={keyword} oninput={handleInput} onkeydown={handleKeydown} placeholder="搜索歌曲" />
          {#if keyword}
            <button type="button" class="search-overlay__clear" aria-label="清空搜索" onclick={() => { keyword = ''; results = { songs: [], artists: [], playlists: [] }; error = '' }}>
              <Icon name="close" size={15} />
            </button>
          {/if}
        </label>
        <button type="button" class="search-overlay__submit" onclick={doSearch} disabled={loading || !keyword.trim()}>
          {loading ? '搜索中' : '搜索'}
        </button>
      </div>

      <div class="search-overlay__body">
        {#if loading}
          <div class="search-overlay__state"><Spinner size="sm" /> 搜索中...</div>
        {:else if error}
          <div class="search-overlay__state">{error}</div>
        {:else if keyword.trim() && categories.every(category => category.count === 0)}
          <div class="search-overlay__state">没有找到相关结果</div>
        {:else if categories.some(category => category.count > 0)}
          <nav class="search-overlay__tabs" aria-label="搜索结果分类">
            {#each categories as category (category.id)}
              <button type="button" class:active={activeType === category.id} disabled={category.count === 0} onclick={() => activeType = category.id}>
                <span>{category.label}</span>
                <em>{category.count}</em>
              </button>
            {/each}
          </nav>

          <div class="search-overlay__results">
            {#if activeType === 'songs'}
              {#each activeItems as track (track.id)}
                <button type="button" class="search-overlay__row" class:active={player.id === track.id} onclick={() => playTrack(track)}>
                  {#if track.picUrl}
                    <img src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                  {:else}
                    <span class="search-overlay__cover-ph">♫</span>
                  {/if}
                  <span class="search-overlay__copy">
                    <strong>{track.name}</strong>
                    <em><ArtistNames artists={track.ar || track.artists || []} {onOpenArtist} />{#if track.al?.name} · {track.al.name}{/if}</em>
                  </span>
                </button>
              {/each}
            {:else if activeType === 'artists'}
              {#each activeItems as artist (artist.id)}
                <button type="button" class="search-overlay__row" onclick={() => openArtist(artist)}>
                  {#if artist.picUrl}
                    <img class="search-overlay__avatar" src={coverUrl(artist.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                  {:else}
                    <span class="search-overlay__avatar search-overlay__cover-ph">{artist.name?.charAt(0) || '?'}</span>
                  {/if}
                  <span class="search-overlay__copy">
                    <strong>{artist.name}</strong>
                    <em>{artist.musicSize || 0} 首歌曲 · {artist.albumSize || 0} 张专辑</em>
                  </span>
                </button>
              {/each}
            {:else}
              {#each activeItems as playlist (playlist.id)}
                <button type="button" class="search-overlay__row" onclick={() => openPlaylist(playlist)}>
                  {#if playlist.picUrl}
                    <img src={coverUrl(playlist.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                  {:else}
                    <span class="search-overlay__cover-ph">♫</span>
                  {/if}
                  <span class="search-overlay__copy">
                    <strong>{playlist.name}</strong>
                    <em>{playlist.creator || '歌单'} · {playlist.trackCount || 0} 首</em>
                  </span>
                </button>
              {/each}
            {/if}
          </div>
        {:else}
          <div class="search-overlay__state">输入关键词搜索歌曲</div>
        {/if}
      </div>
    </section>
  </div>
{/if}
