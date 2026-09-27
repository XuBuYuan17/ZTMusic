import type { SongId } from '../types/music.ts'
import type { NormalizedPlaylist, NormalizedRecordSong } from '../utils/normalize.ts'
import { normalizePlaylist, normalizeRecordSong } from '../utils/normalize.ts'

type Loose = Record<string, unknown>

export interface UserPreview {
  userId: SongId
  nickname: string
  avatarUrl: string
  signature: string
  followed: boolean
}

export interface UserProfileData {
  userId: SongId
  nickname: string
  avatarUrl: string
  backgroundUrl: string
  signature: string
  level: number
  listenSongs: number
  follows: number
  followeds: number
  playlistCount: number
  followed: boolean
  artistId: SongId | null
  artistName: string
  identityLabel: string
  createdPlaylists: NormalizedPlaylist[]
  likedPlaylist: NormalizedPlaylist | null
  weeklyTracks: NormalizedRecordSong[]
  followsPreview: UserPreview[]
  followersPreview: UserPreview[]
}

interface UserProfileApi {
  userDetail(uid: SongId): Promise<unknown>
  userPlaylist(uid: SongId, options?: unknown): Promise<unknown>
  userRecordWeek(uid: SongId): Promise<unknown>
  userFollows(uid: SongId, limit?: number, offset?: number): Promise<unknown>
  userFolloweds(uid: SongId, limit?: number, offset?: number): Promise<unknown>
  userLevel?(): Promise<unknown>
  userSubcount?(): Promise<unknown>
}

function rec(value: unknown): Loose {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : {}
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function valueOf(result: PromiseSettledResult<unknown> | undefined): unknown {
  return result?.status === 'fulfilled' ? result.value : {}
}

function listFrom(response: unknown, keys: string[]): unknown[] {
  const root = rec(response)
  const data = rec(root.data)
  for (const key of keys) {
    const list = arr(root[key])
    if (list.length) return list
    const nested = arr(data[key])
    if (nested.length) return nested
  }
  return []
}

export function normalizeUserPreview(value: unknown): UserPreview | null {
  const item = rec(value)
  const userId = item.userId ?? item.id
  if (typeof userId !== 'number' && typeof userId !== 'string') return null
  return {
    userId,
    nickname: text(item.nickname) || text(item.name) || '用户',
    avatarUrl: text(item.avatarUrl) || text(item.avatar),
    signature: text(item.signature) || text(item.description),
    followed: Boolean(item.followed),
  }
}

export async function loadUserProfileData(
  api: UserProfileApi,
  userId: SongId,
  options: { isOwn?: boolean; fallbackUser?: unknown } = {},
): Promise<UserProfileData> {
  const isOwn = options.isOwn === true
  const requests: Promise<unknown>[] = [
    api.userDetail(userId),
    api.userPlaylist(userId),
    api.userRecordWeek(userId),
    api.userFollows(userId, 8, 0),
    api.userFolloweds(userId, 8, 0),
    isOwn && api.userLevel ? api.userLevel() : Promise.resolve({}),
    isOwn && api.userSubcount ? api.userSubcount() : Promise.resolve({}),
  ]
  const [detailResult, playlistResult, recordResult, followsResult, followersResult, levelResult, subcountResult] = await Promise.allSettled(requests)

  const detailRoot = rec(valueOf(detailResult))
  const detailData = Object.keys(rec(detailRoot.data)).length ? rec(detailRoot.data) : detailRoot
  const profile = Object.keys(rec(detailData.profile)).length
    ? rec(detailData.profile)
    : Object.keys(rec(detailRoot.profile)).length
      ? rec(detailRoot.profile)
      : rec(options.fallbackUser)
  const levelRoot = rec(valueOf(levelResult))
  const levelData = Object.keys(rec(levelRoot.data)).length ? rec(levelRoot.data) : levelRoot
  const subcountRoot = rec(valueOf(subcountResult))
  const subcount = Object.keys(rec(subcountRoot.data)).length ? rec(subcountRoot.data) : subcountRoot
  const identify = rec(detailRoot.identify)
  const mainAuthType = rec(profile.mainAuthType)

  const rawPlaylists = listFrom(valueOf(playlistResult), ['playlist'])
  const createdPlaylists = rawPlaylists
    .filter((item) => {
      const playlist = rec(item)
      return String(rec(playlist.creator).userId ?? '') === String(userId) && playlist.specialType !== 5
    })
    .map(normalizePlaylist)
    .filter((item): item is NormalizedPlaylist => item !== null)
  const likedPlaylist = normalizePlaylist(rawPlaylists.find((item) => {
    const playlist = rec(item)
    return String(rec(playlist.creator).userId ?? '') === String(userId) && playlist.specialType === 5
  }))

  const weeklyTracks = listFrom(valueOf(recordResult), ['weekData', 'list'])
    .map(normalizeRecordSong)
    .filter((item): item is NormalizedRecordSong => item !== null)
    .slice(0, 10)
  const followsPreview = listFrom(valueOf(followsResult), ['follow', 'follows'])
    .map(normalizeUserPreview)
    .filter((item): item is UserPreview => item !== null)
    .slice(0, 8)
  const followersPreview = listFrom(valueOf(followersResult), ['followeds'])
    .map(normalizeUserPreview)
    .filter((item): item is UserPreview => item !== null)
    .slice(0, 8)

  return {
    userId,
    nickname: text(profile.nickname) || text(rec(options.fallbackUser).nickname) || '用户',
    avatarUrl: text(profile.avatarUrl) || text(rec(options.fallbackUser).avatarUrl),
    backgroundUrl: text(profile.backgroundUrl) || text(profile.backgroundImageUrl),
    signature: text(profile.signature),
    level: number(levelData.level ?? detailData.level ?? profile.level),
    listenSongs: number(detailData.listenSongs ?? profile.listenSongs ?? levelData.nowPlayCount),
    follows: number(profile.follows ?? detailData.follows ?? subcount.followCount),
    followeds: number(profile.followeds ?? detailData.followeds ?? subcount.followedCount),
    playlistCount: number(profile.playlistCount ?? detailData.playlistCount)
      || number(subcount.createdPlaylistCount) + number(subcount.subPlaylistCount)
      || rawPlaylists.length,
    followed: Boolean(profile.followed ?? detailData.followed),
    artistId: (typeof profile.artistId === 'number' || typeof profile.artistId === 'string') ? profile.artistId : null,
    artistName: text(profile.artistName) || text(profile.nickname),
    identityLabel: text(mainAuthType.desc) || text(identify.imageDesc) || text(profile.detailDescription),
    createdPlaylists,
    likedPlaylist,
    weeklyTracks,
    followsPreview,
    followersPreview,
  }
}

export function withFollowState(profile: UserProfileData, followed: boolean): UserProfileData {
  if (profile.followed === followed) return profile
  return {
    ...profile,
    followed,
    followeds: Math.max(0, profile.followeds + (followed ? 1 : -1)),
  }
}
