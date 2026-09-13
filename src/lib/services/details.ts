import type { ProviderAlbum, Song, SongId } from '../types/music.ts'
import type { ArtistDetail } from '../types/music.ts'
import { coverUrl } from '../utils/image.ts'
import { musicService } from '../music/service.ts'

const SONG_DETAIL_BATCH_SIZE = 500
const INITIAL_PLAYLIST_DETAIL_LIMIT = 500

type Loose = Record<string, unknown>

type ColorExtractor = (imgUrl: string) => Promise<string | null>

interface TrackIdRef {
  id: SongId
  at?: number
  addTime?: number
  time?: number
}

interface PlaylistDetailRecord extends Loose {
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

    const songMap = new Map<SongId, Loose>()
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
      tracks = buildTracks(songMap, loadedCount)
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
