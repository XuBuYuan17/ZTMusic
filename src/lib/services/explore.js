import { normalizeAlbum, normalizePlaylist, normalizeSong, parseHomepageBlocks } from '../utils/normalize.js'

export async function loadExploreData(ncm) {
  const [bannerRes, personalizedRes, topPlaylistRes, newSongRes, recommendRes, albumNewestRes, homepageRes] = await Promise.all([
    ncm.banner().catch(() => ({ banners: [] })),
    ncm.personalized(10).catch(() => ({ result: [] })),
    ncm.topPlaylist('全部', 12).catch(() => ({ playlists: [] })),
    ncm.personalizedNewSong(12).catch(() => ({ result: [] })),
    ncm.recommendSongs(12).catch(() => ({ data: [] })),
    ncm.albumNewest().catch(() => ({ albums: [] })),
    ncm.homepageBlockPage(false).catch(() => null),
  ])

  const banners = (bannerRes?.banners || []).map((banner, index) => ({
    id: banner.targetId || banner.id || index,
    title: banner.typeTitle || banner.title || '',
    pic: banner.imageUrl || banner.bigImageUrl || banner.pic || '',
    targetId: banner.targetId || 0,
    targetType: banner.targetType || 0,
  }))

  const personalized = (personalizedRes?.result || personalizedRes?.playlists || []).map(normalizePlaylist).filter(Boolean)

  const topPlaylists = (topPlaylistRes?.playlists || topPlaylistRes?.list || []).map(normalizePlaylist).filter(Boolean)

  const newSongData = newSongRes?.result || []
  const recData = recommendRes?.data || recommendRes?.songs || []
  const dailySongs = recData.dailySongs || recData.songs || recData || []
  const preferredSongs = newSongData.length ? newSongData : dailySongs
  const recommendSongs = (Array.isArray(preferredSongs) ? preferredSongs : []).map(normalizeSong).filter(Boolean)

  const albumData = albumNewestRes?.albums || albumNewestRes?.data?.albums || []
  const newAlbums = (Array.isArray(albumData) ? albumData : []).map(normalizeAlbum).filter(Boolean).slice(0, 12)
  const blocks = parseHomepageBlocks(homepageRes)

  return { banners, personalized, topPlaylists, recommendSongs, newAlbums, blocks }
}