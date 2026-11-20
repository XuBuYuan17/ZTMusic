import type { NormalizedSong } from '../utils/normalize.ts'
import { normalizeSong } from '../utils/normalize.ts'

interface DailyHistoryApi {
  historyRecommendSongs(): Promise<unknown>
  historyRecommendSongsDetail(date: string | number): Promise<unknown>
}

export interface DailyDateItem {
  date: string
  [key: string]: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function toDateItems(raw: unknown): DailyDateItem[] {
  if (!Array.isArray(raw)) return []
  const dates = new Map<string, DailyDateItem>()
  for (const item of raw) {
    const record = asRecord(item)
    const value = typeof item === 'string' ? item : record?.date
    if (typeof value !== 'string' || !value.trim()) continue
    const date = value.trim()
    if (!dates.has(date)) dates.set(date, { ...record, date })
  }
  return [...dates.values()]
}

function toSongs(raw: unknown): NormalizedSong[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeSong).filter((song): song is NormalizedSong => song !== null)
}

function checkedResponse(response: unknown, fallback: string): Record<string, unknown> | null {
  const result = asRecord(response)
  if (result?.code != null && Number(result.code) !== 200) {
    throw new Error(String(result.message || result.msg || fallback))
  }
  return result
}

export async function loadDailyHistoryDatesData(ncm: DailyHistoryApi): Promise<DailyDateItem[]> {
  const result = checkedResponse(await ncm.historyRecommendSongs(), '历史日期加载失败')
  return toDateItems(asRecord(result?.data)?.dates || result?.dates || result?.data)
}

export async function loadDailyHistoryDetailData(ncm: DailyHistoryApi, date: string | number): Promise<NormalizedSong[]> {
  if (!date) return []
  const result = checkedResponse(await ncm.historyRecommendSongsDetail(date), '日推歌曲加载失败')
  const data = asRecord(result?.data)
  return toSongs(data?.songs || result?.songs || data?.dailySongs)
}
