export interface PlaylistGroup {
  id: string
  name: string
  playlistIds: string[]
}

export const PLAYLIST_GROUPS_CHANGE = 'zt-playlist-groups-change'

function keyFor(userId: unknown): string {
  if ((typeof userId !== 'string' && typeof userId !== 'number') || !String(userId).trim()) throw new Error('请先登录')
  return `zt-playlist-groups-v1:${encodeURIComponent(String(userId))}`
}

export function readPlaylistGroups(userId: unknown): PlaylistGroup[] {
  const raw = localStorage.getItem(keyFor(userId))
  if (!raw) return []
  let data: unknown
  try { data = JSON.parse(raw) } catch { throw new Error('本地分组数据无法读取，请勿覆盖原数据') }
  if (!Array.isArray(data) || !data.every(item => item && typeof item.id === 'string' && item.id && typeof item.name === 'string' && item.name.trim() && Array.isArray(item.playlistIds) && item.playlistIds.every((id: unknown) => typeof id === 'string' && id.trim())) || new Set(data.map(item => item.id)).size !== data.length) {
    throw new Error('本地分组数据格式异常，请勿覆盖原数据')
  }
  return data
}

function write(userId: unknown, groups: PlaylistGroup[]): void {
  localStorage.setItem(keyFor(userId), JSON.stringify(groups))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PLAYLIST_GROUPS_CHANGE))
}

function validName(name: string, groups: PlaylistGroup[], except = ''): string {
  const value = name.trim()
  if (!value || value.length > 30) throw new Error('分组名称需为 1–30 个字符')
  if (groups.some(group => group.id !== except && group.name.toLocaleLowerCase() === value.toLocaleLowerCase())) throw new Error('分组名称已存在')
  return value
}

export function createPlaylistGroup(userId: unknown, name: string): void {
  const groups = readPlaylistGroups(userId)
  const cleanName = validName(name, groups)
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  write(userId, [...groups, { id, name: cleanName, playlistIds: [] }])
}

export function renamePlaylistGroup(userId: unknown, id: string, name: string): void {
  const groups = readPlaylistGroups(userId)
  if (!groups.some(group => group.id === id)) throw new Error('分组不存在')
  const cleanName = validName(name, groups, id)
  write(userId, groups.map(group => group.id === id ? { ...group, name: cleanName } : group))
}

export function deletePlaylistGroup(userId: unknown, id: string): void {
  const groups = readPlaylistGroups(userId)
  if (!groups.some(group => group.id === id)) throw new Error('分组不存在')
  write(userId, groups.filter(group => group.id !== id))
}

export function setPlaylistGroupMembership(userId: unknown, playlistId: unknown, groupIds: string[]): void {
  if ((typeof playlistId !== 'string' && typeof playlistId !== 'number') || !String(playlistId).trim()) throw new Error('无法识别歌单')
  const groups = readPlaylistGroups(userId)
  if (groupIds.some(id => !groups.some(group => group.id === id))) throw new Error('分组已变化，请重新选择')
  const target = String(playlistId)
  write(userId, groups.map(group => ({
    ...group,
    playlistIds: groupIds.includes(group.id)
      ? [...new Set([...group.playlistIds, target])]
      : group.playlistIds.filter(id => id !== target),
  })))
}
