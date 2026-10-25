/**
 * 歌曲行的统一数据输入。
 *
 * 各个页面（歌单、搜索、喜欢、最近播放…）拿到的字段名不一样（`ar`/`artists`、
 * `al`/`album`、`dt`/`duration`），这里一次性归一成渲染需要的形状；缺名称、缺歌手、
 * 缺专辑、缺封面、缺时长都有稳定输出，不靠模板里层层 `?.#if`。
 *
 * 只做纯数据转换，不请求任何接口、不读播放器。
 */
import type { SongId } from '../types/music.ts'
import { formatDuration } from '../format.ts'
import { playlistAddedTime, playlistDuration } from '../pages/playlist-sort.ts'

export interface SongRowArtist {
  id?: SongId
  name: string
}

export interface SongRowData {
  id: SongId
  /** 原始 track：右键菜单等仍需要完整字段的地方用它 */
  source: unknown
  name: string
  artists: SongRowArtist[]
  album: { id?: SongId; name: string } | null
  cover: string
  durationMs: number
  durationLabel: string
  addedAt: number
  addedLabel: string
  addedTitle: string
}

const MISSING = '—'

function rec(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function idOf(value: unknown): SongId | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function addedLabel(time: number): string {
  if (!time) return MISSING
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}.${month}.${day}`
}

export function toSongRow(track: unknown): SongRowData {
  const raw = rec(track) ?? {}
  const albumRaw = rec(raw.al) || rec(raw.album)
  const rawArtists = Array.isArray(raw.artists) ? raw.artists : Array.isArray(raw.ar) ? raw.ar : []
  const artists: SongRowArtist[] = []
  for (const entry of rawArtists) {
    const artist = rec(entry)
    const name = textOf(artist?.name)
    const id = idOf(artist?.id)
    if (name || id !== undefined) artists.push({ id, name })
  }
  const durationMs = playlistDuration(raw as never)
  const addedAt = playlistAddedTime(raw as never)
  return {
    id: idOf(raw.id) ?? '',
    source: track,
    name: textOf(raw.name),
    artists,
    album: albumRaw ? { id: idOf(albumRaw.id), name: textOf(albumRaw.name) } : null,
    cover: textOf(raw.picUrl) || textOf(albumRaw?.picUrl),
    durationMs,
    durationLabel: durationMs ? formatDuration(durationMs) : MISSING,
    addedAt,
    addedLabel: addedLabel(addedAt),
    addedTitle: addedAt ? new Date(addedAt).toLocaleString('zh-CN') : '没有加入时间',
  }
}

/** 批量归一；列表只吃归一后的行 */
export function toSongRows(tracks: readonly unknown[]): SongRowData[] {
  return tracks.map(toSongRow)
}

/**
 * 渲染用的 key：同一个歌单里可能有重复曲目（同一首歌加两次），
 * 只用 id 做 key 会直接冲突，所以按「id + 第几次出现」生成。
 */
export function withRowKeys(rows: SongRowData[]): Array<{ key: string; row: SongRowData }> {
  const seen = new Map<string, number>()
  return rows.map(row => {
    const base = String(row.id)
    const occurrence = seen.get(base) ?? 0
    seen.set(base, occurrence + 1)
    return { key: `${base}#${occurrence}`, row }
  })
}
