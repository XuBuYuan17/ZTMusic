import { dbHistory } from '../db/history.ts'

export interface LocalListeningStats {
  trackCount: number
  playCount: number
  totalDuration: number
  durationLabel: string
  activeDays: number
  recentTrackCount: number
  topArtist: string
}

export const EMPTY_LOCAL_LISTENING_STATS = Object.freeze({
  trackCount: 0,
  playCount: 0,
  totalDuration: 0,
  durationLabel: '0 分钟',
  activeDays: 0,
  recentTrackCount: 0,
  topArtist: '暂无记录',
})

type Loose = Record<string, unknown>

function asRecord(value: unknown): Loose {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : {}
}

function positiveInteger(value: unknown, fallback = 0): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback
}

function artistNames(entry: Loose): string[] {
  const artists = entry.artists || entry.ar || []
  return (Array.isArray(artists) ? artists : [])
    .map((artist) => (typeof artist === 'string' ? artist : asRecord(artist).name))
    .filter((name): name is string => typeof name === 'string' && !!name)
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export function formatListeningDuration(durationMs: number): string {
  const totalMinutes = Math.floor(Math.max(0, Number(durationMs) || 0) / 60_000)
  if (totalMinutes < 60) return `${totalMinutes} 分钟`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
}

export function summarizeLocalListening(history: unknown, now: number = Date.now()): LocalListeningStats {
  const entries = Array.isArray(history) ? history.filter(Boolean) : []
  if (!entries.length) return { ...EMPTY_LOCAL_LISTENING_STATS }

  let playCount = 0
  let totalDuration = 0
  let recentTrackCount = 0
  const activeDays = new Set<string>()
  const artistPlays = new Map<string, number>()
  const recentThreshold = now - 7 * 24 * 60 * 60 * 1000

  for (const rawEntry of entries) {
    const entry = asRecord(rawEntry)
    const plays = positiveInteger(entry.playCount, 1)
    const duration = positiveInteger(entry.duration ?? entry.dt)
    const playedAt = Number(entry.playedAt ?? entry.played_at) || 0
    playCount += plays
    totalDuration += duration * plays
    if (playedAt >= recentThreshold) recentTrackCount += 1
    const day = localDateKey(playedAt)
    if (day) activeDays.add(day)
    for (const name of artistNames(entry)) {
      artistPlays.set(name, (artistPlays.get(name) || 0) + plays)
    }
  }

  const topArtist = [...artistPlays.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '暂无记录'

  return {
    trackCount: entries.length,
    playCount,
    totalDuration,
    durationLabel: formatListeningDuration(totalDuration),
    activeDays: activeDays.size,
    recentTrackCount,
    topArtist,
  }
}

export async function loadLocalListeningStats(): Promise<LocalListeningStats> {
  return summarizeLocalListening(await dbHistory.list())
}
