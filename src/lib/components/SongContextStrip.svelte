<script>
  import { player } from '../stores/player.svelte.js'
  import { ncm } from '../api/client.js'
  import { coverUrl } from '../utils/image.js'
  import ArtistNames from './ArtistNames.svelte'

  let { variant = 'desktop', onOpenArtist, onClose } = $props()

  let loading = $state(false)
  let songComments = $state([])
  let similarSongs = $state([])
  let similarPlaylists = $state([])

  let showContextStrip = $state(false)
  let contextPanel = $state(null)
  let selectedSimilarPlaylist = $state(null)
  let selectedPlaylistTracks = $state([])
  let selectedPlaylistLoading = $state(false)

  const hasExtras = $derived(loading || similarSongs.length > 0 || similarPlaylists.length > 0 || songComments.length > 0)

  function normalizeTrack(track) {
    if (!track) return null
    return {
      ...track,
      id: track.id,
      name: track.name,
      ar: track.ar || track.artists || [],
      al: track.al || track.album || {},
      dt: track.dt || track.duration || 0,
      picUrl: track.al?.picUrl || track.album?.picUrl || track.picUrl || track.coverImgUrl || '',
    }
  }

  async function fetchExtras() {
    if (!player.id) return
    loading = true
    try {
      const [cr, sr, pr] = await Promise.all([
        ncm.commentMusic(player.id, 8).catch(() => ({ hotComments: [], comments: [] })),
        ncm.simiSong(player.id).catch(() => ({ songs: [] })),
        ncm.simiPlaylist(player.id).catch(() => ({ playlists: [] })),
      ])
      songComments = (cr?.hotComments?.length ? cr.hotComments : cr?.comments || []).slice(0, 6)
      similarSongs = (sr?.songs || []).map(normalizeTrack).filter(Boolean).slice(0, 6)
      similarPlaylists = (pr?.playlists || []).slice(0, 6)
    } catch {
      songComments = []
      similarSongs = []
      similarPlaylists = []
    }
    loading = false
  }

  function playSimilarSong(track) {
    const idx = similarSongs.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(similarSongs, idx)
    else player.playTrack(track, 0)
  }

  async function loadSimilarPlaylist(pl) {
    if (!pl?.id) return
    selectedSimilarPlaylist = pl
    selectedPlaylistTracks = []
    selectedPlaylistLoading = true
    try {
      const res = await ncm.playlistTracks(pl.id, 20)
      const tracks = res?.songs || res?.playlist?.tracks || []
      selectedPlaylistTracks = tracks.map(normalizeTrack).filter(Boolean)
    } catch {
      selectedPlaylistTracks = []
    }
    selectedPlaylistLoading = false
  }

  function playSelectedPlaylistTrack(track) {
    const idx = selectedPlaylistTracks.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(selectedPlaylistTracks, idx)
    else player.playTrack(track, 0)
  }

  function openArtist(id) {
    if (!id) return
    onOpenArtist?.(id)
    onClose?.()
  }

  function toggleContextStrip() {
    showContextStrip = !showContextStrip
    if (!showContextStrip) closeContextPanel()
  }

  function closeContextStrip() {
    showContextStrip = false
    closeContextPanel()
  }

  function closeContextPanel() {
    contextPanel = null
    selectedSimilarPlaylist = null
    selectedPlaylistTracks = []
    selectedPlaylistLoading = false
  }

  function openContextPanel(type) {
    contextPanel = contextPanel === type ? null : type
    if (type !== 'playlists') {
      selectedSimilarPlaylist = null
      selectedPlaylistTracks = []
    }
  }

  function contextPanelTitle() {
    if (contextPanel === 'songs') return '相似歌曲'
    if (contextPanel === 'playlists') return '相似歌单'
    if (contextPanel === 'comments') return '热评'
    return '相关内容'
  }

  // Fetch when track changes while the player is open
  $effect(() => {
    const id = player.id
    if (!id) {
      songComments = []
      similarSongs = []
      similarPlaylists = []
      closeContextPanel()
      return
    }
    fetchExtras()
  })
</script>

{#if hasExtras}
  {#if variant === 'desktop'}
    <button class="ly-context-toggle" class:open={showContextStrip} onclick={toggleContextStrip} aria-label="相关内容">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.22.65.22 1h.29a2 2 0 0 1 0 4h-.29c0 .35-.08.69-.22 1Z"/></svg>
    </button>
  {/if}

  {#if variant === 'mobile' || showContextStrip}
    {#if variant === 'desktop'}
      <button class="ly-context-scrim" aria-label="隐藏相关内容" onclick={closeContextStrip}></button>
    {/if}

    <div class="ly-context-strip" class:ly-context-strip--mobile={variant === 'mobile'}>
      {#if loading}<div class="ly-context-card ly-context-loading">加载相关内容…</div>{/if}
      {#each similarSongs.slice(0, 1) as track (track.id)}
        <button class="ly-context-card ly-context-song" class:active={contextPanel === 'songs'} onclick={() => openContextPanel('songs')}>
          {#if track.picUrl}<img src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}
          <span class="ly-context-copy"><small>相似歌曲</small><strong>{track.name}</strong><em><ArtistNames artists={track.ar || []} onOpenArtist={openArtist}/></em></span>
        </button>
      {/each}
      {#if similarPlaylists.length > 0}
        <button class="ly-context-card ly-context-playlists" class:active={contextPanel === 'playlists'} onclick={() => openContextPanel('playlists')}>
          <span class="ly-context-cover-stack">{#each similarPlaylists.slice(0, 3) as pl (pl.id)}{#if pl.coverImgUrl}<img src={coverUrl(pl.coverImgUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{/if}{/each}</span>
          <span class="ly-context-copy"><small>相似歌单</small><strong>{similarPlaylists[0]?.name}</strong><em>{similarPlaylists.length} 个灵感歌单</em></span>
        </button>
      {/if}
      {#each songComments.slice(0, 1) as c, i (c.commentId || i)}
        <button class="ly-context-card ly-context-comment" class:active={contextPanel === 'comments'} onclick={() => openContextPanel('comments')}>
          <span class="ly-context-copy"><small>热评 · {c.user?.nickname || '听众'}</small><strong>{c.content}</strong></span>
        </button>
      {/each}
    </div>

    {#if contextPanel}
      <section class="ly-context-detail">
        <div class="ly-context-detail-head"><span>{contextPanelTitle()}</span><button onclick={closeContextPanel} aria-label="关闭">×</button></div>
        {#if contextPanel === 'songs'}
          <div class="ly-context-detail-list">
            {#each similarSongs as track (track.id)}
              <button class="ly-context-detail-row" onclick={() => playSimilarSong(track)}>
                {#if track.picUrl}<img src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}
                <span><strong>{track.name}</strong><em><ArtistNames artists={track.ar || []} onOpenArtist={openArtist}/></em></span>
              </button>
            {/each}
          </div>
        {:else if contextPanel === 'playlists'}
          {#if selectedSimilarPlaylist}
            <div class="ly-context-subhead"><button onclick={() => { selectedSimilarPlaylist = null; selectedPlaylistTracks = [] }}>‹ 歌单</button><span>{selectedSimilarPlaylist.name}</span></div>
            {#if selectedPlaylistLoading}<div class="ly-context-empty">加载歌单歌曲…</div>
            {:else if selectedPlaylistTracks.length > 0}<div class="ly-context-detail-list">
              {#each selectedPlaylistTracks as track (track.id)}
                <button class="ly-context-detail-row" onclick={() => playSelectedPlaylistTrack(track)}>
                  {#if track.picUrl}<img src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}
                  <span><strong>{track.name}</strong><em><ArtistNames artists={track.ar || []} onOpenArtist={openArtist}/></em></span>
                </button>
              {/each}
            </div>
            {:else}<div class="ly-context-empty">这个歌单暂时没有可预览的歌曲</div>{/if}
          {:else}<div class="ly-context-detail-grid">
            {#each similarPlaylists as pl (pl.id)}
              <button class="ly-context-detail-playlist" onclick={() => loadSimilarPlaylist(pl)}>
                {#if pl.coverImgUrl}<img src={coverUrl(pl.coverImgUrl, 180)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}
                <strong>{pl.name}</strong>
              </button>
            {/each}
          </div>{/if}
        {:else if contextPanel === 'comments'}
          <div class="ly-context-comment-list">
            {#each songComments as c, i (c.commentId || i)}
              <article class="ly-context-comment-row"><strong>{c.user?.nickname || '听众'}</strong><p>{c.content}</p></article>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  {/if}
{/if}
