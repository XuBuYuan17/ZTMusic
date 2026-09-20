import type { ProviderAlbum, Song, SongId } from '../types/music.ts'
import type { ArtistDetail } from '../types/music.ts'
import { coverUrl } from '../utils/image.ts'
import { musicService } from '../music/service.ts'

const SONG_DETAIL_BATCH_SIZE = 500
const INITIAL_PLAYLIST_DETAIL_LIMIT = 500
const LOAD_MORE_BATCH_SIZE = 500

type Loose = Record<string, unknown>

type ColorExtractor = (imgUrl: string) => Promise<string | null>

interface TrackIdRef {
  id: SongId
  at?: number
  addTime?: number
  time?: number
}

export interface PlaylistDetailRecord extends Loose {
  id: SongId
  coverImgUrl?: string
  tracks: Loose[]
  trackIds?: TrackIdRef[]
  tracksPartial?: boolean
}

export interface PlaylistDetailResult {
  detail: PlaylistDetailRecord | null
  heroColor: string
}

interface AlbumView {
  id: SongId
  name: string
  coverImgUrl: string
  picUrl: string
  creator: { nickname: string }
  trackCount: number
  description: string
  tracks: Song[]
}

export interface AlbumDetailResult {
  detail: AlbumView
  heroColor: string
}

export interface ArtistDetailResult {
  artist: ArtistDetail['artist'] | null
  songs: Song[]
  albums: ProviderAlbum[]
}

function asRecord(value: unknown): Loose {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

async function loadSongsByIds(ids: SongId[]): Promise<Loose[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (!uniqueIds.length) return []
  const chunks: SongId[][] = []
  for (let index = 0; index < uniqueIds.length; index += SONG_DETAIL_BATCH_SIZE) {
    chunks.push(uniqueIds.slice(index, index + SONG_DETAIL_BATCH_SIZE))
  }
  const results = await Promise.all(chunks.map(chunk => musicService.getTracks(chunk).catch(() => [])))
  const songMap = new Map<SongId, Loose>()
  for (const song of results.flat()) songMap.set(song.id, song as unknown as Loose)
  return uniqueIds
    .map(id => songMap.get(id))
    .filter((song): song is Loose => Boolean(song))
}

/**
 * 按 trackIds 顺序重建歌单 tracks：已展示的行始终保留，把新拉取到的详情合并进去，
 * 只增不减。用于分页继续加载（避免并发写入互相覆盖）。limit 为本次覆盖到多少首歌。
 */
export function reconstructPlaylistTracks(
  trackIds: TrackIdRef[],
  existing: Loose[],
  fetched: Loose[],
  limit: number,
): Loose[] {
  const songMap = new Map<SongId, Loose>()
  for (const track of existing) songMap.set(track.id as SongId, track)
  for (const song of fetched) songMap.set(song.id as SongId, song)
  return trackIds.slice(0, limit).map((track, index): Loose | null => {
    const detailTrack = songMap.get(track.id)
    if (!detailTrack) return null
    return {
      ...detailTrack,
      addTime: track.at || track.addTime || track.time || (detailTrack.addTime as number | undefined) || 0,
      playlistIndex: index,
    }
  }).filter((track): track is Loose => track !== null)
}

/** 有限并发跑异步任务，结果保持入参顺序 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await run(items[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * 继续加载歌单剩余曲目（滚动触底 / 播放全部补齐用）。
 * 传入的是 store 里那个 detail 对象（会被原地更新），loadPlaylistMore 每次都从
 * detail.tracks 现重建合并，保持 trackIds 顺序与 playlistIndex 一致。
 */
export async function loadPlaylistMore(
  detail: PlaylistDetailRecord,
  onProgress?: (result: PlaylistDetailResult) => void,
): Promise<PlaylistDetailResult> {
  const activeDetail = detail
  const trackIds = activeDetail.trackIds || []
  if (!trackIds.length) return { detail: activeDetail, heroColor: '' }
  const loadedCount = activeDetail.tracks?.length || 0
  if (loadedCount >= trackIds.length) return { detail: activeDetail, heroColor: '' }

  const batchIds = trackIds.slice(loadedCount, loadedCount + LOAD_MORE_BATCH_SIZE).map(track => track.id)
  const groups: SongId[][] = []
  for (let index = 0; index < batchIds.length; index += 50) {
    groups.push(batchIds.slice(index, index + 50))
  }
  const groupSongs = await mapWithConcurrency(groups, 4, (group) => loadSongsByIds(group).catch(() => []))
  const tracks = reconstructPlaylistTracks(trackIds, activeDetail.tracks || [], groupSongs.flat(), loadedCount + batchIds.length)
  if (tracks.length) activeDetail.tracks = tracks
  activeDetail.tracksPartial = true
  if (onProgress) onProgress({ detail: activeDetail, heroColor: '' })
  return { detail: activeDetail, heroColor: '' }
}

export async function loadPlaylistDetail(
  extractColor: ColorExtractor,
  id: SongId,
  onProgress?: (result: PlaylistDetailResult) => void,
): Promise<PlaylistDetailResult> {
  const detail = (await musicService.getPlaylist(id)) as unknown as PlaylistDetailRecord | null
  if (detail?.trackIds?.length) {
    const activeDetail = detail
    const trackIds = activeDetail.trackIds!
    const fallbackMap = new Map<SongId, Loose>((activeDetail.tracks || []).map(track => [track.id as SongId, track]))
    const shouldDeferFullLoad = trackIds.length > INITIAL_PLAYLIST_DETAIL_LIMIT
    const idsToLoad = (shouldDeferFullLoad
      ? trackIds.slice(0, INITIAL_PLAYLIST_DETAIL_LIMIT).map(track => track.id)
      : trackIds.map(track => track.id))

    let heroColor = '#141414'
    const colorPromise = extractHeroColor(extractColor, activeDetail.coverImgUrl)
      .then((color) => {
        heroColor = color
        if (onProgress) onProgress({ detail: activeDetail, heroColor })
        return color
      })
      .catch(() => '#141414')

    function buildTracks(songMap: Map<SongId, Loose>, limit: number = idsToLoad.length): Loose[] {
      return trackIds.slice(0, limit).map((track, index): Loose | null => {
        const detailTrack = songMap.get(track.id) || fallbackMap.get(track.id) || (shouldDeferFullLoad ? { id: track.id, name: `歌曲 ${track.id}`, ar: [], al: {}, dt: 0 } : null)
        if (!detailTrack) return null
        return {
          ...detailTrack,
          addTime: track.at || track.addTime || track.time || detailTrack.addTime || 0,
          playlistIndex: index,
        }
      }).filter((track): track is Loose => track !== null)
    }

    // 播种当前已展示的行（含 loadMore 追加的部分），保证初期渐进写入只增不减
    const songMap = new Map<SongId, Loose>((activeDetail.tracks || []).map(track => [track.id as SongId, track as Loose]))
    let loadedCount = Math.min(50, idsToLoad.length)
    let tracks = buildTracks(songMap, loadedCount)
    if (tracks.length) activeDetail.tracks = tracks
    if (onProgress) onProgress({ detail: activeDetail, heroColor })

    for (let i = 0; i < idsToLoad.length; i += 50) {
      const batch = idsToLoad.slice(i, i + 50)
      if (!batch.length) continue
      const songs = await loadSongsByIds(batch)
      for (const song of songs) songMap.set(song.id as SongId, song)
      loadedCount = Math.max(loadedCount, i + batch.length)
      tracks = buildTracks(songMap, Math.max(loadedCount, activeDetail.tracks?.length || 0))
      if (tracks.length) activeDetail.tracks = tracks
      if (onProgress) onProgress({ detail: activeDetail, heroColor })
    }

    activeDetail.tracksPartial = shouldDeferFullLoad
    heroColor = await colorPromise
    return { detail: activeDetail, heroColor }
  }
  const heroColor = await extractHeroColor(extractColor, detail?.coverImgUrl)
  return { detail, heroColor }
}

export async function loadAlbumDetail(extractColor: ColorExtractor, id: SongId): Promise<AlbumDetailResult> {
  const response = await musicService.getAlbum(id)
  const album: Loose = (response.album as unknown as Loose) ?? {}
  const songs = response.songs || []
  const artistName = asString(asRecord(album.artist).name)
    || asArray(album.artists).map(artist => typeof artist === 'string' ? artist : asString(asRecord(artist).name)).join(' / ')
    || ''
  const picUrl = asString(album.picUrl)
  const detail: AlbumView = {
    id: (typeof album.id === 'number' || typeof album.id === 'string' ? album.id : undefined) || id,
    name: asString(album.name) || '未知专辑',
    coverImgUrl: picUrl,
    picUrl,
    creator: { nickname: artistName },
    trackCount: toNumber(album.size) || songs.length,
    description: asString(album.description) || asArray(album.alias).join(' / '),
    tracks: songs,
  }
  const heroColor = await extractHeroColor(extractColor, detail.coverImgUrl)
  return { detail, heroColor }
}

export async function loadArtistDetail(id: SongId): Promise<ArtistDetailResult> {
  try {
    return await musicService.getArtist(id)
  } catch {
    return { artist: null, songs: [], albums: [] }
  }
}

async function extractHeroColor(extractColor: ColorExtractor, imageUrl: unknown): Promise<string> {
  if (!imageUrl) return '#141414'
  try {
    const color = await extractColor(coverUrl(imageUrl, 100))
    return color || '#141414'
  } catch {
    return '#141414'
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
