import { compactTrack } from '../player/queue.ts'
import type { CompactTrack, CompactTrackInput } from '../player/queue.ts'
import type { SongId } from '../types/music.ts'
import { normalizeImageUrl } from '../utils/image.ts'

export const PRIVATE_RADAR_ID = 3136952023

interface RecommendationApi {
  recommendSongs(limit?: number, options?: { cache?: boolean; refresh?: boolean }): Promise<unknown>
  personalFm(): Promise<unknown>
  intelligenceList(id: SongId, pid: SongId, sid?: SongId): Promise<unknown>
  userPlaylist(uid: SongId, options?: { cache?: boolean; refresh?: boolean }): Promise<unknown>
  playlistTracks(id: SongId, limit?: number, offset?: number): Promise<unknown>
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function response(value: unknown): Record<string, unknown> {
  const body = record(value)
  if (body.code !== undefined && Number(body.code) !== 200) {
    const login = [301, 302, 401, 403].includes(Number(body.code))
    throw new Error(login ? '请重新登录后使用' : String(body.message || body.msg || '推荐加载失败，请重试'))
  }
  return body
}

export function recommendationTracks(value: unknown): CompactTrack[] {
  const body = response(value)
  const data = record(body.data)
  const list = data.dailySongs || body.songs || body.data
  const seen = new Set<string>()
  return (Array.isArray(list) ? list : []).flatMap((item: unknown) => {
    const entry = record(item)
    const song = record(entry.songInfo || item)
    if (!['number', 'string'].includes(typeof song.id) || !/^\d+$/.test(String(song.id)) || Number(song.id) <= 0
      || typeof song.name !== 'string' || !song.name.trim() || seen.has(String(song.id))) return []
    seen.add(String(song.id))
    const track = compactTrack(song as CompactTrackInput)
    return track ? [track] : []
  })
}

function requireTracks(tracks: CompactTrack[], message: string): CompactTrack[] {
  if (!tracks.length) throw new Error(message)
  return tracks
}

export async function loadDailyRecommendations(api: RecommendationApi): Promise<CompactTrack[]> {
  return requireTracks(recommendationTracks(await api.recommendSongs(100, { cache: false, refresh: true })), '今日推荐暂时为空，请稍后重试')
}

export async function loadRoaming(api: RecommendationApi): Promise<CompactTrack[]> {
  return requireTracks(recommendationTracks(await api.personalFm()), '漫游暂时没有新歌曲，请稍后重试')
}

export async function loadHeartMode(api: RecommendationApi, uid: SongId, currentId?: SongId): Promise<{
  tracks: CompactTrack[]; next: (id: SongId) => Promise<CompactTrack[]>; coverImgUrl: string
}> {
  const body = response(await api.userPlaylist(uid, { cache: false, refresh: true }))
  const playlists = Array.isArray(body.playlist) ? body.playlist : []
  const liked = playlists.map(record).find(p => Number(p.specialType) === 5 && String(record(p.creator).userId) === String(uid))
  if (!liked || !(Number(liked.id) > 0)) throw new Error('未找到喜欢的音乐，请先喜欢一首歌曲')
  const pid = liked.id as SongId
  const songs = requireTracks(recommendationTracks(await api.playlistTracks(pid, 100)), '先喜欢一首歌曲，再开启心动模式')
  const seed = songs.find(song => String(song.id) === String(currentId)) || songs[0]!
  const next = async (id: SongId): Promise<CompactTrack[]> =>
    requireTracks(recommendationTracks(await api.intelligenceList(id, pid, seed.id)), '心动模式暂时没有新歌曲，请稍后重试')
  return { tracks: await next(seed.id), next, coverImgUrl: normalizeImageUrl(liked.coverImgUrl) }
}
