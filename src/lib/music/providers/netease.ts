import { ncm } from '../../api/client.ts'
import { normalizeSong } from '../../utils/normalize.ts'
import { parseLyricResponse } from '../../utils/lyrics.ts'
import { defineMusicProvider, type MusicProvider } from '../provider.ts'
import type {
  AlbumDetail,
  ArtistDetail,
  HotSearchItem,
  LegacyAlbumRef,
  LegacyArtistRef,
  LyricLine,
  PlayStream,
  PlaylistDetail,
  ProviderAlbum,
  ProviderArtist,
  ProviderPlaylist,
  SearchResult,
  Song,
  SongId,
  StreamOptions,
} from '../../types/music.ts'

// ── 外部 API 响应是宽松 JSON，统一在边界处收窄，不让 any 向内扩散 ──

type NcmRecord = Record<string, unknown>

function asRecord(value: unknown): NcmRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as NcmRecord
    : {}
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function isSong(value: Song | null): value is Song {
  return value !== null
}

/** 网易云端点客户端：本 provider 实际用到的 ncm 方法子集 */
export interface NeteaseApi {
  cloudsearch(keyword: string, limit: number, offset: number): Promise<unknown>
  searchArtists(keyword: string, limit: number, offset: number): Promise<unknown>
  searchPlaylists(keyword: string, limit: number, offset: number): Promise<unknown>
  searchHot(): Promise<unknown>
  topSongs(category: number): Promise<unknown>
  lyric(id: SongId): Promise<unknown>
  songUrl(id: SongId, level: string, unblock: boolean): Promise<unknown>
  songUrlMatch(id: SongId): Promise<unknown>
  songUrlOld(id: SongId, bitrate: number): Promise<unknown>
  songDetail(ids: SongId[]): Promise<unknown>
  playlistDetail(id: SongId): Promise<unknown>
  album(id: SongId): Promise<unknown>
  artistDetail(id: SongId): Promise<unknown>
  artistSongs(id: SongId, limit: number): Promise<unknown>
  artistAlbums(id: SongId, limit: number): Promise<unknown>
}

// ── mapping layer：网易云原始结构 → ZTMusic 中立领域模型 ──

function mapSong(input: unknown): Song | null {
  const song = normalizeSong(input) as (NcmRecord & {
    id?: SongId
    dt?: number
    picUrl?: string
    ar?: unknown
    al?: unknown
  }) | null
  if (!song?.id) return null
  const rawArtists = asArray<NcmRecord>(song.ar)
  const album = asRecord(song.al)
  const artists = rawArtists.map((artist) => ({
    id: artist.id as SongId,
    name: asString(artist.name),
  }))
  const coverUrl = asString(song.picUrl)
  return {
    ...song,
    id: song.id,
    name: asString(song.name),
    providerId: 'netease',
    sourceId: song.id,
    artists,
    album: {
      id: album.id as SongId,
      name: asString(album.name),
      coverUrl: coverUrl || asString(album.picUrl),
    },
    durationMs: typeof song.dt === 'number' ? song.dt : 0,
    coverUrl,
    // 兼容字段：播放器/UI 过渡期仍在读 ar/al/dt/picUrl
    ar: asArray<LegacyArtistRef>(song.ar),
    al: (song.al ?? {}) as LegacyAlbumRef,
    dt: typeof song.dt === 'number' ? song.dt : 0,
    picUrl: coverUrl,
  }
}

function mapArtist(input: unknown): ProviderArtist | null {
  const artist = asRecord(input)
  if (!artist.id) return null
  const imageUrl = asString(artist.picUrl) || asString(artist.cover) || asString(artist.avatar)
    || asString(artist.img1v1Url) || asString(artist.img1Url)
  return {
    providerId: 'netease',
    sourceId: artist.id as SongId,
    id: artist.id as SongId,
    name: asString(artist.name),
    imageUrl,
    trackCount: asNumber(artist.musicSize),
    albumCount: asNumber(artist.albumSize),
    picUrl: imageUrl,
    musicSize: asNumber(artist.musicSize),
    albumSize: asNumber(artist.albumSize),
  }
}

function mapPlaylist(input: unknown): ProviderPlaylist | null {
  const playlist = asRecord(input)
  if (!playlist.id) return null
  const coverUrl = asString(playlist.coverImgUrl) || asString(playlist.picUrl)
  const creatorName = asString(asRecord(playlist.creator).nickname) || asString(playlist.creatorName)
  return {
    providerId: 'netease',
    sourceId: playlist.id as SongId,
    id: playlist.id as SongId,
    name: asString(playlist.name),
    coverUrl,
    trackCount: asNumber(playlist.trackCount),
    creatorName,
    picUrl: coverUrl,
    creator: creatorName,
  }
}

function mapAlbum(input: unknown): ProviderAlbum | null {
  const album = asRecord(input)
  if (!album.id) return null
  const coverUrl = asString(album.picUrl) || asString(album.blurPicUrl) || asString(album.coverImgUrl)
  return {
    ...album,
    providerId: 'netease',
    sourceId: album.id as SongId,
    id: album.id as SongId,
    name: asString(album.name),
    coverUrl,
    picUrl: coverUrl,
  }
}

export function createNeteaseProvider(api: NeteaseApi = ncm as NeteaseApi): MusicProvider {
  return defineMusicProvider({
    id: 'netease',
    name: '网易云音乐',

    async search(query: string, { songLimit = 30, artistLimit = 16, playlistLimit = 16, offset = 0 } = {}): Promise<SearchResult> {
      const keyword = String(query || '').trim()
      if (!keyword) return { songs: [], artists: [], playlists: [] }
      const [songRes, artistRes, playlistRes] = await Promise.all([
        api.cloudsearch(keyword, songLimit, offset).catch(() => ({})),
        api.searchArtists(keyword, artistLimit, offset).catch(() => ({})),
        api.searchPlaylists(keyword, playlistLimit, offset).catch(() => ({})),
      ])
      return {
        songs: asArray<unknown>(asRecord(asRecord(songRes).result).songs).map(mapSong).filter(isSong),
        artists: asArray<unknown>(asRecord(asRecord(artistRes).result).artists).map(mapArtist).filter((a): a is ProviderArtist => a !== null),
        playlists: asArray<unknown>(asRecord(asRecord(playlistRes).result).playlists).map(mapPlaylist).filter((p): p is ProviderPlaylist => p !== null),
      }
    },

    async getHotSearch(): Promise<HotSearchItem[]> {
      const response = asRecord(await api.searchHot())
      const items = asArray<NcmRecord>(asRecord(response.result).hots || response.data)
      return items.map((item) => ({
        keyword: asString(item.searchWord) || asString(item.first),
        score: asNumber(item.score),
      })).filter((item) => item.keyword)
    },

    async getTopSongs(limit = 12): Promise<Song[]> {
      const response = asRecord(await api.topSongs(0))
      return asArray<unknown>(response.data).slice(0, limit).map(mapSong).filter(isSong)
    },

    async getLyrics(id: SongId): Promise<LyricLine[]> {
      const response = await api.lyric(id)
      return parseLyricResponse(response || {}).lines.map((line: { time: number; content?: string; translation?: string; roman?: string }) => ({
        time: line.time,
        text: line.content?.trim() || line.translation?.trim() || line.roman?.trim() || '',
        translation: line.translation?.trim() || '',
      })).filter((line: LyricLine) => line.text)
    },

    async getStream(id: SongId, { level = 'standard', unblock = false } = {}): Promise<PlayStream> {
      const response = asRecord(await api.songUrl(id, level, unblock))
      const item = asRecord(asArray<unknown>(response.data)[0])
      const code = typeof item.code === 'number' ? item.code
        : typeof response.code === 'number' ? response.code
        : undefined
      return {
        url: asString(item.url),
        code,
        message: asString(item.message) || asString(response.message) || asString(response.msg),
        isTrial: Boolean(item.freeTrialInfo),
        level,
        source: unblock ? 'official-unblock' : 'official',
        cacheable: !item.freeTrialInfo,
      }
    },

    async getMatchedStream(id: SongId): Promise<PlayStream> {
      const response = asRecord(await api.songUrlMatch(id))
      const data = response.data
      const firstUrl = asString(asRecord(asArray<unknown>(data)[0]).url)
      const objectUrl = asString(asRecord(data).url)
      return { url: firstUrl || objectUrl || asString(response.url), source: 'match', cacheable: true }
    },

    async getLegacyStream(id: SongId, bitrate = 320000): Promise<PlayStream> {
      const response = asRecord(await api.songUrlOld(id, bitrate))
      return { url: asString(asRecord(asArray<unknown>(response.data)[0]).url), source: 'old-api', cacheable: false }
    },

    async getTracks(ids: SongId[]): Promise<Song[]> {
      const response = asRecord(await api.songDetail(ids))
      return asArray<unknown>(response.songs).map(mapSong).filter(isSong)
    },

    async getPlaylist(id: SongId): Promise<PlaylistDetail | null> {
      const response = asRecord(await api.playlistDetail(id))
      const playlist = asRecord(response.playlist)
      if (!playlist.id) return null
      const coverUrl = asString(playlist.coverImgUrl) || asString(playlist.picUrl)
      return {
        ...playlist,
        providerId: 'netease',
        sourceId: (playlist.id ?? id) as SongId,
        id: playlist.id as SongId,
        name: asString(playlist.name),
        coverUrl,
        coverImgUrl: coverUrl,
        picUrl: coverUrl,
        tracks: asArray<unknown>(playlist.tracks).map(mapSong).filter(isSong),
      }
    },

    async getAlbum(id: SongId): Promise<AlbumDetail> {
      const response = asRecord(await api.album(id))
      const album = mapAlbum(response.album || { id })
      const songs = asArray<unknown>(response.songs || asRecord(response.album).songs)
      return { album, songs: songs.map(mapSong).filter(isSong) }
    },

    async getArtist(id: SongId): Promise<ArtistDetail> {
      const [detailRes, songsRes, albumsRes] = await Promise.all([
        api.artistDetail(id).catch(() => null),
        api.artistSongs(id, 50).catch(() => ({ songs: [] })),
        api.artistAlbums(id, 30).catch(() => ({ hotAlbums: [] })),
      ])
      const detail = asRecord(detailRes)
      const detailData = asRecord(detail.data)
      const songsPayload = asRecord(songsRes)
      const albumsPayload = asRecord(albumsRes)
      const raw = asRecord(detailData.artist || detail.artist || albumsPayload.artist)
      const baseArtist: NcmRecord = { ...raw, id: raw.id || id, name: raw.name || '未知歌手' }
      const mappedArtist = mapArtist(baseArtist)
      if (!mappedArtist) throw new Error('Netease artist mapping produced no result')
      const identify = asRecord(detailData.identify)
      const rawIdentities = asArray<string>(raw.identities)
      const artist: ArtistDetail['artist'] = {
        ...mappedArtist,
        cover: asString(raw.cover) || asString(raw.picUrl),
        avatar: asString(raw.avatar) || asString(raw.img1v1Url) || asString(raw.picUrl),
        alias: asArray<unknown>(raw.alias || raw.transNames),
        identities: rawIdentities.length
          ? rawIdentities
          : typeof identify.imageDesc === 'string' ? identify.imageDesc.split('、') : [],
        briefDesc: asString(raw.briefDesc),
        followed: Boolean(raw.followed || asRecord(detailData.user).followed),
      }
      return {
        artist,
        songs: asArray<unknown>(songsPayload.songs || asRecord(songsPayload.data).songs).map(mapSong).filter(isSong),
        albums: asArray<unknown>(albumsPayload.hotAlbums || asRecord(albumsPayload.album).albums).map(mapAlbum).filter((a): a is ProviderAlbum => a !== null),
      }
    },
  } satisfies Omit<MusicProvider, 'capabilities'>)
}
