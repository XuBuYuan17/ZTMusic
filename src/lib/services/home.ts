import type { SongId } from '../types/music.ts'
import type { NormalizedLocalHistorySong, NormalizedPlaylist, NormalizedRecordSong } from '../utils/normalize.ts'
import { normalizeLocalHistorySong, normalizePlaylist, normalizeRecordSong } from '../utils/normalize.ts'
import { formatPlayCount } from '../format.ts'
import { handleErrorWithToast } from '../utils/error.ts'
import { dbHistory } from '../db/history.ts'

type Loose = Record<string, unknown>

interface HomeApi {
  userPlaylist(uid: SongId, options?: unknown): Promise<unknown>
  userDetail(uid: SongId): Promise<unknown>
  userSubcount(): Promise<unknown>
  likelist(uid: SongId): Promise<unknown>
  userLevel?(): Promise<unknown>
  userRecordWeek(uid: SongId): Promise<unknown>
  recommendResource(): Promise<unknown>
  userRecord(uid: SongId, type: number): Promise<unknown>
  toplist(): Promise<unknown>
}

interface WeeklyPlaylist {
  id: number
  name: string
  picUrl: string
  trackCount: number
  playCount: number
  topSongName: string
}

interface WeeklyResult {
  weeklyPlaylist: WeeklyPlaylist
  recentTracks: NormalizedRecordSong[]
}

type PlaylistWithCount = NormalizedPlaylist & { playCountText: string }

interface LibraryProfile {
  nickname: string
  avatarUrl: string
  level: number
  listenSongs: number
}

interface MobileLibraryData {
  profile: LibraryProfile | null
  stats: Array<{ label: string; value: string }>
  createdPlaylists: PlaylistWithCount[]
  savedPlaylists: PlaylistWithCount[]
  likedPlaylist: PlaylistWithCount | null
}

interface HomeData {
  userPlaylists: NormalizedPlaylist[]
  likedPlaylist: NormalizedPlaylist | null
  weeklyPlaylist: WeeklyPlaylist | null
  recentTracks: NormalizedRecordSong[]
  recommendPlaylists: NormalizedPlaylist[]
  subcountPromise: Promise<unknown> | null
  weeklyPromise: Promise<WeeklyResult> | null
  recommendPromise: Promise<NormalizedPlaylist[]> | null
}

function rec(value: unknown): Loose | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function settledValue(result: PromiseSettledResult<unknown>, fallback: unknown = null): unknown {
  return result.status === 'fulfilled' ? result.value : fallback
}

function withPlayCountText(playlist: NormalizedPlaylist | null): PlaylistWithCount | null {
  if (!playlist) return null
  return { ...playlist, playCountText: playlist.playCount ? `${formatPlayCount(playlist.playCount)} 次播放` : '歌单' }
}

function uidOf(user: unknown): SongId | undefined {
  const u = rec(user)
  const id = u?.userId ?? u?.id
  return typeof id === 'number' || typeof id === 'string' ? id : undefined
}

export async function loadMobileLibraryData(ncm: HomeApi, user: unknown, options: Record<string, unknown> = {}): Promise<MobileLibraryData> {
  const uid = uidOf(user)
  if (!uid) return { profile: null, stats: [], createdPlaylists: [], savedPlaylists: [], likedPlaylist: null }

  const [playlistResult, detailResult, subcountResult, likedResult, levelResult] = await Promise.allSettled([
    ncm.userPlaylist(uid, options),
    ncm.userDetail(uid),
    ncm.userSubcount(),
    ncm.likelist(uid),
    ncm.userLevel?.(),
  ])

  const playlists = asArray(rec(settledValue(playlistResult, {}))?.playlist).slice(0, 100)
  const toPlaylistWithCount = (playlist: unknown): PlaylistWithCount | null => withPlayCountText(normalizePlaylist(playlist))
  const isUserOwned = (playlist: unknown): boolean => {
    const p = rec(playlist)
    return !!p && rec(p.creator)?.userId === uid && p.specialType !== 5
  }
  const isSaved = (playlist: unknown): boolean => {
    const p = rec(playlist)
    return !!p && rec(p.creator)?.userId !== uid && p.specialType !== 5
  }
  const isLiked = (playlist: unknown): boolean => {
    const p = rec(playlist)
    return !!p && rec(p.creator)?.userId === uid && p.specialType === 5
  }
  const normalizedPlaylists = playlists.map(toPlaylistWithCount).filter((p): p is PlaylistWithCount => p !== null)
  const savedPlaylists = playlists.filter(isSaved).map(toPlaylistWithCount).filter((p): p is PlaylistWithCount => p !== null)
  const createdPlaylists = playlists.filter(isUserOwned).map(toPlaylistWithCount).filter((p): p is PlaylistWithCount => p !== null)
  const likedPlaylist = withPlayCountText(normalizePlaylist(playlists.find(isLiked)))

  const detailRec = rec(settledValue(detailResult, {})) ?? {}
  const detailData = rec(detailRec.data) ?? detailRec
  const profile = rec(detailData.profile) || rec(detailRec.profile) || rec(user)
  const subcountRec = rec(settledValue(subcountResult, {})) ?? {}
  const subcount = rec(subcountRec.data) || subcountRec
  const likedRec = rec(settledValue(likedResult, {})) ?? {}
  const likedIds = asArray(likedRec.ids).length ? asArray(likedRec.ids) : asArray(rec(likedRec.data)?.ids)
  const levelRec = rec(settledValue(levelResult, {})) ?? {}
  const levelData = rec(levelRec.data) || levelRec

  return {
    profile: {
      nickname: asString(profile?.nickname) || asString(rec(user)?.nickname) || '用户',
      avatarUrl: asString(profile?.avatarUrl) || asString(rec(user)?.avatarUrl) || '',
      level: toNumber(levelData.level || detailData.level || profile?.level || 0),
      listenSongs: toNumber(detailData.listenSongs || profile?.listenSongs || levelData.nowPlayCount || 0),
    },
    stats: [
      { label: '听歌', value: formatPlayCount(toNumber(detailData.listenSongs || profile?.listenSongs || levelData.nowPlayCount || 0)) || '0' },
      { label: '喜欢', value: formatPlayCount(likedIds.length || toNumber(likedPlaylist?.trackCount)) || '0' },
      { label: '歌单', value: formatPlayCount((Number(subcount.createdPlaylistCount) + Number(subcount.subPlaylistCount)) || normalizedPlaylists.length) || '0' },
      { label: '关注', value: formatPlayCount(toNumber(subcount.artistCount || subcount.followCount || 0)) || '0' },
    ],
    createdPlaylists,
    savedPlaylists,
    likedPlaylist,
  }
}

export async function loadHomeData(ncm: HomeApi, user: unknown): Promise<HomeData> {
  const uid = uidOf(user)
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

  const plRes = await ncm.userPlaylist(uid).catch((err: unknown) => {
    handleErrorWithToast('歌单加载失败', err)
    return { playlist: [] }
  })
  const allPlaylists = asArray(rec(plRes)?.playlist).slice(0, 50)
  const userPlaylists = allPlaylists
    .filter((playlist) => { const p = rec(playlist); return !!p && rec(p.creator)?.userId !== uid && p.specialType !== 5 })
    .map(normalizePlaylist)
    .filter((p): p is NormalizedPlaylist => p !== null)

  const liked = allPlaylists.find((playlist) => { const p = rec(playlist); return !!p && rec(p.creator)?.userId === uid && p.specialType === 5 })
  const likedPlaylist = normalizePlaylist(liked)

  const initialWeeklyPlaylist: WeeklyPlaylist = {
    id: 0,
    name: '听歌排行',
    picUrl: asString(rec(user)?.avatarUrl),
    trackCount: 0,
    playCount: 0,
    topSongName: '',
  }

  const subcountPromise = ncm.userSubcount()
    .then((subRes) => { const s = rec(subRes); return s ? (rec(s.data) || s) : subRes })
    .catch(() => null)

  const weeklyPromise = ncm.userRecordWeek(uid)
    .then((weeklyRecordRes): WeeklyResult => {
      const r = rec(weeklyRecordRes)
      const rd = r ? rec(r.data) : null
      const weeklyList = asArray(r?.weekData || (rd ? (rd.weekData ?? rd.list) : undefined) || r?.list)
      const weeklyTracks = weeklyList.map(normalizeRecordSong).filter((t): t is NormalizedRecordSong => t !== null)
      const topSong = weeklyTracks[0] ?? null
      return {
        weeklyPlaylist: {
          id: 0,
          name: '听歌排行',
          picUrl: asString(topSong?.picUrl) || asString(rec(user)?.avatarUrl) || '',
          trackCount: weeklyTracks.length,
          playCount: toNumber(topSong?.playCount),
          topSongName: asString(topSong?.name),
        },
        recentTracks: weeklyTracks,
      }
    })
    .catch(() => ({ weeklyPlaylist: initialWeeklyPlaylist, recentTracks: [] }))

  const recommendPromise = ncm.recommendResource()
    .then((recommendRes): NormalizedPlaylist[] => {
      const r = rec(recommendRes)
      const recList = asArray(r ? (r.recommend || r.playlists) : undefined)
      return recList.slice(0, 6).map(normalizePlaylist).filter((p): p is NormalizedPlaylist => p !== null)
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

export async function loadLocalRecentTracks(limit = 200): Promise<NormalizedLocalHistorySong[]> {
  const history = await dbHistory.list(limit)
  return history
    .map((entry) => normalizeLocalHistorySong(entry as unknown as Loose))
    .filter((song): song is NormalizedLocalHistorySong => song !== null)
}

export async function loadRecentData(ncm: HomeApi, user: unknown): Promise<Array<NormalizedRecordSong | NormalizedLocalHistorySong>> {
  const uid = uidOf(user)
  let recentTracks: Array<NormalizedRecordSong | NormalizedLocalHistorySong> = []
  if (uid) {
    try {
      const res = await ncm.userRecord(uid, 1)
      const r = rec(res)
      const rd = r ? rec(r.data) : null
      const list = asArray(r?.weekData || (rd ? (rd.weekData ?? rd.list) : undefined) || r?.list)
      recentTracks = list.map(normalizeRecordSong).filter((t): t is NormalizedRecordSong => t !== null)
    } catch {
      recentTracks = []
    }
  }
  if (recentTracks.length === 0) {
    recentTracks = await loadLocalRecentTracks()
  }
  return recentTracks
}

export async function loadToplistsData(ncm: HomeApi): Promise<unknown[]> {
  try {
    const res = await ncm.toplist()
    const r = rec(res)
    const rd = r ? rec(r.data) : null
    return asArray(r?.list || rd?.list)
  } catch {
    return []
  }
}
