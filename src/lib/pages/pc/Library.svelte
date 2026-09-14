<script lang="ts">
  import type { SongId } from '../../types/music.ts'
  import type { NormalizedPlaylist } from '../../utils/normalize.ts'
  import { auth } from '../../stores/auth.svelte.ts'
  import { ncm } from '../../api/client.ts'
  import { musicService } from '../../music/service.ts'
  import { player } from '../../stores/player.svelte.ts'
  import type { CompactTrackInput } from '../../player/queue.ts'
  import { normalizePlaylist } from '../../utils/normalize.ts'
  import ErrorBlock from '../../components/ui/ErrorBlock.svelte'
  import ConfirmDialog from '../../components/ConfirmDialog.svelte'
  import CreatePlaylistModal from '../../components/CreatePlaylistModal.svelte'
  import LibraryPlaylistCard from '../../components/LibraryPlaylistCard.svelte'

  interface LibraryData {
    stats: { follow: number; fans: number; playlist: number }
    createdPlaylists: NormalizedPlaylist[]
    savedPlaylists: NormalizedPlaylist[]
    likedPlaylist: NormalizedPlaylist | null
  }
  interface RawPlaylist {
    specialType?: number
    creator?: { userId?: SongId } | null
  }
  type SafeTimer = ReturnType<typeof setTimeout>

  let { onOpenLogin, onOpenPlaylist, onNavigate }: {
    onOpenLogin?: () => void
    onOpenPlaylist?: (id: SongId, push?: boolean, preview?: unknown) => void
    onNavigate?: (view: string) => void
  } = $props()

  let library = $state<LibraryData | null>(null)
  let loading = $state(false)
  let error = $state('')
  let _requestId = 0

  // 创建歌单
  let showCreateModal = $state(false)

  // 取消收藏确认
  let unsubscribeTarget = $state<NormalizedPlaylist | null>(null)
  let unsubscribing = $state(false)

  // 轻提示
  let notice = $state('')

  const emptyLibrary: LibraryData = {
    stats: { follow: 0, fans: 0, playlist: 0 },
    createdPlaylists: [],
    savedPlaylists: [],
    likedPlaylist: null,
  }

  let data = $derived(library || emptyLibrary)
  let savedPlaylists = $derived(data.savedPlaylists || [])
  let createdPlaylists = $derived(data.createdPlaylists || [])
  let likedPlaylist = $derived(data.likedPlaylist)
  // “我喜欢的音乐”同时出现在 savedPlaylists 里，网格首位单独渲染后排除
  let otherSavedPlaylists = $derived(
    likedPlaylist ? savedPlaylists.filter(p => p.id !== likedPlaylist.id) : savedPlaylists,
  )

  // 我喜欢的音乐：直接拉取歌单曲目播放
  let playingLiked = $state(false)
  // 喜爱歌曲卡封面瀑布流：只取前 8 首的封面
  let likedCovers = $state<string[]>([])

  async function loadLikedCovers(liked: NormalizedPlaylist | null, rid: number): Promise<void> {
    const id = liked?.id
    if (!id) { likedCovers = []; return }
    try {
      const res = await ncm.playlistTracks(id as SongId, 8, 0)
      if (rid !== _requestId) return
      const r = rec(res)
      const songs = Array.isArray(r?.songs) ? r.songs : []
      likedCovers = songs.map((s) => {
        const x = rec(s)
        const pic = rec(x?.al)?.picUrl ?? rec(x?.album)?.picUrl
        return typeof pic === 'string' ? pic : ''
      }).filter(Boolean)
    } catch {
      // 拉不到就回退灰底红星
    }
  }


  async function playLiked(): Promise<void> {
    if (!likedPlaylist?.id || playingLiked) return
    playingLiked = true
    try {
      const detail = await musicService.getPlaylist(likedPlaylist.id as SongId)
      const tracks = detail?.tracks ?? []
      if (!tracks.length) { showNotice('歌单为空'); return }
      player.playQueue(tracks as unknown as CompactTrackInput[], 0)
    } catch (e) {
      showNotice(((e as { message?: unknown } | null | undefined)?.message || '播放失败') as string)
    } finally {
      playingLiked = false
    }
  }

  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }

  function isOwnPlaylist(p: unknown, uid: SongId): boolean {
    const r = rec(p) as RawPlaylist | null
    return r?.creator?.userId === uid && r.specialType !== 5
  }

  async function load(): Promise<void> {
    const rid = ++_requestId; loading = true; library = null; error = ''
    if (!auth.isLoggedIn) { loading = false; return }
    try {
      const rawUid: unknown = auth.user?.userId || auth.user?.id
      const uid: SongId = typeof rawUid === 'number' || typeof rawUid === 'string' ? rawUid : 0
      const [plRes, subRes, detailRes] = await Promise.all([
        ncm.userPlaylist(uid).catch(() => ({ playlist: [] })),
        ncm.userSubcount().catch(() => ({})),
        ncm.userDetail(uid).catch(() => ({})),
      ])
      if (rid !== _requestId) return

      const rawList = rec(plRes)?.playlist
      const all: unknown[] = Array.isArray(rawList) ? rawList.slice(0, 100) : []
      const normalized = all.map(normalizePlaylist).filter((p): p is NormalizedPlaylist => p !== null)
      const saved = all.filter(p => !isOwnPlaylist(p, uid)).map(normalizePlaylist).filter((p): p is NormalizedPlaylist => p !== null)
      const created = all.filter(p => isOwnPlaylist(p, uid)).map(normalizePlaylist).filter((p): p is NormalizedPlaylist => p !== null)
      const liked = normalizePlaylist(all.find(p => {
        const r = rec(p) as RawPlaylist | null
        return r?.creator?.userId === uid && r.specialType === 5
      }))

      const subR = rec(subRes)
      const sub = rec(subR?.data) || subR || {}
      const detailR = rec(detailRes)
      const detail = rec(detailR?.data) || detailR || {}
      const profile = rec(detail.profile) || {}

      library = {
        stats: {
          follow: (sub.artistCount || sub.followCount || 0) as number,
          fans: (profile.followeds || detail.followeds || 0) as number,
          playlist: ((sub.createdPlaylistCount || 0) as number) + ((sub.subPlaylistCount || 0) as number) || normalized.length,
        },
        createdPlaylists: created,
        savedPlaylists: saved,
        likedPlaylist: liked,
      }
      void loadLikedCovers(liked, rid)
    } catch (e) {
      if (rid === _requestId) error = ((e as { message?: unknown } | null | undefined)?.message || '加载失败') as string
    } finally {
      if (rid === _requestId) loading = false
    }
  }

  const timers = new Set<SafeTimer>()
  function safeTimeout(fn: () => void, ms: number): SafeTimer {
    const id = setTimeout(() => { timers.delete(id); fn() }, ms)
    timers.add(id)
    return id
  }

  function showNotice(text: string): void {
    notice = text
    safeTimeout(() => { if (notice === text) notice = '' }, 1800)
  }

  function confirmUnsubscribe(pl: NormalizedPlaylist): void {
    unsubscribeTarget = pl
  }

  function closeUnsubscribe(): void {
    if (unsubscribing) return
    unsubscribeTarget = null
  }

  async function submitUnsubscribe(): Promise<void> {
    const pl = unsubscribeTarget
    if (!pl?.id || unsubscribing) return
    unsubscribing = true
    try {
      const res = await ncm.playlistSubscribe(pl.id as SongId, false)
      const r = rec(res)
      if (r && r.code !== 200) throw new Error((r.message || r.msg || '操作失败') as string)
      unsubscribeTarget = null
      showNotice('已取消收藏')
      await load()
    } catch (e) {
      showNotice(((e as { message?: unknown } | null | undefined)?.message || '操作失败') as string)
    } finally {
      unsubscribing = false
    }
  }

  $effect(() => {
    if (auth.isLoggedIn && auth.user) load()
    return () => timers.forEach(id => clearTimeout(id))
  })
</script>

<div class="library-page fade-in">
  {#if !auth.isLoggedIn}
    <div class="library-logged-out">
      <div class="library-hero-icon">
        <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </div>
      <h2>登录后查看收藏</h2>
      <p>你收藏的歌单都会在这里显示</p>
      <button class="library-login-btn" onclick={onOpenLogin}>立即登录</button>
    </div>
  {:else}
    {#if notice}<div class="library-notice">{notice}</div>{/if}

    <div class="library-header">
      <h1 class="library-title">我的播放列表</h1>
      <div class="library-stats">
        <div class="library-stat">
          <span class="library-stat-value">{data.stats.follow}</span>
          <span class="library-stat-label">关注</span>
        </div>
        <div class="library-stat">
          <span class="library-stat-value">{data.stats.fans}</span>
          <span class="library-stat-label">粉丝</span>
        </div>
        <div class="library-stat">
          <span class="library-stat-value">{data.stats.playlist}</span>
          <span class="library-stat-label">歌单</span>
        </div>
      </div>
    </div>

    <!-- 快速入口：弱化的胶囊行，不抢封面网格的视觉 -->
    <div class="library-quick-row">
      <button class="library-quick-chip" type="button" onclick={() => onNavigate?.('recent')}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        最近播放
      </button>
      <button class="library-quick-chip" type="button" onclick={() => onNavigate?.('dailyHistory')}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        历史日推
      </button>
      <button class="library-quick-chip" type="button" onclick={() => showCreateModal = true}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        创建歌单
      </button>
    </div>

    {#if error}
      <ErrorBlock message={error} onRetry={load} />
    {:else if loading && !library}
      <div class="library-grid" aria-label="加载收藏歌单">
        {#each Array(10) as _, i}
          <div class="library-card library-card-skeleton" style={`--card-i:${i}`}>
            <div class="library-card-cover skeleton-block"></div>
            <div class="library-card-info">
              <div class="library-card-name skeleton-line"></div>
              <div class="library-card-meta skeleton-line narrow"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else if likedPlaylist || createdPlaylists.length || savedPlaylists.length}
      <div class="library-grid">
        {#if likedPlaylist}
          <LibraryPlaylistCard
            pl={likedPlaylist}
            index={0}
            liked={true}
            covers={likedCovers}
            busy={playingLiked}
            onOpen={(p) => onOpenPlaylist?.(p.id as SongId, true, p)}
            onPlay={() => playLiked()}
          />
        {/if}
        {#each createdPlaylists as pl, i (pl.id as SongId)}
          <LibraryPlaylistCard {pl} index={i + (likedPlaylist ? 1 : 0)} onOpen={(p) => onOpenPlaylist?.(p.id as SongId, true, p)} />
        {/each}
        {#each otherSavedPlaylists as pl, i (pl.id as SongId)}
          <LibraryPlaylistCard
            {pl}
            index={i + createdPlaylists.length + (likedPlaylist ? 1 : 0)}
            managed={true}
            onOpen={(p) => onOpenPlaylist?.(p.id as SongId, true, p)}
            onUnsubscribe={confirmUnsubscribe}
          />
        {/each}
      </div>
    {:else}
      <div class="library-section-empty">还没有收藏的歌单</div>
    {/if}
  {/if}

  <!-- 创建歌单弹窗 -->
  {#if showCreateModal}
    <CreatePlaylistModal
      onClose={() => showCreateModal = false}
      onCreated={load}
      onNotice={showNotice}
    />
  {/if}

  <!-- 取消收藏确认 -->
  <ConfirmDialog
    show={!!unsubscribeTarget}
    title="取消收藏"
    message="确定要取消收藏「{unsubscribeTarget?.name}」吗？"
    confirmText="取消收藏"
    danger={true}
    onConfirm={submitUnsubscribe}
    onCancel={closeUnsubscribe}
  />
</div>
