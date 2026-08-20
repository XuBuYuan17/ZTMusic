import { coverUrl } from '../utils/image.js'
import { musicService } from '../music/service.js'

const SONG_DETAIL_BATCH_SIZE = 500
const INITIAL_PLAYLIST_DETAIL_LIMIT = 500

async function loadSongsByIds(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (!uniqueIds.length) return []
  const chunks = []
  for (let index = 0; index < uniqueIds.length; index += SONG_DETAIL_BATCH_SIZE) {
    chunks.push(uniqueIds.slice(index, index + SONG_DETAIL_BATCH_SIZE))
  }
  const results = await Promise.all(chunks.map(chunk => musicService.getTracks(chunk).catch(() => [])))
  const songMap = new Map(results.flat().map(song => [song.id, song]))
  return uniqueIds.map(id => songMap.get(id)).filter(Boolean)
}

export async function loadPlaylistDetail(extractColor, id, onProgress) {
  const detail = await musicService.getPlaylist(id)
  if (detail?.trackIds?.length) {
    const fallbackMap = new Map((detail.tracks || []).map(track => [track.id, track]))
    const shouldDeferFullLoad = detail.trackIds.length > INITIAL_PLAYLIST_DETAIL_LIMIT
    const idsToLoad = shouldDeferFullLoad
      ? detail.trackIds.slice(0, INITIAL_PLAYLIST_DETAIL_LIMIT).map(track => track.id)
      : detail.trackIds.map(track => track.id)

    async function buildTracks(songMap) {
      return detail.trackIds.map((track, index) => {
        const detailTrack = songMap.get(track.id) || fallbackMap.get(track.id) || (shouldDeferFullLoad ? { id: track.id, name: `歌曲 ${track.id}`, ar: [], al: {}, dt: 0 } : null)
        if (!detailTrack) return null
        return {
          ...detailTrack,
          addTime: track.at || track.addTime || track.time || detailTrack.addTime || 0,
          playlistIndex: index,
        }
      }).filter(Boolean)
    }

    const firstBatch = idsToLoad.slice(0, 10)
    const [firstSongs, heroColor] = await Promise.all([
      firstBatch.length ? loadSongsByIds(firstBatch) : Promise.resolve([]),
      extractHeroColor(extractColor, detail?.coverImgUrl),
    ])
    const songMap = new Map(firstSongs.map(song => [song.id, song]))
    let tracks = await buildTracks(songMap)
    if (tracks.length) detail.tracks = tracks
    if (onProgress) onProgress({ detail, heroColor })

    const remainingIds = idsToLoad.slice(10)
    for (let i = 0; i < remainingIds.length; i += 50) {
      const batch = remainingIds.slice(i, i + 50)
      if (!batch.length) continue
      const songs = await loadSongsByIds(batch)
      for (const song of songs) songMap.set(song.id, song)
      tracks = await buildTracks(songMap)
      if (tracks.length) detail.tracks = tracks
      if (onProgress) onProgress({ detail, heroColor })
    }

    detail.tracksPartial = shouldDeferFullLoad
    return { detail, heroColor }
  }
  const heroColor = await extractHeroColor(extractColor, detail?.coverImgUrl)
  return { detail, heroColor }
}

export async function loadAlbumDetail(extractColor, id) {
  const response = await musicService.getAlbum(id)
  const album = response?.album || {}
  const songs = response?.songs || []
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

export async function loadArtistDetail(id) {
  try {
    return await musicService.getArtist(id)
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
