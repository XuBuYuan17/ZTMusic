<script lang="ts">
  import type { SongId } from '../../types/music.ts'
  import type { NormalizedPlaylist } from '../../utils/normalize.ts'
  import { auth } from '../../stores/auth.svelte.ts'
  import { ncm } from '../../api/client.ts'
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
      <div class="library-header-info">
        <span class="library-eyebrow">资料库</span>
        <h1>我的收藏</h1>
        <p>管理喜欢的音乐、创建的歌单和收藏内容。</p>
      </div>
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

    <!-- 快速入口 -->
    <section class="library-section">
      <h2 class="library-section-title">快速入口</h2>
      <div class="library-quick-grid">
        <button class="library-quick-card library-quick-liked" type="button"
          onclick={() => { const pl = data.likedPlaylist; if (pl?.id) onOpenPlaylist?.(pl.id as SongId, true, pl) }}
          disabled={!data.likedPlaylist?.id}>
          <span class="library-quick-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </span>
          <span class="library-quick-name">我喜欢的音乐</span>
          <span class="library-quick-meta">{data.likedPlaylist?.trackCount || 0} 首</span>
        </button>
        <button class="library-quick-card" type="button" onclick={() => onNavigate?.('recent')}>
          <span class="library-quick-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </span>
          <span class="library-quick-name">最近播放</span>
          <span class="library-quick-meta">历史记录</span>
        </button>
        <button class="library-quick-card" type="button" onclick={() => onNavigate?.('dailyHistory')}>
          <span class="library-quick-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </span>
          <span class="library-quick-name">历史日推</span>
          <span class="library-quick-meta">每日推荐</span>
        </button>
        <button class="library-quick-card library-quick-add" type="button" onclick={() => showCreateModal = true}>
          <span class="library-quick-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </span>
          <span class="library-quick-name">创建歌单</span>
          <span class="library-quick-meta">新歌单</span>
        </button>
      </div>
    </section>

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
    {:else}
      <!-- 创建的歌单 -->
      <section class="library-section">
        <div class="library-section-head">
          <h2 class="library-section-title">创建的歌单</h2>
          <span class="library-section-count">{createdPlaylists.length}</span>
        </div>
        {#if createdPlaylists.length > 0}
          <div class="library-grid">
            {#each createdPlaylists as pl, i (pl.id as SongId)}
              <LibraryPlaylistCard {pl} index={i} onOpen={(p) => onOpenPlaylist?.(p.id as SongId, true, p)} />
            {/each}
          </div>
        {:else}
          <div class="library-section-empty">还没有创建歌单</div>
        {/if}
      </section>

      <!-- 收藏的歌单 -->
      <section class="library-section">
        <div class="library-section-head">
          <h2 class="library-section-title">收藏的歌单</h2>
          <span class="library-section-count">{savedPlaylists.length}</span>
        </div>
        {#if savedPlaylists.length > 0}
          <div class="library-grid">
            {#each savedPlaylists as pl, i (pl.id as SongId)}
              <LibraryPlaylistCard
                {pl}
                index={i}
                managed={true}
                onOpen={(p) => onOpenPlaylist?.(p.id as SongId, true, p)}
                onUnsubscribe={confirmUnsubscribe}
              />
            {/each}
          </div>
        {:else}
          <div class="library-section-empty">还没有收藏的歌单</div>
        {/if}
      </section>
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
