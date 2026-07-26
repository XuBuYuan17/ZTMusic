<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { ncm } from '../../api/client.js'
  import { normalizePlaylist } from '../../utils/normalize.js'
  import { coverUrl } from '../../utils/image.js'
  import ErrorBlock from '../../components/ui/ErrorBlock.svelte'
  import ConfirmDialog from '../../components/ConfirmDialog.svelte'

  let { onOpenLogin, onOpenPlaylist, onNavigate } = $props()

  let library = $state(null)
  let loading = $state(false)
  let error = $state('')
  let _requestId = 0

  // 创建歌单
  let showCreateModal = $state(false)
  let createName = $state('')
  let creating = $state(false)

  // 取消收藏确认
  let unsubscribeTarget = $state(null)
  let unsubscribing = $state(false)

  // 轻提示
  let notice = $state('')

  const emptyLibrary = {
    stats: { follow: 0, fans: 0, playlist: 0 },
    createdPlaylists: [],
    savedPlaylists: [],
    likedPlaylist: null,
  }

  let data = $derived(library || emptyLibrary)
  let savedPlaylists = $derived(data.savedPlaylists || [])
  let createdPlaylists = $derived(data.createdPlaylists || [])

  async function load() {
    const rid = ++_requestId; loading = true; library = null; error = ''
    if (!auth.isLoggedIn) { loading = false; return }
    try {
      const uid = auth.user?.userId || auth.user?.id
      const [plRes, subRes, detailRes] = await Promise.all([
        ncm.userPlaylist(uid).catch(() => ({ playlist: [] })),
        ncm.userSubcount().catch(() => ({})),
        ncm.userDetail(uid).catch(() => ({})),
      ])
      if (rid !== _requestId) return

      const all = (plRes.playlist || []).slice(0, 100)
      const normalized = all.map(normalizePlaylist).filter(Boolean)
      const saved = all.filter(p => p.creator?.userId !== uid && p.specialType !== 5).map(normalizePlaylist).filter(Boolean)
      const created = all.filter(p => p.creator?.userId === uid && p.specialType !== 5).map(normalizePlaylist).filter(Boolean)
      const liked = normalizePlaylist(all.find(p => p.creator?.userId === uid && p.specialType === 5))

      const sub = subRes.data || subRes
      const detail = detailRes.data || detailRes
      const profile = detail.profile || {}

      library = {
        stats: {
          follow: sub.artistCount || sub.followCount || 0,
          fans: profile.followeds || detail.followeds || 0,
          playlist: (sub.createdPlaylistCount || 0) + (sub.subPlaylistCount || 0) || normalized.length,
        },
        createdPlaylists: created,
        savedPlaylists: saved,
        likedPlaylist: liked,
      }
    } catch (e) {
      if (rid === _requestId) error = e?.message || '加载失败'
    } finally {
      if (rid === _requestId) loading = false
    }
  }

  const timers = new Set()
  function safeTimeout(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn() }, ms)
    timers.add(id)
    return id
  }

  function showNotice(text) {
    notice = text
    safeTimeout(() => { if (notice === text) notice = '' }, 1800)
  }

  function openCreateModal() {
    createName = ''
    showCreateModal = true
  }

  function focusOnMount(node) {
    queueMicrotask(() => node.focus())
  }

  function handleCreateModalKeydown(event) {
    if (showCreateModal && event.key === 'Escape') {
      event.preventDefault()
      closeCreateModal()
    }
  }

  function handleCreateModalBackdrop(event) {
    if (event.target === event.currentTarget) closeCreateModal()
  }

  function closeCreateModal() {
    if (creating) return
    showCreateModal = false
    createName = ''
  }

  async function submitCreate() {
    if (creating) return
    const name = createName.trim()
    if (!name) return
    creating = true
    try {
      const res = await ncm.playlistCreate(name)
      if (res && res.code !== 200) throw new Error(res.message || res.msg || '创建失败')
      closeCreateModal()
      showNotice('已创建歌单')
      await load()
    } catch (e) {
      showNotice(e?.message || '创建失败')
    } finally {
      creating = false
    }
  }

  function confirmUnsubscribe(pl) {
    unsubscribeTarget = pl
  }

  function closeUnsubscribe() {
    if (unsubscribing) return
    unsubscribeTarget = null
  }

  async function submitUnsubscribe() {
    const pl = unsubscribeTarget
    if (!pl?.id || unsubscribing) return
    unsubscribing = true
    try {
      const res = await ncm.playlistSubscribe(pl.id, false)
      if (res && res.code !== 200) throw new Error(res.message || res.msg || '操作失败')
      unsubscribeTarget = null
      showNotice('已取消收藏')
      await load()
    } catch (e) {
      showNotice(e?.message || '操作失败')
    } finally {
      unsubscribing = false
    }
  }

  $effect(() => {
    if (auth.isLoggedIn && auth.user) load()
    return () => timers.forEach(id => clearTimeout(id))
  })
</script>

<svelte:window onkeydown={handleCreateModalKeydown} />

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
        <h1>我的收藏</h1>
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
          onclick={() => data.likedPlaylist?.id && onOpenPlaylist?.(data.likedPlaylist.id, true, data.likedPlaylist)}
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
        <button class="library-quick-card library-quick-add" type="button" onclick={openCreateModal}>
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
        {#each Array(10) as _}
          <div class="library-card library-card-skeleton">
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
            {#each createdPlaylists as pl (pl.id)}
              <div class="library-card" role="button" tabindex="0" onclick={() => onOpenPlaylist?.(pl.id, true, pl)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPlaylist?.(pl.id, true, pl) } }}>
                <div class="library-card-cover">
                  {#if pl.picUrl}
                    <img src={coverUrl(pl.picUrl, 400)} alt={pl.name} loading="lazy" referrerpolicy="no-referrer" />
                  {:else}
                    <div class="library-card-placeholder">
                      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    </div>
                  {/if}
                  <div class="library-card-play-btn">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div class="library-card-info">
                  <div class="library-card-name">{pl.name}</div>
                  <div class="library-card-meta">
                    {#if pl.trackCount}<span>{pl.trackCount} 首</span>{/if}
                  </div>
                </div>
              </div>
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
            {#each savedPlaylists as pl (pl.id)}
              <div class="library-card library-card-managed" role="button" tabindex="0" onclick={() => onOpenPlaylist?.(pl.id, true, pl)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPlaylist?.(pl.id, true, pl) } }}>
                <div class="library-card-cover">
                  {#if pl.picUrl}
                    <img src={coverUrl(pl.picUrl, 400)} alt={pl.name} loading="lazy" referrerpolicy="no-referrer" />
                  {:else}
                    <div class="library-card-placeholder">
                      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    </div>
                  {/if}
                  <div class="library-card-play-btn">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div class="library-card-info">
                  <div class="library-card-name">{pl.name}</div>
                  <div class="library-card-meta">
                    {#if pl.trackCount}<span>{pl.trackCount} 首</span>{/if}
                    {#if pl.creator}<span class="library-card-creator">· {pl.creator}</span>{/if}
                  </div>
                </div>
                <button class="library-card-unsubscribe" type="button" onclick={(e) => { e.stopPropagation(); confirmUnsubscribe(pl) }} aria-label={`取消收藏 ${pl.name}`}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
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
    <div class="library-modal-backdrop" role="presentation" onclick={handleCreateModalBackdrop}>
      <div class="library-modal" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="create-playlist-title">
        <h3 class="library-modal-title" id="create-playlist-title">新建歌单</h3>
        <input
          class="library-modal-input"
          type="text"
          placeholder="请输入歌单名称"
          bind:value={createName}
          maxlength="30"
          use:focusOnMount
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitCreate() } }}
        />
        <div class="library-modal-actions">
          <button class="library-modal-btn library-modal-btn-cancel" type="button" onclick={closeCreateModal} disabled={creating}>取消</button>
          <button class="library-modal-btn library-modal-btn-confirm" type="button" onclick={submitCreate} disabled={creating}>{creating ? '创建中…' : '创建'}</button>
        </div>
      </div>
    </div>
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
