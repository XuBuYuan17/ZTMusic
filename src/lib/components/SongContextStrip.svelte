<script lang="ts">
  import { dialogFocus } from '../app/desktop-motion.ts';
  import type { SongId } from '../types/music.ts'
  import { player } from '../stores/player.svelte.ts'
  import { auth } from '../stores/auth.svelte.ts'
  import { ncm } from '../api/client.ts'
  import { coverUrl } from '../utils/image.ts'
  import ArtistNames from './ArtistNames.svelte'
  import Icon from './ui/Icon.svelte'

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
    user?: { nickname?: string | null; avatarUrl?: string | null } | null
    content?: string
    likedCount?: number
    timeStr?: string
  }

  interface SimilarPlaylist {
    id: SongId
    name?: string
    coverImgUrl?: string
    trackCount?: number
    creator?: { nickname?: string | null } | null
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

  let commentDraft = $state('')
  let commentSending = $state(false)
  let commentError = $state('')

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

  function formatCount(value?: number): string {
    if (!value) return ''
    if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`
    return String(value)
  }

  function commentInitial(comment: SongComment): string {
    return (comment.user?.nickname || '听众').trim().slice(0, 1) || '听'
  }

  async function submitComment(): Promise<void> {
    const content = commentDraft.trim()
    const id = player.id
    if (!content || commentSending || !id) return
    commentSending = true
    commentError = ''
    try {
      const r = rec(await ncm.commentAdd(id, content))
      if (r && r.code !== 200) throw new Error((r.message || r.msg || '发表失败') as string)
      commentDraft = ''
      // 本地插到最前面而不是重拉：热评只取 6 条，刚发的评论不可能挤进热评榜，
      // 重拉会让用户以为没发出去。下次打开这个面板自然会重新拉
      songComments = [{
        commentId: `local-${Date.now()}`,
        user: { nickname: auth.user?.nickname || '我', avatarUrl: auth.user?.avatarUrl || '' },
        content,
        likedCount: 0,
        timeStr: '刚刚',
      }, ...songComments]
    } catch (e) {
      commentError = ((e as { message?: unknown } | null | undefined)?.message || '发表失败') as string
    } finally {
      commentSending = false
    }
  }

  // 输入法组字期间的 Enter 是「选中候选词」，不能当发送
  function handleCommentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      void submitComment()
    }
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
      <div class="ly-context-detail" use:dialogFocus={closeContextStrip} tabindex="-1" class:ly-context-detail--mobile={variant === 'mobile'} role="dialog" aria-modal={variant === 'desktop'} aria-labelledby="ly-context-title">
        <header class="ly-context-detail-head">
          <div class="ly-context-heading">
            <small>SONG DISCOVERY</small>
            <strong id="ly-context-title">歌曲灵感</strong>
            <span>从「{player.title || '正在播放'}」继续发现</span>
          </div>
          <button onclick={closeContextStrip} aria-label="关闭"><Icon name="close" size={18} strokeWidth={2}/></button>
        </header>

        <nav class="ly-context-tabs" aria-label="歌曲相关内容">
          <button class:active={contextPanel === 'songs'} onclick={() => openContextPanel('songs')}>
            <Icon name="music" size={16} strokeWidth={1.8}/><span>相似歌曲</span><em>{similarSongs.length}</em>
          </button>
          <button class:active={contextPanel === 'playlists'} onclick={() => openContextPanel('playlists')}>
            <Icon name="list" size={16} strokeWidth={1.8}/><span>相似歌单</span><em>{similarPlaylists.length}</em>
          </button>
          <button class:active={contextPanel === 'comments'} onclick={() => openContextPanel('comments')}>
            <Icon name="messages" size={16} strokeWidth={1.8}/><span>热评</span><em>{songComments.length}</em>
          </button>
        </nav>

        <div class="ly-context-detail-body">
          {#if contextPanel === 'songs'}
            {#if similarSongs.length > 0}
              <div class="ly-context-detail-list">
                {#each similarSongs as track, i (track.id)}
                  <button class="ly-context-detail-row" onclick={() => playSimilarSong(track)}>
                    <span class="ly-context-index">{String(i + 1).padStart(2, '0')}</span>
                    <span class="ly-context-art">
                      {#if track.picUrl}<img src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}
                      <span class="ly-context-play"><Icon name="play" size={12}/></span>
                    </span>
                    <span class="ly-context-track-copy"><strong>{track.name}</strong><em><ArtistNames artists={track.ar || []} onOpenArtist={openArtist}/></em></span>
                    <span class="ly-context-row-action"><Icon name="play" size={13}/></span>
                  </button>
                {/each}
              </div>
            {:else}<div class="ly-context-empty">暂时没有找到相似歌曲</div>{/if}
          {:else if contextPanel === 'playlists'}
            {#if selectedSimilarPlaylist}
              <div class="ly-context-subhead">
                <button onclick={() => { selectedSimilarPlaylist = null; selectedPlaylistTracks = [] }}><Icon name="chevron-left" size={16}/> 返回</button>
                <span>{selectedSimilarPlaylist.name}</span>
              </div>
              {#if selectedPlaylistLoading}<div class="ly-context-empty">正在载入歌单…</div>
              {:else if selectedPlaylistTracks.length > 0}<div class="ly-context-detail-list">
                {#each selectedPlaylistTracks as track, i (track.id)}
                  <button class="ly-context-detail-row" onclick={() => playSelectedPlaylistTrack(track)}>
                    <span class="ly-context-index">{String(i + 1).padStart(2, '0')}</span>
                    <span class="ly-context-art">{#if track.picUrl}<img src={coverUrl(track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}<span class="ly-context-play"><Icon name="play" size={12}/></span></span>
                    <span class="ly-context-track-copy"><strong>{track.name}</strong><em><ArtistNames artists={track.ar || []} onOpenArtist={openArtist}/></em></span>
                    <span class="ly-context-row-action"><Icon name="play" size={13}/></span>
                  </button>
                {/each}
              </div>
              {:else}<div class="ly-context-empty">这个歌单暂时没有可预览的歌曲</div>{/if}
            {:else if similarPlaylists.length > 0}<div class="ly-context-detail-grid">
              {#each similarPlaylists as pl (pl.id)}
                <button class="ly-context-detail-playlist" onclick={() => loadSimilarPlaylist(pl)}>
                  <span class="ly-context-playlist-art">
                    {#if pl.coverImgUrl}<img src={coverUrl(pl.coverImgUrl, 240)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}
                    <span><Icon name="chevron-right" size={15}/></span>
                  </span>
                  <strong>{pl.name}</strong>
                  <em>{pl.creator?.nickname || (pl.trackCount ? `${pl.trackCount} 首歌曲` : '为你推荐')}</em>
                </button>
              {/each}
            </div>
            {:else}<div class="ly-context-empty">暂时没有找到相似歌单</div>{/if}
          {:else if contextPanel === 'comments'}
            <div class="ly-context-comments">
              {#if songComments.length > 0}<div class="ly-context-comment-list">
                {#each songComments as c, i (c.commentId || i)}
                  <article class="ly-context-comment-row">
                    <div class="ly-context-comment-author">
                      {#if c.user?.avatarUrl}<img src={coverUrl(c.user.avatarUrl, 72)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span>{commentInitial(c)}</span>{/if}
                      <div><strong>{c.user?.nickname || '听众'}</strong><small>{c.timeStr || '网易云音乐热评'}</small></div>
                      {#if c.likedCount}<em>♥ {formatCount(c.likedCount)}</em>{/if}
                    </div>
                    <p>{c.content}</p>
                  </article>
                {/each}
              </div>
              {:else}<div class="ly-context-empty">暂时没有热门评论</div>{/if}
              <form class="ly-context-comment-form" onsubmit={(e) => { e.preventDefault(); void submitComment() }}>
                <textarea
                  class="ly-context-comment-input"
                  bind:value={commentDraft}
                  placeholder="说点什么…（Enter 发表，Shift+Enter 换行）"
                  rows="2"
                  maxlength="140"
                  disabled={commentSending}
                  aria-label="发表评论"
                  onkeydown={handleCommentKeydown}
                ></textarea>
                <div class="ly-context-comment-foot">
                  {#if commentError}<span class="ly-context-comment-error" role="status">{commentError}</span>{/if}
                  <button class="ly-context-comment-submit" type="submit" disabled={commentSending || !commentDraft.trim()}>
                    {commentSending ? '发表中…' : '发表'}
                  </button>
                </div>
              </form>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
{/if}
