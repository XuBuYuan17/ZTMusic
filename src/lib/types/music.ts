/**
 * 音乐领域中立模型。
 *
 * Provider（src/lib/music/）负责把各平台的原始响应映射成本文件的类型；
 * UI / 播放器只依赖这里的中立类型，不直接消费平台原始字段。
 */

export type ProviderId = string

export type SongId = string | number

export type TrackSource = 'online' | 'local' | 'webdav'

export interface Artist {
  id: SongId
  name: string
  imageUrl?: string
}

export interface Album {
  id: SongId
  name: string
  coverUrl?: string
}

/**
 * 网易云风格的旧字段引用。播放器和部分 UI 仍在直接读取，
 * 映射层在过渡期继续保证它们存在。
 * @deprecated 新代码用 artists / album。
 */
export interface LegacyArtistRef {
  id?: SongId
  name?: string
  picUrl?: string
  [key: string]: unknown
}

/** @deprecated 新代码用 album。 */
export interface LegacyAlbumRef {
  id?: SongId
  name?: string
  picUrl?: string
  [key: string]: unknown
}

export interface Song {
  id: SongId
  providerId: ProviderId
  sourceId: SongId
  name: string
  artists: Artist[]
  album?: Album
  durationMs: number
  coverUrl: string
  source?: TrackSource

  /** @deprecated 改用 artists，播放器仍在读，勿删 */
  ar: LegacyArtistRef[]
  /** @deprecated 改用 album，播放器仍在读，勿删 */
  al: LegacyAlbumRef
  /** @deprecated 改用 durationMs */
  dt: number
  /** @deprecated 改用 coverUrl */
  picUrl: string
}

export interface LyricLine {
  /** 秒，与 LRC 时间轴一致 */
  time: number
  text: string
  translation?: string
}

export interface PlayStream {
  url: string
  /** 音质档位，如 standard / higher / exhigh / lossless */
  level?: string
  /** 来源标记：official / official-unblock / match / old-api */
  source?: string
  code?: number
  message?: string
  isTrial?: boolean
  cacheable?: boolean
}

export interface HotSearchItem {
  keyword: string
  score: number
}

export interface SearchOptions {
  songLimit?: number
  artistLimit?: number
  playlistLimit?: number
  offset?: number
}

export interface StreamOptions {
  level?: string
  unblock?: boolean
}

/** 搜索结果中的歌手（比 Artist 多统计字段） */
export interface ProviderArtist extends Artist {
  providerId: ProviderId
  sourceId: SongId
  trackCount: number
  albumCount: number
  /** @deprecated 旧字段，等同 imageUrl */
  picUrl?: string
  musicSize?: number
  albumSize?: number
  [key: string]: unknown
}

export interface ProviderPlaylist {
  id: SongId
  providerId: ProviderId
  sourceId: SongId
  name: string
  coverUrl: string
  trackCount: number
  creatorName: string
  /** @deprecated 旧字段，等同 coverUrl */
  picUrl?: string
  /** @deprecated 旧字段，等同 creatorName */
  creator?: string
}

export interface SearchResult {
  songs: Song[]
  artists: ProviderArtist[]
  playlists: ProviderPlaylist[]
}

/** 专辑：mapAlbum 会保留原始响应的其余字段 */
export interface ProviderAlbum extends Album {
  providerId: ProviderId
  sourceId: SongId
  coverUrl: string
  /** @deprecated 旧字段，等同 coverUrl */
  picUrl?: string
  blurPicUrl?: string
  [key: string]: unknown
}

export interface AlbumDetail {
  album: ProviderAlbum | null
  songs: Song[]
}

export interface ArtistDetail {
  artist: ProviderArtist & {
    cover?: string
    avatar?: string
    alias?: unknown[]
    identities?: string[]
    briefDesc?: string
    followed?: boolean
  }
  songs: Song[]
  albums: ProviderAlbum[]
}

export interface PlaylistDetail {
  id: SongId
  providerId: ProviderId
  sourceId: SongId
  name: string
  coverUrl: string
  tracks: Song[]
  [key: string]: unknown
}
