<script lang="ts">
  import type { SongId } from '../types/music.ts'
  import { auth } from '../stores/auth.svelte.ts'
  import { ncm } from '../api/client.ts'
  import { coverUrl } from '../utils/image.ts'
  import { parseLikeCheck } from '../utils/like-check.ts'
  import { debugLog } from '../utils/error.ts'
  import Icon from './ui/Icon.svelte'
  import SongPlaylistPanel from './SongPlaylistPanel.svelte'

  interface MenuArtist { id?: SongId; name?: unknown }
  interface MenuAlbum { id?: SongId; name?: unknown; picUrl?: unknown }
  interface MenuTrack {
    id?: SongId
    name?: unknown
    picUrl?: unknown
    artists?: MenuArtist[]
    ar?: MenuArtist[]
    album?: MenuAlbum
    al?: MenuAlbum
  }
  type PlaylistMode = 'menu' | 'add' | 'remove'
  type SafeTimer = ReturnType<typeof setTimeout>

  let {
    show = false,
    track = null,
    x = 0,
    y = 0,
    onClose,
    onOpenArtist,
    onOpenAlbum,
    onToast,
  }: {
    show?: boolean
    track?: unknown
    x?: number
    y?: number
    onClose?: () => void
    onOpenArtist?: (id: unknown) => void
    onOpenAlbum?: (id: unknown) => void
    onToast?: (message: unknown) => void
  } = $props()

  let playlistMode = $state<PlaylistMode>('menu')
  let liked = $state(false)
  let likeLoading = $state(false)
  let toastText = $state('')
  let lastTrackId = $state<SongId | null>(null)
  let likeCheckRequestId = 0

  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }

  function asMenuTrack(t: unknown): MenuTrack | null {
    return rec(t) as MenuTrack | null
  }

  const mt = $derived(asMenuTrack(track))

  function activeUid(): SongId | null {
    const uid: unknown = auth.user?.userId || auth.user?.id
    return typeof uid === 'number' || typeof uid === 'string' ? uid : null
  }

  // 定时器管理器
  const timers = new Set<SafeTimer>()
  function safeTimeout(fn: () => void, ms: number): SafeTimer {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  const MENU_WIDTH = 278
  const MENU_MARGIN = 12
  const MENU_HEIGHT = $derived(playlistMode === 'menu' ? 292 : 448)

  let menuLeft = $derived(Math.max(MENU_MARGIN, Math.min(x || MENU_MARGIN, (typeof window !== 'undefined' ? window.innerWidth : 1200) - MENU_WIDTH - MENU_MARGIN)))
  let menuTop = $derived(Math.max(MENU_MARGIN, Math.min(y || MENU_MARGIN, (typeof window !== 'undefined' ? window.innerHeight : 800) - MENU_HEIGHT - MENU_MARGIN)))

  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return {
      destroy() {
        node.remove()
      },
    }
  }

  $effect(() => {
    if (!show || !mt?.id) return
    playlistMode = 'menu'
    toastText = ''
    if (lastTrackId !== mt.id) {
      lastTrackId = mt.id
      liked = false
      likeLoading = false
      checkLiked()
    }
  })

  $effect(() => {
    if (!auth.isLoggedIn) {
      liked = false
      likeLoading = false
      playlistMode = 'menu'
    }
  })

  // 组件销毁时清理所有定时器
  $effect(() => () => timers.forEach(id => clearTimeout(id)))

  // Escape 键关闭菜单
  $effect(() => {
    if (!show) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  function artistsOf(t: unknown): MenuArtist[] {
    const m = asMenuTrack(t)
    const list = m?.artists || m?.ar || []
    return Array.isArray(list) ? list : []
  }

  function artistText(t: unknown): string {
    return artistsOf(t).map(artist => artist.name).filter(Boolean).join(' / ')
  }

  function albumOf(t: unknown): MenuAlbum {
    const m = asMenuTrack(t)
    return m?.album || m?.al || {}
  }

  function albumName(t: unknown): unknown {
    return albumOf(t)?.name || ''
  }

  function firstArtist(t: unknown): MenuArtist | undefined {
    return artistsOf(t).find(artist => artist?.id)
  }

  async function checkLiked(): Promise<void> {
    const t = mt
    if (!auth.isLoggedIn || !t?.id) return
    const requestId = ++likeCheckRequestId
    const trackId = t.id
    try {
      const res = await ncm.songLikeCheck(trackId)
      if (requestId === likeCheckRequestId && mt?.id === trackId) liked = parseLikeCheck(res, trackId)
    } catch (err) {
      debugLog('SongContextMenu', 'like-check-fallback', { error: (err as { message?: unknown } | null | undefined)?.message || String(err) })
      const uid = activeUid()
      if (!uid) return
      try {
        const res = await ncm.likelist(uid)
        const r = rec(res)
        const rawIds = r?.ids || r?.data || []
        const ids: unknown[] = Array.isArray(rawIds) ? rawIds : []
        if (requestId === likeCheckRequestId && mt?.id === trackId) liked = ids.map(Number).includes(Number(trackId))
      } catch (err2) { debugLog('SongContextMenu', 'likelist-error', { error: (err2 as { message?: unknown } | null | undefined)?.message || String(err2) }) }
    }
  }

  function showToast(text: string): void {
    toastText = text
    onToast?.(text)
    safeTimeout(() => { if (toastText === text) toastText = '' }, 1600)
  }

  async function toggleLike(): Promise<void> {
    const t = mt
    if (!auth.isLoggedIn || !t?.id || likeLoading) {
      if (!auth.isLoggedIn) showToast('请先登录')
      return
    }
    const uid = activeUid()
    if (!uid) {
      showToast('登录状态异常')
      return
    }
    likeLoading = true
    const nextLiked = !liked
    const trackId = t.id
    try {
      await ncm.like(trackId, nextLiked, uid)
      if (mt?.id !== trackId) return
      liked = nextLiked
      showToast(nextLiked ? '已添加到我喜欢' : '已取消喜欢')
    } catch {
      showToast('操作失败')
    } finally {
      if (mt?.id === trackId) likeLoading = false
    }
  }

  function openPlaylistPanel(mode: PlaylistMode): void {
    if (!auth.isLoggedIn) {
      showToast('请先登录')
      return
    }
    if (!activeUid()) {
      showToast('登录状态异常')
      return
    }
    playlistMode = mode
  }

  function openArtist(): void {
    const artist = firstArtist(mt)
    if (artist?.id) {
      onOpenArtist?.(artist.id)
      onClose?.()
    } else {
      showToast('没有歌手信息')
    }
  }

  function openAlbum(): void {
    const album = albumOf(mt)
    if (album?.id) {
      onOpenAlbum?.(album.id)
      onClose?.()
    } else {
      showToast('没有专辑信息')
    }
  }

  function copyLink(): void {
    const id = mt?.id
    if (!id) return
    navigator.clipboard?.writeText(`https://music.163.com/#/song?id=${id}`).catch(() => {})
    showToast('已复制歌曲链接')
  }

  function handleContextmenu(event: MouseEvent): void {
    event.preventDefault()
  }
</script>

{#if show && mt}
  <div class="song-menu-portal" use:portal>
    <button class="song-menu-scrim" type="button" aria-label="关闭歌曲菜单" onclick={onClose} oncontextmenu={handleContextmenu}></button>
    <div
      class="song-menu"
      class:panel={playlistMode !== 'menu'}
      style="left:{menuLeft}px;top:{menuTop}px"
      role="menu"
      tabindex="-1"
      aria-label="歌曲操作菜单"
      oncontextmenu={handleContextmenu}
    >
    <header class="song-menu__header">
      <div class="song-menu__cover">
        {#if albumOf(mt)?.picUrl || mt.picUrl}
          <img src={coverUrl(albumOf(mt)?.picUrl || mt.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
        {:else}
          <span>♫</span>
        {/if}
      </div>
      <div class="song-menu__title">
        <strong>{mt.name || '未知歌曲'}</strong>
        <span>{artistText(mt) || '未知歌手'}</span>
      </div>
    </header>

    {#if playlistMode === 'menu'}
      <div class="song-menu__group">
        <button class="song-menu__item primary" onclick={toggleLike} disabled={likeLoading}>
          <span class="song-menu__icon"><Icon name={liked ? 'heart-filled' : 'heart'} size={16} /></span>
          <span>{liked ? '取消喜欢' : '喜欢'}</span>
          {#if likeLoading}<em>处理中</em>{/if}
        </button>
        <button class="song-menu__item" onclick={() => openPlaylistPanel('add')}>
          <span class="song-menu__icon"><Icon name="add" size={16} /></span>
          <span>添加到歌单</span>
        </button>
        <button class="song-menu__item" onclick={() => openPlaylistPanel('remove')}>
          <span class="song-menu__icon"><Icon name="trash" size={16} /></span>
          <span>从歌单移除</span>
        </button>
      </div>

      <div class="song-menu__group">
        <button class="song-menu__item" onclick={openArtist} disabled={!firstArtist(mt)?.id}>
          <span class="song-menu__icon"><Icon name="user" size={16} /></span>
          <span>查看歌手</span>
        </button>
        <button class="song-menu__item" onclick={openAlbum} disabled={!albumOf(mt)?.id}>
          <span class="song-menu__icon"><Icon name="music" size={16} /></span>
          <span>查看专辑</span>
          {#if albumName(mt)}<em>{albumName(mt)}</em>{/if}
        </button>
      </div>

      <div class="song-menu__group compact">
        <button class="song-menu__item" onclick={copyLink}>
          <span class="song-menu__icon"><Icon name="link" size={16} /></span>
          <span>复制链接</span>
        </button>
      </div>
    {/if}
    <div hidden={playlistMode === 'menu'}>
      <SongPlaylistPanel
        active={playlistMode !== 'menu'}
        mode={playlistMode === 'remove' ? 'remove' : 'add'}
        trackId={mt.id ?? null}
        trackName={mt.name}
        onBack={() => playlistMode = 'menu'}
        onToast={showToast}
      />
    </div>
    </div>

    {#if toastText}
      <div class="song-menu-toast">{toastText}</div>
    {/if}
  </div>
{/if}

<style>
  .song-menu-portal {
    display: contents;
  }

  .song-menu-scrim {
    position: fixed;
    inset: 0;
    z-index: 340;
    border: none;
    padding: 0;
    background: transparent;
    cursor: default;
  }

  .song-menu {
    position: fixed;
    z-index: 350;
    width: 278px;
    max-width: calc(100vw - 24px);
    max-height: min(620px, calc(100vh - 24px));
    overflow: hidden;
    padding: 6px;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
    animation: songMenuIn 120ms var(--ease-out) both;
  }

  .song-menu.panel {
    width: 310px;
  }

  .song-menu__header,
  .song-menu__group {
    position: relative;
    z-index: 1;
  }

  .song-menu__header {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 6px 6px 10px;
  }

  .song-menu__cover,
  .song-menu__cover img,
  .song-menu__cover span {
    width: 42px;
    height: 42px;
    border-radius: var(--radius-xs);
  }

  .song-menu__cover img {
    object-fit: cover;
    border: 1px solid var(--border);
  }

  .song-menu__cover span {
    display: grid;
    place-items: center;
    background: var(--bg-surface);
    color: var(--text-tertiary);
  }

  .song-menu__title {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .song-menu__title strong,
  .song-menu__title span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .song-menu__title strong {
    font-size: 14px;
    font-weight: 500;
  }

  .song-menu__title span {
    color: var(--text-tertiary);
    font-size: 12px;
  }

  .song-menu__group {
    display: grid;
    gap: 1px;
    padding: 5px 0;
    border-top: 1px solid var(--border);
  }

  .song-menu__group.compact {
    padding-bottom: 0;
  }

  .song-menu__item {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 34px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .song-menu__item:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text);
  }

  .song-menu__item.primary {
    color: color-mix(in srgb, var(--accent) 88%, white);
  }

  .song-menu__item:disabled {
    cursor: default;
    opacity: 0.42;
  }

  .song-menu__icon {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    color: inherit;
  }

  .song-menu__item em {
    min-width: 0;
    max-width: 96px;
    color: var(--text-tertiary);
    font-size: 11px;
    font-style: normal;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .song-menu-toast {
    position: fixed;
    left: 50%;
    bottom: 82px;
    z-index: 360;
    transform: translateX(-50%);
    padding: 10px 16px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-elevated);
    color: var(--text);
    box-shadow: 0 14px 34px rgba(0,0,0,0.24);
    font-size: 13px;
    font-weight: 500;
    animation: songToastIn 180ms ease both;
  }

  @keyframes songMenuIn {
    from { opacity: 0; transform: translateY(-4px) scale(0.985); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes songToastIn {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  @media (max-width: 560px) {
    .song-menu,
    .song-menu.panel {
      width: min(310px, calc(100vw - 24px));
      border-radius: var(--radius-sm);
    }
  }
</style>
