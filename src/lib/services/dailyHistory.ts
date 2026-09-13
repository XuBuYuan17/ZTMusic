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

export interface DailyHistoryData {
  dates: DailyDateItem[]
  selectedDate: string
  songs: NormalizedSong[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function toDateItems(raw: unknown): DailyDateItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): DailyDateItem | null => {
      if (typeof item === 'string') return { date: item }
      const rec = asRecord(item)
      return rec && typeof rec.date === 'string' ? rec as DailyDateItem : null
    })
    .filter((item): item is DailyDateItem => item !== null)
}

function toSongs(raw: unknown): NormalizedSong[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeSong).filter((song): song is NormalizedSong => song !== null)
}

export async function loadDailyHistoryData(ncm: DailyHistoryApi): Promise<DailyHistoryData> {
  try {
    const res = await ncm.historyRecommendSongs()
    const r = asRecord(res)
    const d = asRecord(r?.data)
    const rawDates = d?.dates || r?.dates || r?.data || []
    const dates = toDateItems(rawDates)
    const selectedDate = dates[0]?.date || ''
    const songs = selectedDate ? await loadDailyHistoryDetailData(ncm, selectedDate) : []
    return { dates, selectedDate, songs }
  } catch {
    return { dates: [], selectedDate: '', songs: [] }
  }
}

export async function loadDailyHistoryDetailData(ncm: DailyHistoryApi, date: string | number): Promise<NormalizedSong[]> {
  if (!date) return []
  try {
    const res = await ncm.historyRecommendSongsDetail(date)
    const r = asRecord(res)
    const d = asRecord(r?.data)
    const rawSongs = d?.songs || r?.songs || d?.dailySongs || []
    return toSongs(rawSongs)
  } catch {
    return []
  }
}
