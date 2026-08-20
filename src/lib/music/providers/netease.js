import { ncm } from '../../api/client.js'
import { normalizeSong } from '../../utils/normalize.js'
import { parseLyricResponse } from '../../utils/lyrics.js'
import { defineMusicProvider } from '../provider.js'

function mapSong(input) {
  const song = normalizeSong(input)
  if (!song?.id) return null
  const artists = (song.ar || []).map(({ id, name }) => ({ id, name }))
  const album = song.al || {}
  return {
    ...song,
    providerId: 'netease',
    sourceId: song.id,
    artists,
    album: { id: album.id, name: album.name || '', coverUrl: song.picUrl || album.picUrl || '' },
    durationMs: song.dt || 0,
    coverUrl: song.picUrl || '',
  }
}

function mapArtist(artist) {
  if (!artist?.id) return null
  const imageUrl = artist.picUrl || artist.cover || artist.avatar || artist.img1v1Url || artist.img1Url || ''
  return {
    providerId: 'netease',
    sourceId: artist.id,
    id: artist.id,
    name: artist.name || '',
    imageUrl,
    trackCount: artist.musicSize || 0,
    albumCount: artist.albumSize || 0,
    picUrl: imageUrl,
    musicSize: artist.musicSize || 0,
    albumSize: artist.albumSize || 0,
  }
}

function mapPlaylist(playlist) {
  if (!playlist?.id) return null
  const coverUrl = playlist.coverImgUrl || playlist.picUrl || ''
  const creatorName = playlist.creator?.nickname || playlist.creatorName || ''
  return {
    providerId: 'netease',
    sourceId: playlist.id,
    id: playlist.id,
    name: playlist.name || '',
    coverUrl,
    trackCount: playlist.trackCount || 0,
    creatorName,
    picUrl: coverUrl,
    creator: creatorName,
  }
}

function mapAlbum(album) {
  if (!album?.id) return null
  const coverUrl = album.picUrl || album.blurPicUrl || album.coverImgUrl || ''
  return {
    ...album,
    providerId: 'netease',
    sourceId: album.id,
    coverUrl,
    picUrl: coverUrl,
  }
}

export function createNeteaseProvider(api = ncm) {
  return defineMusicProvider({
    id: 'netease',
    name: '网易云音乐',

    async search(query, { songLimit = 30, artistLimit = 16, playlistLimit = 16, offset = 0 } = {}) {
      const keyword = String(query || '').trim()
      if (!keyword) return { songs: [], artists: [], playlists: [] }
      const [songRes, artistRes, playlistRes] = await Promise.all([
        api.cloudsearch(keyword, songLimit, offset).catch(() => ({ result: {} })),
        api.searchArtists(keyword, artistLimit, offset).catch(() => ({ result: {} })),
        api.searchPlaylists(keyword, playlistLimit, offset).catch(() => ({ result: {} })),
      ])
      return {
        songs: (songRes?.result?.songs || []).map(mapSong).filter(Boolean),
        artists: (artistRes?.result?.artists || []).map(mapArtist).filter(Boolean),
        playlists: (playlistRes?.result?.playlists || []).map(mapPlaylist).filter(Boolean),
      }
    },

    async getHotSearch() {
      const response = await api.searchHot()
      const items = response?.result?.hots || response?.data || []
      return items.map((item) => ({
        keyword: item.searchWord || item.first || '',
        score: item.score || 0,
      })).filter((item) => item.keyword)
    },

    async getTopSongs(limit = 12) {
      const response = await api.topSongs(0)
      return (response?.data || []).slice(0, limit).map(mapSong).filter(Boolean)
    },

    async getLyrics(id) {
      const response = await api.lyric(id)
      return parseLyricResponse(response || {}).lines.map((line) => ({
        time: line.time,
        text: line.content?.trim() || line.translation?.trim() || line.roman?.trim() || '',
        translation: line.translation?.trim() || '',
      })).filter((line) => line.text)
    },

    async getStream(id, { level = 'standard', unblock = false } = {}) {
      const response = await api.songUrl(id, level, unblock)
      const item = response?.data?.[0] || {}
      return {
        url: item.url || '',
        code: item.code ?? response?.code,
        message: item.message || response?.message || response?.msg || '',
        isTrial: Boolean(item.freeTrialInfo),
        level,
        source: unblock ? 'official-unblock' : 'official',
        cacheable: !item.freeTrialInfo,
      }
    },

    async getMatchedStream(id) {
      const response = await api.songUrlMatch(id)
      return { url: response?.data?.[0]?.url || response?.data?.url || response?.url || '', source: 'match', cacheable: true }
    },

    async getLegacyStream(id, bitrate = 320000) {
      const response = await api.songUrlOld(id, bitrate)
      return { url: response?.data?.[0]?.url || '', source: 'old-api', cacheable: false }
    },

    async getTracks(ids) {
      const response = await api.songDetail(ids)
      return (response?.songs || []).map(mapSong).filter(Boolean)
    },

    async getPlaylist(id) {
      const response = await api.playlistDetail(id)
      const playlist = response?.playlist
      if (!playlist) return null
      const coverUrl = playlist.coverImgUrl || playlist.picUrl || ''
      return {
        ...playlist,
        providerId: 'netease',
        sourceId: playlist.id || id,
        coverUrl,
        coverImgUrl: coverUrl,
        picUrl: coverUrl,
        tracks: (playlist.tracks || []).map(mapSong).filter(Boolean),
      }
    },

    async getAlbum(id) {
      const response = await api.album(id)
      const album = mapAlbum(response?.album || { id })
      return { album, songs: (response?.songs || response?.album?.songs || []).map(mapSong).filter(Boolean) }
    },

    async getArtist(id) {
      const [detailRes, songsRes, albumsRes] = await Promise.all([
        api.artistDetail(id).catch(() => null),
        api.artistSongs(id, 50).catch(() => ({ songs: [] })),
        api.artistAlbums(id, 30).catch(() => ({ hotAlbums: [] })),
      ])
      const raw = detailRes?.data?.artist || detailRes?.artist || albumsRes?.artist || {}
      const baseArtist = { ...raw, id: raw.id || id, name: raw.name || '未知歌手' }
      const artist = {
        ...mapArtist(baseArtist),
        cover: raw.cover || raw.picUrl || '',
        avatar: raw.avatar || raw.img1v1Url || raw.picUrl || '',
        alias: raw.alias || raw.transNames || [],
        identities: raw.identities || detailRes?.data?.identify?.imageDesc?.split('、') || [],
        briefDesc: raw.briefDesc || '',
        followed: Boolean(raw.followed || detailRes?.data?.user?.followed),
      }
      return {
        artist,
        songs: (songsRes?.songs || songsRes?.data?.songs || []).map(mapSong).filter(Boolean),
        albums: (albumsRes?.hotAlbums || albumsRes?.albums || []).map(mapAlbum).filter(Boolean),
      }
    },
  })
}
