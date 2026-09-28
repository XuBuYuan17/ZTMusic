import type { NormalizedAlbum, NormalizedPlaylist, NormalizedSong } from '../utils/normalize.ts'
import type { HomepageBlock } from '../utils/normalize.ts'
import type { SongId } from '../types/music.ts'
import { normalizeAlbum, normalizePlaylist, normalizeSong, parseHomepageBlocks } from '../utils/normalize.ts'
import { handleErrorWithToast } from '../utils/error.ts'

interface ExploreApi {
  banner(): Promise<unknown>
  personalized(limit: number): Promise<unknown>
  topPlaylist(cat: string, limit: number): Promise<unknown>
  personalizedNewSong(limit: number): Promise<unknown>
  recommendSongs(limit: number): Promise<unknown>
  albumNewest(): Promise<unknown>
  homepageBlockPage(refresh: boolean): Promise<unknown>
}

interface ExploreBanner {
  id: SongId
  title: string
  pic: string
  targetId: number
  targetType: number
}

export interface ExploreData {
  banners: ExploreBanner[]
  personalized: NormalizedPlaylist[]
  topPlaylists: NormalizedPlaylist[]
  recommendSongs: NormalizedSong[]
  newAlbums: NormalizedAlbum[]
  blocks: HomepageBlock[]
  /** 所有内容请求都失败（逐项降级后数据全为空，消费方据此显示错误态/重试） */
  allFailed: boolean
}

type Loose = Record<string, unknown>
type Settled<T> = PromiseSettledResult<T>

function asRecord(value: unknown): Loose {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function fulfilled(result: Settled<unknown>): unknown {
  return result.status === 'fulfilled' ? result.value : undefined
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value) return value
  }
  return ''
}

function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && value) return value
  }
  return 0
}

export async function loadExploreData(ncm: ExploreApi): Promise<ExploreData> {
  // 不要给单个请求挂 .catch()：那会把 rejection 变成 fulfilled，令下面的 allFailed 判断失效。
  // 下游的 asRecord/asArray 已经容忍 rejected 结果（fulfilled() 返回 undefined），逐项失败照样降级成空数组。
  const [bannerRes, personalizedRes, topPlaylistRes, newSongRes, recommendRes, albumNewestRes, homepageRes] = await Promise.allSettled([
    ncm.banner(),
    ncm.personalized(10),
    ncm.topPlaylist('全部', 12),
    ncm.personalizedNewSong(12),
    ncm.recommendSongs(12),
    ncm.albumNewest(),
    ncm.homepageBlockPage(false),
  ])

  // 如果全部请求都失败，提示用户
  const allFailed = [bannerRes, personalizedRes, topPlaylistRes, newSongRes, recommendRes, albumNewestRes]
    .every(r => r.status === 'rejected')
  if (allFailed) handleErrorWithToast('发现页加载失败', new Error('所有请求均失败'))

  const banners = asArray(asRecord(fulfilled(bannerRes)).banners).map((rawBanner, index): ExploreBanner => {
    const banner = asRecord(rawBanner)
    const rawId = banner.targetId || banner.id
    return {
      id: (typeof rawId === 'number' || typeof rawId === 'string') && rawId ? rawId : index,
      title: pickString(banner.typeTitle, banner.title),
      pic: pickString(banner.imageUrl, banner.bigImageUrl, banner.pic),
      targetId: pickNumber(banner.targetId),
      targetType: pickNumber(banner.targetType),
    }
  })

  const personalized = asArray(asRecord(fulfilled(personalizedRes)).result).map(normalizePlaylist).filter((item): item is NormalizedPlaylist => item !== null)

  const topPlaylists = asArray(asRecord(fulfilled(topPlaylistRes)).playlists).map(normalizePlaylist).filter((item): item is NormalizedPlaylist => item !== null)

  const newSongVal = asRecord(fulfilled(newSongRes))
  const recVal = asRecord(fulfilled(recommendRes))
  const newSongData = asArray(newSongVal.result)
  const recData = asRecord(recVal.data)
  const recSongs = asArray(recData.dailySongs || recData.songs || recVal.data || recVal.songs)
  const preferredSongs = newSongData.length ? newSongData : recSongs
  const recommendSongs = preferredSongs.map(normalizeSong).filter((item): item is NormalizedSong => item !== null)

  const albumVal = asRecord(fulfilled(albumNewestRes))
  const albumData = asArray(albumVal.albums || asRecord(albumVal.data).albums)
  const newAlbums = albumData.map(normalizeAlbum).filter((item): item is NormalizedAlbum => item !== null).slice(0, 12)

  const homepageVal = fulfilled(homepageRes)
  const blocks = parseHomepageBlocks(homepageVal ?? null)

  return { banners, personalized, topPlaylists, recommendSongs, newAlbums, blocks, allFailed }
}
