import { normalizeSong } from '../utils/normalize.js'

export async function loadDailyHistoryData(ncm) {
  try {
    const res = await ncm.historyRecommendSongs()
    const rawDates = res?.data?.dates || res?.dates || res?.data || []
    const dates = (Array.isArray(rawDates) ? rawDates : [])
      .map(item => typeof item === 'string' ? { date: item } : item)
      .filter(item => item?.date)
    const selectedDate = dates[0]?.date || ''
    const songs = selectedDate ? await loadDailyHistoryDetailData(ncm, selectedDate) : []
    return { dates, selectedDate, songs }
  } catch {
    return { dates: [], selectedDate: '', songs: [] }
  }
}

export async function loadDailyHistoryDetailData(ncm, date) {
  if (!date) return []
  try {
    const res = await ncm.historyRecommendSongsDetail(date)
    const songs = res?.data?.songs || res?.songs || res?.data?.dailySongs || []
    return (Array.isArray(songs) ? songs : []).map(normalizeSong).filter(Boolean)
  } catch {
    return []
  }
}