export type PlaylistSortKey = 'added' | 'title' | 'artist' | 'duration'
export type PlaylistSortDir = 'asc' | 'desc'

export interface SortablePlaylistTrack {
  name?: unknown
  ar?: unknown
  artists?: unknown
  al?: unknown
  album?: unknown
  dt?: number
  duration?: number
  addTime?: number
  addedAt?: number
  playlistIndex?: number
}

const textCollator = new Intl.Collator('zh-CN-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
})

function rec(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function playlistArtistText(track: SortablePlaylistTrack): string {
  const artists = Array.isArray(track.artists) ? track.artists : Array.isArray(track.ar) ? track.ar : []
  return artists.map(artist => text(rec(artist)?.name)).filter(Boolean).join(' / ')
}

export function playlistAddedTime(track: SortablePlaylistTrack): number {
  return track.addTime || track.addedAt || 0
}

export function playlistDuration(track: SortablePlaylistTrack): number {
  return track.duration || track.dt || 0
}

export function playlistSearchText(track: SortablePlaylistTrack): string {
  const album = rec(track.album)?.name || rec(track.al)?.name || ''
  return [track.name, playlistArtistText(track), album].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN')
}

/** 排序键的展示名（工具栏与表头共用，避免两处各写一份） */
export function playlistSortLabel(sort: PlaylistSortKey): string {
  if (sort === 'title') return '歌曲'
  if (sort === 'artist') return '歌手'
  if (sort === 'duration') return '时长'
  return '加入时间'
}

/** 排序方向展示名；不同排序键的方向语义不同 */
export function playlistSortDirectionLabel(sort: PlaylistSortKey, direction: PlaylistSortDir): string {
  if (sort === 'added') return direction === 'desc' ? '最新优先' : '最早优先'
  if (sort === 'duration') return direction === 'desc' ? '从长到短' : '从短到长'
  return direction === 'asc' ? 'A 到 Z' : 'Z 到 A'
}

export function playlistAriaSort(
  sort: PlaylistSortKey,
  direction: PlaylistSortDir,
  key: PlaylistSortKey,
): 'ascending' | 'descending' | 'none' {
  if (sort !== key) return 'none'
  return direction === 'asc' ? 'ascending' : 'descending'
}

function compareOptionalNumber(a: number, b: number, direction: number): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return (a - b) * direction
}

export function filterAndSortPlaylistTracks<T extends SortablePlaylistTrack>(
  tracks: T[],
  search: string,
  sort: PlaylistSortKey,
  direction: PlaylistSortDir,
): T[] {
  const keyword = search.trim().toLocaleLowerCase('zh-CN')
  const filtered = keyword ? tracks.filter(track => playlistSearchText(track).includes(keyword)) : [...tracks]
  const dir = direction === 'asc' ? 1 : -1

  return filtered.sort((a, b) => {
    let result = 0
    if (sort === 'title') result = textCollator.compare(text(a.name), text(b.name)) * dir
    else if (sort === 'artist') result = textCollator.compare(playlistArtistText(a), playlistArtistText(b)) * dir
    else if (sort === 'duration') result = (playlistDuration(a) - playlistDuration(b)) * dir
    else result = compareOptionalNumber(playlistAddedTime(a), playlistAddedTime(b), dir)

    return result || (a.playlistIndex ?? 0) - (b.playlistIndex ?? 0)
  })
}
