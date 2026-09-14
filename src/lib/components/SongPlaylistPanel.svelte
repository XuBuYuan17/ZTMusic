<script lang="ts">
  import type { SongId } from '../types/music.ts'
  import { auth } from '../stores/auth.svelte.ts'
  import { ncm } from '../api/client.ts'
  import { coverUrl } from '../utils/image.ts'
  import Icon from './ui/Icon.svelte'

  interface UserPlaylist {
    id: SongId
    name: unknown
    trackCount?: number
    userId?: SongId
    specialType?: number
    coverImgUrl?: unknown
    picUrl?: unknown
  }

  let {
    active = false,
    mode = 'add',
    trackId = null,
    trackName = '',
    onBack,
    onToast,
  }: {
    active?: boolean
    mode?: 'add' | 'remove'
    trackId?: SongId | null
    trackName?: unknown
    onBack?: () => void
    onToast?: (text: string) => void
  } = $props()

  let userPlaylists = $state<UserPlaylist[]>([])
  let loadingPlaylists = $state(false)
  let userPlaylistsOwnerId = $state<SongId | null>(null)
  let playlistApplyingId = $state<SongId | null>(null)
  let lastTrackId = $state<SongId | null>(null)

  function rec(v: unknown): Record<string, unknown> | null {
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
  }

  function activeUid(): SongId | null {
    const uid: unknown = auth.user?.userId || auth.user?.id
    return typeof uid === 'number' || typeof uid === 'string' ? uid : null
  }

  function isEditablePlaylist(playlist: UserPlaylist, uid: SongId): boolean {
    if (Number(playlist.userId) !== Number(uid)) return false
    return Number(playlist.specialType || 0) !== 5
  }

  async function ensurePlaylists(): Promise<boolean> {
    if (!auth.isLoggedIn) {
      onToast?.('请先登录')
      return false
    }
    const uid = activeUid()
    if (!uid) {
      onToast?.('登录状态异常')
      return false
    }
    if (userPlaylists.length > 0 && userPlaylistsOwnerId === uid) return true
    if (loadingPlaylists) return false
    loadingPlaylists = true
    try {
      const res = await ncm.userPlaylist(uid)
      const rawList = rec(res)?.playlist
      userPlaylists = (Array.isArray(rawList) ? rawList : [])
        .map(p => rec(p) as UserPlaylist | null)
        .filter((p): p is UserPlaylist => p !== null && isEditablePlaylist(p, uid))
        .slice(0, 80)
      userPlaylistsOwnerId = uid
      return true
    } catch {
      onToast?.('歌单加载失败')
      return false
    } finally {
      loadingPlaylists = false
    }
  }

  function updatePlaylistCount(plId: SongId, delta: number): void {
    userPlaylists = userPlaylists.map(playlist => {
      if (Number(playlist.id) !== Number(plId)) return playlist
      const trackCount = Math.max(0, (playlist.trackCount || 0) + delta)
      return { ...playlist, trackCount }
    })
  }

  async function applyPlaylist(plId: SongId): Promise<void> {
    if (!trackId || playlistApplyingId) return
    const applyMode = mode
    const currentTrackId = trackId
    playlistApplyingId = plId
    try {
      if (applyMode === 'remove') {
        await ncm.playlistRemoveTrack(plId, currentTrackId)
        updatePlaylistCount(plId, -1)
        onToast?.('已从歌单移除')
      } else {
        await ncm.playlistAddTrack(plId, currentTrackId)
        updatePlaylistCount(plId, 1)
        onToast?.('已添加到歌单')
      }
      onBack?.()
    } catch {
      onToast?.(applyMode === 'remove' ? '移除失败' : '添加失败')
    } finally {
      if (Number(playlistApplyingId) === Number(plId)) playlistApplyingId = null
    }
  }

  // 面板首次激活时加载歌单；返回主菜单后保留缓存（菜单关闭即随 portal 销毁）
  $effect(() => {
    if (active) void ensurePlaylists()
  })

  $effect(() => {
    if (!auth.isLoggedIn) {
      userPlaylists = []
      userPlaylistsOwnerId = null
      playlistApplyingId = null
    }
  })

  $effect(() => {
    if (trackId !== lastTrackId) {
      lastTrackId = trackId
      playlistApplyingId = null
    }
  })
</script>

<div class="song-menu__panel-head">
  <button onclick={() => onBack?.()} aria-label="返回"><Icon name="chevron-left" size={18} fill="none" /></button>
  <div>
    <strong>{mode === 'remove' ? '从歌单移除' : '添加到歌单'}</strong>
    <span>{trackName}</span>
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

<style>
  .song-menu__panel-head,
  .song-menu__playlists {
    position: relative;
    z-index: 1;
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

  .song-menu__panel-head span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-tertiary);
    font-size: 12px;
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

  .song-menu__playlist-cover {
    display: grid;
    place-items: center;
    background: var(--bg-surface);
    color: var(--text-tertiary);
  }

  .song-menu__playlist span {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .song-menu__playlist strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
</style>
