import { normalizeLocalHistorySong, normalizePlaylist, normalizeRecordSong } from '../utils/normalize.js'

export async function loadLibraryData(ncm, user) {
  const uid = user?.userId || user?.id
  if (!uid) return []
  try {
    const plRes = await ncm.userPlaylist(uid).catch(() => ({ playlist: [] }))
    const allPlaylists = (plRes.playlist || []).slice(0, 100)
    return allPlaylists.filter(playlist => playlist.creator?.userId !== uid && playlist.specialType !== 5).map(normalizePlaylist).filter(Boolean)
  } catch {
    return []
  }
}

export async function loadHomeData(ncm, user) {
  const uid = user?.userId || user?.id
  if (!uid) {
    return {
      userPlaylists: [],
      likedPlaylist: null,
      weeklyPlaylist: null,
      recentTracks: [],
      recommendPlaylists: [],
      subcountPromise: null,
      weeklyPromise: null,
      recommendPromise: null,
    }
  }

  const plRes = await ncm.userPlaylist(uid).catch(() => ({ playlist: [] }))
  const allPlaylists = (plRes.playlist || []).slice(0, 50)
  const userPlaylists = allPlaylists.filter(playlist => playlist.creator?.userId !== uid && playlist.specialType !== 5).map(normalizePlaylist).filter(Boolean)

  const liked = allPlaylists.find(playlist => playlist.creator?.userId === uid && playlist.specialType === 5)
  const likedPlaylist = normalizePlaylist(liked)

  const initialWeeklyPlaylist = {
    id: 0,
    name: '听歌排行',
    picUrl: user?.avatarUrl || '',
    trackCount: 0,
    playCount: 0,
    topSongName: '',
  }

  const subcountPromise = ncm.userSubcount()
    .then(subRes => subRes?.data || subRes)
    .catch(() => null)

  const weeklyPromise = ncm.userRecordWeek(uid)
    .then(weeklyRecordRes => {
      const weeklyList = weeklyRecordRes?.weekData || weeklyRecordRes?.data?.weekData || weeklyRecordRes?.data?.list || weeklyRecordRes?.list || []
      const weeklyTracks = Array.isArray(weeklyList)
        ? weeklyList.map(normalizeRecordSong).filter(Boolean)
        : []
      const topSong = weeklyTracks[0] || null
      return {
        weeklyPlaylist: {
          id: 0,
          name: '听歌排行',
          picUrl: topSong?.picUrl || user?.avatarUrl || '',
          trackCount: weeklyTracks.length,
          playCount: topSong?.playCount || 0,
          topSongName: topSong?.name || '',
        },
        recentTracks: weeklyTracks,
      }
    })
    .catch(() => ({ weeklyPlaylist: initialWeeklyPlaylist, recentTracks: [] }))

  const recommendPromise = ncm.recommendResource()
    .then(recommendRes => {
      const recList = recommendRes?.recommend || recommendRes?.playlists || []
      return (Array.isArray(recList) ? recList : []).slice(0, 6).map(normalizePlaylist).filter(Boolean)
    })
    .catch(() => [])

  return {
    userPlaylists,
    likedPlaylist,
    weeklyPlaylist: initialWeeklyPlaylist,
    recentTracks: [],
    recommendPlaylists: [],
    subcountPromise,
    weeklyPromise,
    recommendPromise,
  }
}

export async function loadRecentData(ncm, user, getLocalHistory) {
  const uid = user?.userId || user?.id
  let recentTracks = []
  if (uid) {
    try {
      const res = await ncm.userRecord(uid, 1)
      const list = res?.weekData || res?.data?.weekData || res?.data?.list || res?.list || []
      recentTracks = Array.isArray(list)
        ? list.map(normalizeRecordSong).filter(Boolean)
        : []
    } catch {
      recentTracks = []
    }
  }
  if (recentTracks.length === 0) {
    recentTracks = getLocalHistory().map(normalizeLocalHistorySong)
  }
  return recentTracks
}

export async function loadToplistsData(ncm) {
  try {
    const res = await ncm.toplist()
    return res?.list || res?.data?.list || []
  } catch {
    return []
  }
}