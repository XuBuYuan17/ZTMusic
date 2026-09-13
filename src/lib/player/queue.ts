/**
 * 队列管理
 *
 * 职责：管理播放队列的增删改查、排序模式（列表循环/随机/单曲循环）。
 * 纯函数式逻辑，不涉及播放状态。
 */

import { normalizeImageUrl } from '../utils/image.ts'
import { LIMITS } from '../utils/constants.ts'
import type { PlayMode } from '../types/player.ts'
import type { SongId, TrackSource } from '../types/music.ts'

export interface CompactArtist {
  id: SongId
  name: string
}

export interface CompactAlbum {
  id?: SongId
  name: string
  picUrl: string
}

/**
 * 持久化到 localStorage 的精简曲目。保留 ar/al/dt/picUrl 兼容播放器读取；
 * source 存在时附带本地 / WebDAV 播放所需的全部定位字段。
 */
export interface CompactTrack {
  id: SongId
  name: string
  ar: CompactArtist[]
  al: CompactAlbum
  dt: number
  picUrl: string
  source?: TrackSource
  localId?: SongId
  webdavId?: SongId
  remoteUrl?: string
  webdavBaseUrl?: string
  webdavUsername?: string
  fileName?: string
  relativePath?: string
  mime?: string
  fileSize?: number
}

/** compactTrack 的输入：中立 Song、本地曲目或历史记录，字段全部宽松可选 */
export interface CompactTrackInput {
  id?: SongId | null
  name?: unknown
  ar?: unknown
  artists?: unknown
  al?: unknown
  album?: unknown
  dt?: number
  duration?: number
  coverImgUrl?: string
  picUrl?: string
  source?: TrackSource
  localId?: SongId
  webdavId?: SongId
  remoteUrl?: string
  webdavBaseUrl?: string
  webdavUsername?: string
  fileName?: string
  relativePath?: string
  mime?: string
  fileSize?: number
}

export interface ShuffleState {
  order: number[]
  position: number
}

export interface QueueState {
  queue: CompactTrack[]
  queueIndex: number
  shuffleState: ShuffleState
}

export interface RemoveQueueResult extends QueueState {
  wasCurrent: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 精简曲目对象，仅保留必要字段 */
export function compactTrack(track: CompactTrackInput | null | undefined): CompactTrack | null {
  if (!track) return null
  const album = isRecord(track.al) ? track.al : isRecord(track.album) ? track.album : {}
  const picUrl = normalizeImageUrl(
    (typeof album.picUrl === 'string' ? album.picUrl : '')
      || (typeof album.blurPicUrl === 'string' ? album.blurPicUrl : '')
      || (typeof track.coverImgUrl === 'string' ? track.coverImgUrl : '')
      || (typeof track.picUrl === 'string' ? track.picUrl : ''),
  )
  const rawArtists = Array.isArray(track.ar) ? track.ar : Array.isArray(track.artists) ? track.artists : []
  const compacted: CompactTrack = {
    id: track.id ?? '',
    name: typeof track.name === 'string' ? track.name : '',
    ar: rawArtists.map(compactArtist).filter((a): a is CompactArtist => a !== null),
    al: {
      id: typeof album.id === 'string' || typeof album.id === 'number' ? album.id : undefined,
      name: typeof album.name === 'string' ? album.name : '',
      picUrl,
    },
    dt: typeof track.dt === 'number' ? track.dt : typeof track.duration === 'number' ? track.duration : 0,
    picUrl,
  }
  if (track.source === 'local' || track.source === 'webdav') {
    compacted.source = track.source
    compacted.localId = track.localId || track.id || undefined
    compacted.webdavId = track.webdavId || track.id || undefined
    compacted.remoteUrl = track.remoteUrl || ''
    compacted.webdavBaseUrl = track.webdavBaseUrl || ''
    compacted.webdavUsername = track.webdavUsername || ''
    compacted.fileName = track.fileName || ''
    compacted.relativePath = track.relativePath || ''
    compacted.mime = track.mime || ''
    compacted.fileSize = track.fileSize || 0
  }
  return compacted
}

function compactArtist(artist: unknown): CompactArtist | null {
  if (!isRecord(artist)) return null
  if (typeof artist.id !== 'string' && typeof artist.id !== 'number') return null
  return {
    id: artist.id,
    name: typeof artist.name === 'string' ? artist.name : '',
  }
}

/** 精简队列（限制最大长度） */
export function compactQueue(tracks: unknown): CompactTrack[] {
  return (Array.isArray(tracks) ? tracks : [])
    .slice(0, LIMITS.MAX_QUEUE)
    .map((track) => compactTrack(track as CompactTrackInput))
    .filter((track): track is CompactTrack => track !== null)
}

export function createShuffleState(): ShuffleState {
  return { order: [], position: -1 }
}

export function replaceQueueState(tracks: unknown, startIndex: number = 0): QueueState {
  const queue = compactQueue(tracks)
  const queueIndex = queue.length === 0
    ? -1
    : Math.min(Math.max(Number.isInteger(startIndex) ? startIndex : 0, 0), queue.length - 1)
  return { queue, queueIndex, shuffleState: createShuffleState() }
}

/** 纯重排/删除操作作用于任意队列元素（compact 过的或原始 track），用泛型保留元素类型 */
export function moveQueueItemState<T>(
  queue: readonly T[],
  queueIndex: number,
  fromIndex: number,
  toIndex: number,
): { queue: T[]; queueIndex: number; shuffleState: ShuffleState } | null {
  const source = Array.isArray(queue) ? queue : []
  if (
    !Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
    || fromIndex < 0 || fromIndex >= source.length
    || toIndex < 0 || toIndex >= source.length
    || fromIndex === toIndex
  ) return null

  const nextQueue = [...source]
  const [moved] = nextQueue.splice(fromIndex, 1)
  nextQueue.splice(toIndex, 0, moved!)

  let nextIndex = queueIndex
  if (fromIndex === queueIndex) nextIndex = toIndex
  else if (fromIndex < queueIndex && toIndex >= queueIndex) nextIndex--
  else if (fromIndex > queueIndex && toIndex <= queueIndex) nextIndex++

  return { queue: nextQueue, queueIndex: nextIndex, shuffleState: createShuffleState() }
}

export function removeQueueItemState<T>(
  queue: readonly T[],
  queueIndex: number,
  index: number,
): { queue: T[]; queueIndex: number; shuffleState: ShuffleState; wasCurrent: boolean } | null {
  const source = Array.isArray(queue) ? queue : []
  if (!Number.isInteger(index) || index < 0 || index >= source.length) return null

  const nextQueue = source.filter((_, i) => i !== index)
  const wasCurrent = index === queueIndex
  let nextIndex = queueIndex
  if (nextQueue.length === 0) nextIndex = -1
  else if (wasCurrent) nextIndex = Math.min(index, nextQueue.length - 1)
  else if (index < queueIndex) nextIndex--

  return {
    queue: nextQueue,
    queueIndex: nextIndex,
    shuffleState: createShuffleState(),
    wasCurrent,
  }
}

export interface NextIndexOptions {
  currentIndex: number
  queueLength: number
  mode: PlayMode
  shuffleState?: ShuffleState | null
}

/**
 * 计算下一首的索引（幂等查询，不推进洗牌指针）
 *
 * shuffle 模式下重复调用返回同一个索引，预取只需 peek；
 * 真正切歌时必须紧接着调 commitNextIndex 推进指针，否则会一直停在同一首。
 */
export function getNextIndex({ currentIndex, queueLength, mode, shuffleState }: NextIndexOptions): number {
  if (queueLength === 0) return -1
  if (mode === 'repeat') {
    return currentIndex
  }
  if (mode === 'shuffle') {
    return peekShuffleIndex(queueLength, currentIndex, shuffleState ?? null)
  }
  return (currentIndex + 1) % queueLength
}

export interface CommitNextOptions {
  mode: PlayMode
  shuffleState?: ShuffleState | null
}

/** 确认切歌，推进洗牌指针。只由真正的切歌路径调用（预取不要调）。 */
export function commitNextIndex({ mode, shuffleState }: CommitNextOptions): void {
  if (mode !== 'shuffle' || !shuffleState || !Array.isArray(shuffleState.order)) return
  const pos = shuffleState.position ?? -1
  if (pos < shuffleState.order.length - 1) shuffleState.position = pos + 1
}

function peekShuffleIndex(queueLength: number, currentIndex: number, shuffleState: ShuffleState | null): number {
  if (queueLength <= 1) return 0
  if (!shuffleState) return Math.floor(Math.random() * queueLength)
  const pos = shuffleState.position ?? -1
  // 顺序缺失 / 队列长度变了 / 已走完一轮 → 重新洗牌。
  // 这是唯一会写 shuffleState 的分支，且结果被记住，所以 peek 仍然幂等。
  if (!Array.isArray(shuffleState.order) || shuffleState.order.length !== queueLength || pos >= queueLength - 1) {
    reshuffle(queueLength, currentIndex, shuffleState)
  }
  return shuffleState.order[(shuffleState.position ?? -1) + 1]!
}

function reshuffle(queueLength: number, currentIndex: number, shuffleState: ShuffleState): void {
  const arr = Array.from({ length: queueLength }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  // 新一轮的第一首不要撞上正在播的这首
  if (arr[0] === currentIndex && queueLength > 1) {
    const swapIdx = 1 + Math.floor(Math.random() * (queueLength - 1))
    ;[arr[0], arr[swapIdx]] = [arr[swapIdx]!, arr[0]!]
  }
  shuffleState.order = arr
  shuffleState.position = -1
}

export interface PrevIndexOptions {
  currentIndex: number
  queueLength: number
}

/** 计算上一首的索引 */
export function getPrevIndex({ currentIndex, queueLength }: PrevIndexOptions): number {
  if (queueLength === 0) return -1
  return currentIndex <= 0 ? queueLength - 1 : currentIndex - 1
}
