import { coverUrl } from '../utils/image.js'

export async function loadPlaylistDetail(ncm, extractColor, id) {
  const response = await ncm.playlistDetail(id)
  const detail = response?.playlist || null
  const heroColor = await extractHeroColor(extractColor, detail?.coverImgUrl)
  return { detail, heroColor }
}

export async function loadAlbumDetail(ncm, extractColor, id) {
  const response = await ncm.album(id)
  const album = response?.album || {}
  const songs = response?.songs || album?.songs || []
  const artistName = album.artist?.name || album.artists?.map(artist => artist.name).join(' / ') || ''
  const detail = {
    id: album.id || id,
    name: album.name || '未知专辑',
    coverImgUrl: album.picUrl,
    picUrl: album.picUrl,
    creator: { nickname: artistName },
    trackCount: album.size || songs.length,
    description: album.description || album.alias?.join(' / ') || '',
    tracks: songs,
  }
  const heroColor = await extractHeroColor(extractColor, detail.coverImgUrl)
  return { detail, heroColor }
}

export async function loadArtistDetail(ncm, id) {
  try {
    const [detailRes, songsRes, albumsRes] = await Promise.all([
      ncm.artistDetail(id).catch(() => null),
      ncm.artistSongs(id, 50).catch(() => ({ songs: [] })),
      ncm.artistAlbums(id, 30).catch(() => ({ hotAlbums: [] })),
    ])
    const baseArtist = detailRes?.data?.artist || detailRes?.artist || albumsRes?.artist || {}
    const artist = {
      id: baseArtist.id || id,
      name: baseArtist.name || '未知歌手',
      cover: baseArtist.cover || baseArtist.picUrl || '',
      avatar: baseArtist.avatar || baseArtist.img1v1Url || baseArtist.picUrl || '',
      picUrl: baseArtist.picUrl || baseArtist.cover || baseArtist.avatar || '',
      alias: baseArtist.alias || baseArtist.transNames || [],
      identities: baseArtist.identities || detailRes?.data?.identify?.imageDesc?.split('、') || [],
      briefDesc: baseArtist.briefDesc || '',
      musicSize: baseArtist.musicSize || 0,
      albumSize: baseArtist.albumSize || 0,
      followed: Boolean(baseArtist.followed || detailRes?.data?.user?.followed),
    }
    const songs = (songsRes?.songs || songsRes?.data?.songs || []).map(song => ({
      ...song,
      picUrl: song.picUrl || song.al?.picUrl || song.album?.picUrl || '',
    }))
    const albums = albumsRes?.hotAlbums || albumsRes?.albums || []
    return { artist, songs, albums }
  } catch {
    return { artist: null, songs: [], albums: [] }
  }
}

async function extractHeroColor(extractColor, imageUrl) {
  if (!imageUrl) return '#141414'
  try {
    const color = await extractColor(coverUrl(imageUrl, 100))
    return color || '#141414'
  } catch {
    return '#141414'
  }
}