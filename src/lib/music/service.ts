import { MusicProviderRegistry, type MusicProviderDefinition, type RegisterOptions } from './provider.ts'
import type {
  AlbumDetail,
  ArtistDetail,
  HotSearchItem,
  LyricLine,
  PlayStream,
  PlaylistDetail,
  SearchOptions,
  SearchResult,
  Song,
  SongId,
  StreamOptions,
} from '../types/music.ts'
import { createNeteaseProvider } from './providers/netease.ts'

export const musicProviders = new MusicProviderRegistry()
musicProviders.register(createNeteaseProvider())

export function registerMusicProvider(provider: MusicProviderDefinition, options?: RegisterOptions) {
  return musicProviders.register(provider, options)
}

export function setActiveMusicProvider(id: string): void {
  musicProviders.setActive(id)
}

export function listMusicProviders() {
  return musicProviders.list()
}

/**
 * 页面/组件访问音乐数据的稳定入口。registry 是动态能力表（call 返回 unknown），
 * 领域返回类型在这一层统一收敛，避免 unknown 扩散到 UI。
 */
export const musicService = Object.freeze({
  search(query: string, options?: SearchOptions): Promise<SearchResult> {
    return musicProviders.call('search', query, options) as Promise<SearchResult>
  },
  getHotSearch(): Promise<HotSearchItem[]> {
    return musicProviders.call('getHotSearch') as Promise<HotSearchItem[]>
  },
  getTopSongs(limit?: number): Promise<Song[]> {
    return musicProviders.call('getTopSongs', limit) as Promise<Song[]>
  },
  getLyrics(id: SongId): Promise<LyricLine[]> {
    return musicProviders.call('getLyrics', id) as Promise<LyricLine[]>
  },
  getStream(id: SongId, options?: StreamOptions): Promise<PlayStream> {
    return musicProviders.call('getStream', id, options) as Promise<PlayStream>
  },
  getMatchedStream(id: SongId): Promise<PlayStream> {
    return musicProviders.call('getMatchedStream', id) as Promise<PlayStream>
  },
  getLegacyStream(id: SongId, bitrate?: number): Promise<PlayStream> {
    return musicProviders.call('getLegacyStream', id, bitrate) as Promise<PlayStream>
  },
  getTracks(ids: SongId[]): Promise<Song[]> {
    return musicProviders.call('getTracks', ids) as Promise<Song[]>
  },
  getPlaylist(id: SongId): Promise<PlaylistDetail | null> {
    return musicProviders.call('getPlaylist', id) as Promise<PlaylistDetail | null>
  },
  getAlbum(id: SongId): Promise<AlbumDetail> {
    return musicProviders.call('getAlbum', id) as Promise<AlbumDetail>
  },
  getArtist(id: SongId): Promise<ArtistDetail> {
    return musicProviders.call('getArtist', id) as Promise<ArtistDetail>
  },
})
