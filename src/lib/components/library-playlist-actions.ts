/**
 * 资料库歌单的账号管理动作。
 *
 * 政策（谁能编辑/删除/取消收藏）与执行（调接口、判 code、给文案）都放在这里，
 * 卡片只负责展示与触发，不直接写账号数据。
 */
import type { SongId } from '../types/music.ts'

export type LibraryPlaylistKind = 'liked' | 'owned' | 'saved'

export type LibraryPlaylistActionId = 'edit' | 'delete' | 'unsubscribe'

export interface LibraryPlaylistAction {
  id: LibraryPlaylistActionId
  label: string
  icon: string
  danger: boolean
}

/**
 * 归属决定动作：
 * - owned（自己创建）：编辑、删除
 * - saved（收藏来的）：取消收藏
 * - liked（我喜欢的音乐）：没有任何管理动作
 */
export function libraryPlaylistActions(kind: LibraryPlaylistKind): LibraryPlaylistAction[] {
  if (kind === 'owned') {
    return [
      { id: 'edit', label: '编辑歌单', icon: 'edit', danger: false },
      { id: 'delete', label: '删除歌单', icon: 'trash', danger: true },
    ]
  }
  if (kind === 'saved') {
    return [{ id: 'unsubscribe', label: '取消收藏', icon: 'heart', danger: true }]
  }
  return []
}

export interface PlaylistMutationApi {
  playlistDelete(id: SongId): Promise<unknown>
  playlistSubscribe(id: SongId, subscribe: boolean): Promise<unknown>
}

export type PlaylistMutationResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

const SUCCESS_MESSAGE: Record<'delete' | 'unsubscribe', string> = {
  delete: '已删除歌单',
  unsubscribe: '已取消收藏',
}

const FAILURE_MESSAGE: Record<'delete' | 'unsubscribe', string> = {
  delete: '删除失败',
  unsubscribe: '操作失败',
}

export function libraryPlaylistActionOf(kind: LibraryPlaylistKind, id: LibraryPlaylistActionId): LibraryPlaylistAction | null {
  return libraryPlaylistActions(kind).find(action => action.id === id) ?? null
}

/**
 * 执行一个管理动作。
 *
 * 不弹提示、不刷新列表：调用方拿到结果后自己决定（保持页面原有的提示与刷新时机）。
 * 失败时接口不抛也算失败——NCM 把成败放在 body.code 里。
 */
export async function runLibraryPlaylistAction(
  id: 'delete' | 'unsubscribe',
  playlistId: SongId,
  api: PlaylistMutationApi,
): Promise<PlaylistMutationResult> {
  try {
    const response = id === 'delete'
      ? await api.playlistDelete(playlistId)
      : await api.playlistSubscribe(playlistId, false)
    const body = response && typeof response === 'object' ? response as { code?: unknown; message?: unknown; msg?: unknown } : null
    if (body && body.code !== 200) {
      return { ok: false, message: String(body.message || body.msg || FAILURE_MESSAGE[id]) }
    }
    return { ok: true, message: SUCCESS_MESSAGE[id] }
  } catch (error) {
    const message = (error as { message?: unknown } | null | undefined)?.message
    return { ok: false, message: typeof message === 'string' && message ? message : FAILURE_MESSAGE[id] }
  }
}
