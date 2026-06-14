import { normalizeAlbum, normalizePlaylist, normalizeSong, parseHomepageBlocks } from '../utils/normalize.js'

export async function loadExploreData(ncm) {
  const [bannerRes, personalizedRes, topPlaylistRes, newSongRes, recommendRes, albumNewestRes, homepageRes] = await Promise.allSettled([
    ncm.banner().catch(() => ({ banners: [] })),
    ncm.personalized(10).catch(() => ({ result: [] })),
    ncm.topPlaylist('全部', 12).catch(() => ({ playlists: [] })),
    ncm.personalizedNewSong(12).catch(() => ({ result: [] })),
    ncm.recommendSongs(12).catch(() => ({ data: [] })),
    ncm.albumNewest().catch(() => ({ albums: [] })),
    ncm.homepageBlockPage(false).catch(() => null),
  ])

  const banners = ((bannerRes.status === 'fulfilled' ? bannerRes.value : {})?.banners || []).map((banner, index) => ({
    id: banner.targetId || banner.id || index,
    title: banner.typeTitle || banner.title || '',
    pic: banner.imageUrl || banner.bigImageUrl || banner.pic || '',
    targetId: banner.targetId || 0,
    targetType: banner.targetType || 0,
  }))

  const personalized = ((personalizedRes.status === 'fulfilled' ? personalizedRes.value : {})?.result || []).map(normalizePlaylist).filter(Boolean)

  const topPlaylists = ((topPlaylistRes.status === 'fulfilled' ? topPlaylistRes.value : {})?.playlists || []).map(normalizePlaylist).filter(Boolean)

  const newSongVal = newSongRes.status === 'fulfilled' ? newSongRes.value : {}
  const recVal = recommendRes.status === 'fulfilled' ? recommendRes.value : {}
  const newSongData = newSongVal?.result || []
  const recSongs = recVal?.data?.dailySongs || recVal?.data?.songs || recVal?.data || recVal?.songs || []
  const preferredSongs = newSongData.length ? newSongData : (Array.isArray(recSongs) ? recSongs : [])
  const recommendSongs = preferredSongs.map(normalizeSong).filter(Boolean)

  const albumVal = albumNewestRes.status === 'fulfilled' ? albumNewestRes.value : {}
  const albumData = albumVal?.albums || albumVal?.data?.albums || []
  const newAlbums = (Array.isArray(albumData) ? albumData : []).map(normalizeAlbum).filter(Boolean).slice(0, 12)

  const homepageVal = homepageRes.status === 'fulfilled' ? homepageRes.value : null
  const blocks = parseHomepageBlocks(homepageVal)

  return { banners, personalized, topPlaylists, recommendSongs, newAlbums, blocks }
}