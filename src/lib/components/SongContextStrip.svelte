<script lang="ts">
  import type { SongId } from '../types/music.ts'
  import { player } from '../stores/player.svelte.ts'
  import { ncm } from '../api/client.ts'
  import { coverUrl } from '../utils/image.ts'
  import ArtistNames from './ArtistNames.svelte'

  type ContextPanel = 'songs' | 'playlists' | 'comments'

  interface TrackArtist { id?: SongId; name: string }

  interface NormalizedTrack {
    id: SongId
    name?: unknown
    ar: TrackArtist[]
    al: Record<string, unknown>
    dt: number
    picUrl: string
  }

  interface SongComment {
    commentId?: SongId
    user?: { nickname?: string | null } | null
    content?: string
  }

  interface SimilarPlaylist {
    id: SongId
    name?: string
    coverImgUrl?: string
  }

  let { variant = 'desktop', activePanel = null, showCards = true, onActivePanelChange, onOpenArtist, onClose }: {
    variant?: 'desktop' | 'mobile'
    activePanel?: ContextPanel | null
    showCards?: boolean
    onActivePanelChange?: (panel: ContextPanel | null) => void
    onOpenArtist?: (id: SongId) => void
    onClose?: () => void
  } = $props()

  let loading = $state(false)
  let songComments = $state<SongComment[]>([])
  let similarSongs = $state<NormalizedTrack[]>([])
  let similarPlaylists = $state<SimilarPlaylist[]>([])

  let showContextStrip = $state(false)
  let contextPanel = $state<ContextPanel | null>(null)
  let selectedSimilarPlaylist = $state<SimilarPlaylist | null>(null)
  let selectedPlaylistTracks = $state<NormalizedTrack[]>([])
  let selectedPlaylistLoading = $state(false)

  const hasExtras = $derived(loading || similarSongs.length > 0 || similarPlaylists.length > 0 || songComments.length > 0)

  function rec(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  }
  function arr(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
  }

  function normalizeTrack(track: unknown): NormalizedTrack | null {
    if (!track) return null
    const t = track as {
      id?: SongId
      name?: unknown
      ar?: unknown
      artists?: unknown
      al?: { picUrl?: unknown } | null
      album?: { picUrl?: unknown } | null
      dt?: unknown
      duration?: unknown
      picUrl?: unknown
      coverImgUrl?: unknown
    }
    return {
      ...(track as Record<string, unknown>),
      id: t.id as SongId,
      name: t.name,
      ar: (t.ar || t.artists || []) as TrackArtist[],
      al: (t.al || t.album || {}) as Record<string, unknown>,
      dt: (t.dt || t.duration || 0) as number,
      picUrl: (t.al?.picUrl || t.album?.picUrl || t.picUrl || t.coverImgUrl || '') as string,
    }
  }

  async function fetchExtras(): Promise<void> {
    if (!player.id) return
    loading = true
    try {
      const [cr, sr, pr] = await Promise.all([
        ncm.commentMusic(player.id, 8).catch(() => ({ hotComments: [] as unknown[], comments: [] as unknown[] })),
        ncm.simiSong(player.id).catch(() => ({ songs: [] as unknown[] })),
        ncm.simiPlaylist(player.id).catch(() => ({ playlists: [] as unknown[] })),
      ])
      const crRec = rec(cr)
      const hotComments = crRec?.hotComments
      songComments = ((Array.isArray(hotComments) && hotComments.length
        ? hotComments
        : crRec?.comments || []) as unknown[]).slice(0, 6) as unknown as SongComment[]
      similarSongs = arr(rec(sr)?.songs)
        .map(normalizeTrack)
        .filter((t): t is NormalizedTrack => t !== null)
        .slice(0, 6)
      similarPlaylists = arr(rec(pr)?.playlists).slice(0, 6) as unknown as SimilarPlaylist[]
    } catch {
      songComments = []
      similarSongs = []
      similarPlaylists = []
    }
    loading = false
  }

  function playSimilarSong(track: NormalizedTrack): void {
    const idx = similarSongs.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(similarSongs, idx)
    else player.playTrack(track, 0)
  }

  async function loadSimilarPlaylist(pl: SimilarPlaylist): Promise<void> {
    if (!pl?.id) return
    selectedSimilarPlaylist = pl
    selectedPlaylistTracks = []
    selectedPlaylistLoading = true
    try {
      const resRec = rec(await ncm.playlistTracks(pl.id, 20))
      const playlistRec = rec(resRec?.playlist)
      const tracks = (resRec?.songs || playlistRec?.tracks || []) as unknown[]
      selectedPlaylistTracks = tracks
        .map(normalizeTrack)
        .filter((t): t is NormalizedTrack => t !== null)
    } catch {
      selectedPlaylistTracks = []
    }
    selectedPlaylistLoading = false
  }

  function playSelectedPlaylistTrack(track: NormalizedTrack): void {
    const idx = selectedPlaylistTracks.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(selectedPlaylistTracks, idx)
    else player.playTrack(track, 0)
  }

  function openArtist(id: SongId): void {
    if (!id) return
    onOpenArtist?.(id)
    onClose?.()
  }

  function toggleContextStrip(): void {
    showContextStrip = !showContextStrip
    if (!showContextStrip) closeContextPanel()
  }

  function closeContextStrip(): void {
    showContextStrip = false
    closeContextPanel()
  }

  function closeContextPanel(): void {
    contextPanel = null
    selectedSimilarPlaylist = null
    selectedPlaylistTracks = []
    selectedPlaylistLoading = false
  }

  function openContextPanel(type: ContextPanel): void {
    contextPanel = contextPanel === type ? null : type
    if (type !== 'playlists') {
      selectedSimilarPlaylist = null
      selectedPlaylistTracks = []
    }
  }

  function contextPanelTitle(): string {
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

  $effect(() => {
    if (!activePanel) return
    contextPanel = activePanel
    showContextStrip = true
    if (activePanel !== 'playlists') {
      selectedSimilarPlaylist = null
      selectedPlaylistTracks = []
    }
    onActivePanelChange?.(null)
  })
</script>

{#if hasExtras}
  {#if variant === 'mobile' || showContextStrip}
    {#if variant === 'desktop'}
      <button class="ly-context-scrim" aria-label="隐藏相关内容" onclick={closeContextStrip}></button>
    {/if}

    {#if showCards}
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
    {/if}

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
