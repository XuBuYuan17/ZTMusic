<script>
  import { auth } from '../stores/auth.svelte.js'
  import { ncm } from '../api/client.js'
  import { coverUrl } from '../utils/image.js'
  import { parseLikeCheck } from '../utils/like-check.js'
  import { debugLog } from '../utils/error.js'
  import Icon from './ui/Icon.svelte'

  let {
    show = false,
    track = null,
    x = 0,
    y = 0,
    onClose,
    onOpenArtist,
    onOpenAlbum,
    onToast,
  } = $props()

  let userPlaylists = $state([])
  let loadingPlaylists = $state(false)
  let playlistMode = $state('menu')
  let liked = $state(false)
  let likeLoading = $state(false)
  let toastText = $state('')
  let lastTrackId = $state(null)
  let userPlaylistsOwnerId = $state(null)
  let playlistApplyingId = $state(null)
  let likeCheckRequestId = 0

  // 定时器管理器
  const timers = new Set()
  function safeTimeout(fn, ms) {
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

  function portal(node) {
    document.body.appendChild(node)
    return {
      destroy() {
        node.remove()
      },
    }
  }

  $effect(() => {
    if (!show || !track?.id) return
    playlistMode = 'menu'
    toastText = ''
    if (lastTrackId !== track.id) {
      lastTrackId = track.id
      liked = false
      likeLoading = false
      playlistApplyingId = null
      checkLiked()
    }
  })

  $effect(() => {
    if (!auth.isLoggedIn) {
      userPlaylists = []
      userPlaylistsOwnerId = null
      liked = false
      likeLoading = false
      playlistApplyingId = null
      playlistMode = 'menu'
    }
  })

  // 组件销毁时清理所有定时器
  $effect(() => () => timers.forEach(id => clearTimeout(id)))

  // Escape 键关闭菜单
  $effect(() => {
    if (!show) return
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  function artistsOf(t) {
    return t?.artists || t?.ar || []
  }

  function artistText(t) {
    return artistsOf(t).map(artist => artist.name).filter(Boolean).join(' / ')
  }

  function albumOf(t) {
    return t?.album || t?.al || {}
  }

  function albumName(t) {
    return albumOf(t)?.name || ''
  }

  function firstArtist(t) {
    return artistsOf(t).find(artist => artist?.id)
  }

  function isEditablePlaylist(playlist, uid) {
    if (Number(playlist.userId) !== Number(uid)) return false
    return Number(playlist.specialType || 0) !== 5
  }

  async function checkLiked() {
    if (!auth.isLoggedIn || !track?.id) return
    const requestId = ++likeCheckRequestId
    const trackId = track.id
    try {
      const res = await ncm.songLikeCheck(trackId)
      if (requestId === likeCheckRequestId && track?.id === trackId) liked = parseLikeCheck(res, trackId)
    } catch (err) {
      debugLog('SongContextMenu', 'like-check-fallback', { error: err?.message || String(err) })
      const uid = auth.user?.userId || auth.user?.id
      if (!uid) return
      try {
        const res = await ncm.likelist(uid)
        const ids = res?.ids || res?.data || []
        if (requestId === likeCheckRequestId && track?.id === trackId) liked = ids.map(Number).includes(Number(trackId))
      } catch (err2) { debugLog('SongContextMenu', 'likelist-error', { error: err2?.message || String(err2) }) }
    }
  }

  function showToast(text) {
    toastText = text
    onToast?.(text)
    safeTimeout(() => { if (toastText === text) toastText = '' }, 1600)
  }

  async function toggleLike() {
    if (!auth.isLoggedIn || !track?.id || likeLoading) {
      if (!auth.isLoggedIn) showToast('请先登录')
      return
    }
    const uid = auth.user?.userId || auth.user?.id
    if (!uid) {
      showToast('登录状态异常')
      return
    }
    likeLoading = true
    const nextLiked = !liked
    const trackId = track.id
    try {
      await ncm.like(trackId, nextLiked, uid)
      if (track?.id !== trackId) return
      liked = nextLiked
      showToast(nextLiked ? '已添加到我喜欢' : '已取消喜欢')
    } catch {
      showToast('操作失败')
    } finally {
      if (track?.id === trackId) likeLoading = false
    }
  }

  async function ensurePlaylists() {
    if (!auth.isLoggedIn) {
      showToast('请先登录')
      return false
    }
    const uid = auth.user?.userId || auth.user?.id
    if (!uid) {
      showToast('登录状态异常')
      return false
    }
    if (userPlaylists.length > 0 && userPlaylistsOwnerId === uid) return true
    if (loadingPlaylists) return false
    loadingPlaylists = true
    try {
      const res = await ncm.userPlaylist(uid)
      userPlaylists = (res.playlist || [])
        .filter(playlist => isEditablePlaylist(playlist, uid))
        .slice(0, 80)
      userPlaylistsOwnerId = uid
      return true
    } catch {
      showToast('歌单加载失败')
      return false
    } finally {
      loadingPlaylists = false
    }
  }

  async function openPlaylistPanel(mode) {
    if (!auth.isLoggedIn) {
      showToast('请先登录')
      return
    }
    playlistMode = mode
    await ensurePlaylists()
  }

  async function applyPlaylist(plId) {
    if (!track?.id || playlistApplyingId) return
    const mode = playlistMode
    const trackId = track.id
    playlistApplyingId = plId
    try {
      if (mode === 'remove') {
        await ncm.playlistRemoveTrack(plId, trackId)
        updatePlaylistCount(plId, -1)
        showToast('已从歌单移除')
      } else {
        await ncm.playlistAddTrack(plId, trackId)
        updatePlaylistCount(plId, 1)
        showToast('已添加到歌单')
      }
      playlistMode = 'menu'
    } catch {
      showToast(mode === 'remove' ? '移除失败' : '添加失败')
    } finally {
      if (Number(playlistApplyingId) === Number(plId)) playlistApplyingId = null
    }
  }

  function updatePlaylistCount(plId, delta) {
    userPlaylists = userPlaylists.map(playlist => {
      if (Number(playlist.id) !== Number(plId)) return playlist
      const trackCount = Math.max(0, (playlist.trackCount || 0) + delta)
      return { ...playlist, trackCount }
    })
  }

  function openArtist() {
    const artist = firstArtist(track)
    if (artist?.id) {
      onOpenArtist?.(artist.id)
      onClose?.()
    } else {
      showToast('没有歌手信息')
    }
  }

  function openAlbum() {
    const album = albumOf(track)
    if (album?.id) {
      onOpenAlbum?.(album.id)
      onClose?.()
    } else {
      showToast('没有专辑信息')
    }
  }

  function copyLink() {
    if (!track?.id) return
    navigator.clipboard?.writeText(`https://music.163.com/#/song?id=${track.id}`).catch(() => {})
    showToast('已复制歌曲链接')
  }

  function handleContextmenu(event) {
    event.preventDefault()
  }
</script>

{#if show && track}
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
        {#if albumOf(track)?.picUrl || track.picUrl}
          <img src={coverUrl(albumOf(track)?.picUrl || track.picUrl, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
        {:else}
          <span>♫</span>
        {/if}
      </div>
      <div class="song-menu__title">
        <strong>{track.name || '未知歌曲'}</strong>
        <span>{artistText(track) || '未知歌手'}</span>
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
        <button class="song-menu__item" onclick={openArtist} disabled={!firstArtist(track)?.id}>
          <span class="song-menu__icon"><Icon name="user" size={16} /></span>
          <span>查看歌手</span>
        </button>
        <button class="song-menu__item" onclick={openAlbum} disabled={!albumOf(track)?.id}>
          <span class="song-menu__icon"><Icon name="music" size={16} /></span>
          <span>查看专辑</span>
          {#if albumName(track)}<em>{albumName(track)}</em>{/if}
        </button>
      </div>

      <div class="song-menu__group compact">
        <button class="song-menu__item" onclick={copyLink}>
          <span class="song-menu__icon"><Icon name="link" size={16} /></span>
          <span>复制链接</span>
        </button>
      </div>
    {:else}
      <div class="song-menu__panel-head">
        <button onclick={() => playlistMode = 'menu'} aria-label="返回"><Icon name="chevron-left" size={18} fill="none" /></button>
        <div>
          <strong>{playlistMode === 'remove' ? '从歌单移除' : '添加到歌单'}</strong>
          <span>{track.name}</span>
        </div>
      </div>
      <div class="song-menu__playlists">
        {#if loadingPlaylists}
          <div class="song-menu__state">正在加载歌单…</div>
        {:else if userPlaylists.length === 0}
          <div class="song-menu__state">没有可用歌单</div>
        {:else}
          {#each userPlaylists as playlist (playlist.id)}
            <button class="song-menu__playlist" onclick={() => applyPlaylist(playlist.id)} disabled={playlistApplyingId !== null}>
              {#if playlist.coverImgUrl || playlist.picUrl}
                <img src={coverUrl(playlist.coverImgUrl || playlist.picUrl, 72)} alt="" loading="lazy" referrerpolicy="no-referrer" />
              {:else}
                <span class="song-menu__playlist-cover">♫</span>
              {/if}
              <span>
                <strong>{playlist.name}</strong>
                <em>{Number(playlistApplyingId) === Number(playlist.id) ? '处理中' : `${playlist.trackCount ?? 0} 首`}</em>
              </span>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
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
  .song-menu__panel-head,
  .song-menu__group,
  .song-menu__playlists {
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

  .song-menu__cover span,
  .song-menu__playlist-cover {
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
  .song-menu__title span,
  .song-menu__playlist strong,
  .song-menu__playlist em,
  .song-menu__panel-head span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .song-menu__title strong {
    font-size: 14px;
    font-weight: 500;
  }

  .song-menu__title span,
  .song-menu__panel-head span {
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

  .song-menu__panel-head {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    padding: 5px 6px 9px;
    border-bottom: 1px solid var(--border);
  }

  .song-menu__panel-head button {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }

  .song-menu__panel-head button:hover {
    background: var(--bg-hover);
  }

  .song-menu__panel-head div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .song-menu__panel-head strong {
    font-size: 14px;
    font-weight: 500;
  }

  .song-menu__playlists {
    display: grid;
    gap: 1px;
    max-height: min(390px, calc(100vh - 148px));
    overflow-y: auto;
    padding: 6px 0 0;
  }

  .song-menu__playlist {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    width: 100%;
    min-height: 46px;
    padding: 5px 6px;
    border: none;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }

  .song-menu__playlist:hover {
    background: var(--bg-hover);
  }

  .song-menu__playlist img,
  .song-menu__playlist-cover {
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    object-fit: cover;
  }

  .song-menu__playlist span {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .song-menu__playlist strong {
    font-size: 13px;
    font-weight: 500;
  }

  .song-menu__playlist em,
  .song-menu__state {
    color: var(--text-tertiary);
    font-size: 11px;
    font-style: normal;
  }

  .song-menu__state {
    padding: 22px 10px;
    text-align: center;
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
