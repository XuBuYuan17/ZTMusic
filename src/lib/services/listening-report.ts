export type ReportPeriod = 'all' | 'week' | 'month'
export interface ListeningTrack {
  key: string
  name: string
  artists: string[]
  cover: string
}
export interface ListeningRecord {
  key: string
  session: string
  day: string
  track: ListeningTrack
  milliseconds: number
  plays: number
  lastAt: number
}
export interface ListeningArchive {
  startedAt: number
  legacy: { playCount: number; totalDuration: number }
}
export function dayKey(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export class ListeningSession {
  readonly id: string
  readonly track: ListeningTrack
  readonly rows = new Map<string, ListeningRecord>()
  private baseline: { media: number; mono: number; wall: number } | null = null
  private total = 0
  private counted = false
  constructor(id: string, track: ListeningTrack) { this.id = id; this.track = track }

  reset(): void { this.baseline = null }

  sample(media: number, mono: number, wall: number, duration: number): void {
    const before = this.baseline
    this.baseline = { media, mono, wall }
    if (![media, mono, wall].every(Number.isFinite)) { this.reset(); return }
    if (!before) return
    const elapsed = mono - before.mono
    const advance = (media - before.media) * 1000
    // Long gaps may be sleep or suspended timers; never infer listening across them.
    if (elapsed <= 0 || elapsed > 10_000 || advance <= 0 || Math.abs(wall - before.wall - elapsed) > 1000 || Math.abs(advance - elapsed) > Math.max(400, elapsed * 0.2)) return
    const amount = Math.min(elapsed, advance)
    const threshold = Number.isFinite(duration) && duration > 0 ? Math.min(30_000, duration * 500) : 30_000
    const countedAt = !this.counted && this.total + amount >= threshold
      ? before.wall + elapsed * Math.max(0, threshold - this.total) / amount : null
    let cursor = before.wall
    while (cursor < wall) {
      const next = new Date(cursor)
      next.setHours(24, 0, 0, 0)
      const end = Math.min(wall, next.getTime())
      const day = dayKey(cursor)
      const row = this.rows.get(day) ?? { key: `${this.id}/${day}`, session: this.id, day, track: this.track, milliseconds: 0, plays: 0, lastAt: 0 }
      row.milliseconds += amount * (end - cursor) / (wall - before.wall)
      row.lastAt = end
      this.rows.set(day, row)
      cursor = end
    }
    if (countedAt !== null) {
      const day = dayKey(countedAt)
      const row = this.rows.get(day) ?? { key: `${this.id}/${day}`, session: this.id, day, track: this.track, milliseconds: 0, plays: 0, lastAt: countedAt }
      row.plays = 1
      this.rows.set(day, row)
      this.counted = true
    }
    this.total += amount
  }

  snapshot(): ListeningRecord[] { return [...this.rows.values()].map(row => ({ ...row })) }
}

export function summarizeReport(records: ListeningRecord[], period: ReportPeriod = 'all', now = Date.now()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (period === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7)
  if (period === 'month') start.setDate(1)
  const firstDay = period === 'all' ? '' : dayKey(start.getTime())
  const lastDay = dayKey(now)
  const tracks = new Map<string, ListeningRecord>()
  const artists = new Map<string, { name: string; milliseconds: number; plays: number; lastAt: number }>()
  const days = new Map<string, number>()
  let milliseconds = 0
  let plays = 0
  const unique = new Map(records.filter(row => row && typeof row.key === 'string').map(row => [row.key, row]))
  for (const row of unique.values()) {
    if (!row.track?.key || !Array.isArray(row.track.artists) || !/^\d{4}-\d{2}-\d{2}$/.test(row.day) || dayKey(new Date(`${row.day}T12:00:00`).getTime()) !== row.day || row.day < firstDay || row.day > lastDay || !Number.isFinite(row.lastAt) || row.lastAt > now || !Number.isFinite(row.milliseconds) || row.milliseconds < 0 || (!row.milliseconds && row.plays !== 1)) continue
    const count = row.plays === 1 ? 1 : 0
    milliseconds += row.milliseconds
    plays += count
    if (row.milliseconds) days.set(row.day, (days.get(row.day) ?? 0) + row.milliseconds)
    const track = tracks.get(row.track.key)
    tracks.set(row.track.key, { ...row, track: track && track.lastAt > row.lastAt ? track.track : row.track, milliseconds: (track?.milliseconds ?? 0) + row.milliseconds, plays: (track?.plays ?? 0) + count, lastAt: Math.max(track?.lastAt ?? 0, row.lastAt) })
    for (const name of new Set(row.track.artists.filter(name => typeof name === 'string' && name.trim()))) {
      const artist = artists.get(name)
      artists.set(name, { name, milliseconds: (artist?.milliseconds ?? 0) + row.milliseconds, plays: (artist?.plays ?? 0) + count, lastAt: Math.max(artist?.lastAt ?? 0, row.lastAt) })
    }
  }
  const rank = (a: { milliseconds: number; plays: number; lastAt: number }, b: typeof a) => b.milliseconds - a.milliseconds || b.plays - a.plays || b.lastAt - a.lastAt
  const chartStart = new Date(now)
  chartStart.setHours(0, 0, 0, 0)
  if (period === 'all') chartStart.setDate(chartStart.getDate() - 29)
  else chartStart.setTime(start.getTime())
  const chart: { day: string; milliseconds: number }[] = []
  for (const date = new Date(chartStart); date.getTime() <= now; date.setDate(date.getDate() + 1)) {
    const day = dayKey(date.getTime())
    chart.push({ day, milliseconds: days.get(day) ?? 0 })
  }
  return { milliseconds, plays, trackCount: tracks.size, activeDays: days.size, tracks: [...tracks.values()].sort(rank).slice(0, 10), artists: [...artists.values()].sort(rank).slice(0, 5), chart }
}

export function listeningTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}`
}
