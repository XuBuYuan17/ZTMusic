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
  /** 有效播放次数：原始行是 0/1，压缩合并后的行是累加值 */
  plays: number
  lastAt: number
  /** 小时 → 毫秒的稀疏分布；启用时段统计前的老行没有这个字段 */
  hours?: Record<string, number>
}
export interface ListeningArchive {
  startedAt: number
  legacy: { playCount: number; totalDuration: number }
}
export function dayKey(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
// 保留期内留逐次播放的原始行，更早的按「同一天同一首」合并。调这个值只影响存储占用，不影响任何指标
export const LISTENING_RETENTION_DAYS = 90

// 日期键回环校验：既挡非法格式，也挡 2026-02-31 这种会被 Date 滚动到下月的值
function validDay(day: unknown): day is string {
  if (typeof day !== 'string' || day.length !== 10) return false
  const time = new Date(`${day}T12:00:00`).getTime()
  return Number.isFinite(time) && dayKey(time) === day
}

// 去重后的歌手名，合作歌曲只算一次
function artistNames(row: ListeningRecord): Set<string> {
  const list = Array.isArray(row.track?.artists) ? row.track.artists : []
  return new Set(list.filter(name => typeof name === 'string' && name.trim()))
}

/** 把同一 (track, day) 的多行合并成一行：毫秒、计次、时段求和，lastAt 取最新 */
export function mergeListeningRows(rows: ListeningRecord[]): ListeningRecord | null {
  const head = rows[0]
  if (!head) return null
  const hours: Record<string, number> = {}
  let milliseconds = 0
  let plays = 0
  let lastAt = 0
  for (const row of rows) {
    milliseconds += row.milliseconds
    plays += row.plays
    lastAt = Math.max(lastAt, row.lastAt)
    for (const [hour, ms] of Object.entries(row.hours ?? {})) hours[hour] = (hours[hour] ?? 0) + ms
  }
  return { key: `${head.track.key}/${head.day}`, session: '', day: head.day, track: head.track, milliseconds, plays, lastAt, hours }
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

  /** 累计有效播放毫秒数。听歌打卡上报的 time 用它，而不是当前播放位置——seek 跳过的部分不算听过 */
  get playedMs(): number { return this.total }

  /** 采样一次。返回 true 表示这次刚跨过「有效播放」阈值（min(30 秒, 半首歌)），
   *  每个 session 至多返回一次——调用方据此触发听歌打卡。 */
  sample(media: number, mono: number, wall: number, duration: number): boolean {
    const before = this.baseline
    this.baseline = { media, mono, wall }
    if (![media, mono, wall].every(Number.isFinite)) { this.reset(); return false }
    if (!before) return false
    const elapsed = mono - before.mono
    const advance = (media - before.media) * 1000
    // Long gaps may be sleep or suspended timers; never infer listening across them.
    if (elapsed <= 0 || elapsed > 10_000 || advance <= 0 || Math.abs(wall - before.wall - elapsed) > 1000 || Math.abs(advance - elapsed) > Math.max(400, elapsed * 0.2)) return false
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
      const row = this.rows.get(day) ?? { key: `${this.id}/${day}`, session: this.id, day, track: this.track, milliseconds: 0, plays: 0, lastAt: 0, hours: {} }
      const share = amount * (end - cursor) / (wall - before.wall)
      row.milliseconds += share
      // 同一段再按整点切一次，得到真实的时段分布。中国无夏令时，setMinutes(60) 就是下一个整点
      const hours = (row.hours ??= {})
      let hourCursor = cursor
      while (hourCursor < end) {
        const nextHour = new Date(hourCursor)
        nextHour.setMinutes(60, 0, 0)
        const stop = Math.min(end, nextHour.getTime())
        const hour = String(new Date(hourCursor).getHours())
        hours[hour] = (hours[hour] ?? 0) + share * (stop - hourCursor) / (end - cursor)
        hourCursor = stop
      }
      row.lastAt = end
      this.rows.set(day, row)
      cursor = end
    }
    if (countedAt !== null) {
      const day = dayKey(countedAt)
      const row = this.rows.get(day) ?? { key: `${this.id}/${day}`, session: this.id, day, track: this.track, milliseconds: 0, plays: 0, lastAt: countedAt, hours: {} }
      row.plays += 1
      this.rows.set(day, row)
      this.counted = true
    }
    this.total += amount
    return countedAt !== null
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
  const hours = new Array<number>(24).fill(0)
  let milliseconds = 0
  let plays = 0
  let firstAt: number | null = null
  let lastAt: number | null = null
  const unique = new Map(records.filter(row => row && typeof row.key === 'string').map(row => [row.key, row]))
  // 首次出现必须在周期过滤之前统计，否则「本周期新遇见」只会等于周期内听过的总数
  const debutTracks = new Map<string, string>()
  const debutArtists = new Map<string, string>()
  for (const row of unique.values()) {
    if (!row.track?.key || !validDay(row.day)) continue
    const trackDay = debutTracks.get(row.track.key)
    if (trackDay === undefined || row.day < trackDay) debutTracks.set(row.track.key, row.day)
    for (const name of artistNames(row)) {
      const artistDay = debutArtists.get(name)
      if (artistDay === undefined || row.day < artistDay) debutArtists.set(name, row.day)
    }
  }
  for (const row of unique.values()) {
    if (!row.track?.key || !Array.isArray(row.track.artists) || !validDay(row.day) || row.day < firstDay || row.day > lastDay || !Number.isFinite(row.lastAt) || row.lastAt > now || !Number.isFinite(row.milliseconds) || row.milliseconds < 0 || (!row.milliseconds && !row.plays)) continue
    const count = row.plays > 0 ? Math.floor(row.plays) : 0
    milliseconds += row.milliseconds
    plays += count
    firstAt = firstAt === null ? row.lastAt : Math.min(firstAt, row.lastAt)
    lastAt = lastAt === null ? row.lastAt : Math.max(lastAt, row.lastAt)
    if (row.milliseconds) days.set(row.day, (days.get(row.day) ?? 0) + row.milliseconds)
    for (const [hour, ms] of Object.entries(row.hours ?? {})) {
      const index = Number(hour)
      if (Number.isInteger(index) && index >= 0 && index < 24 && Number.isFinite(ms) && ms > 0) hours[index] = (hours[index] ?? 0) + ms
    }
    const track = tracks.get(row.track.key)
    tracks.set(row.track.key, { ...row, track: track && track.lastAt > row.lastAt ? track.track : row.track, milliseconds: (track?.milliseconds ?? 0) + row.milliseconds, plays: (track?.plays ?? 0) + count, lastAt: Math.max(track?.lastAt ?? 0, row.lastAt) })
    for (const name of artistNames(row)) {
      const artist = artists.get(name)
      artists.set(name, { name, milliseconds: (artist?.milliseconds ?? 0) + row.milliseconds, plays: (artist?.plays ?? 0) + count, lastAt: Math.max(artist?.lastAt ?? 0, row.lastAt) })
    }
  }
  const rank = (a: { milliseconds: number; plays: number; lastAt: number }, b: typeof a) => b.milliseconds - a.milliseconds || b.plays - a.plays || b.lastAt - a.lastAt
  const chartStart = new Date(now)
  chartStart.setHours(0, 0, 0, 0)
  // 热力图按周排：'all' 从 52 周前的那个周一开始，正好铺满 53 列 × 7 行
  if (period === 'all') chartStart.setDate(chartStart.getDate() - (chartStart.getDay() + 6) % 7 - 52 * 7)
  else chartStart.setTime(start.getTime())
  const chart: { day: string; milliseconds: number }[] = []
  for (const date = new Date(chartStart); date.getTime() <= now; date.setDate(date.getDate() + 1)) {
    const day = dayKey(date.getTime())
    chart.push({ day, milliseconds: days.get(day) ?? 0 })
  }
  const weekdays = new Array<number>(7).fill(0)
  const months = new Map<string, number>()
  const sorted = [...days.keys()].sort()
  for (const day of sorted) {
    const date = new Date(`${day}T12:00:00`)
    const weekday = (date.getDay() + 6) % 7
    weekdays[weekday] = (weekdays[weekday] ?? 0) + (days.get(day) ?? 0)
    const month = day.slice(0, 7)
    months.set(month, (months.get(month) ?? 0) + (days.get(day) ?? 0))
  }
  let longest = 0
  let run = 0
  let previous = ''
  for (const day of sorted) {
    // 逐日回退比较，不用毫秒差除以 86400000，跨月跨年才不会错
    run = previous && dayKey(new Date(`${previous}T12:00:00`).getTime() + 86_400_000) === day ? run + 1 : 1
    previous = day
    if (run > longest) longest = run
  }
  let bestDay: { day: string; milliseconds: number } | null = null
  for (const [day, value] of days) if (!bestDay || value > bestDay.milliseconds) bestDay = { day, milliseconds: value }
  let topTrack: ListeningRecord | null = null
  for (const row of tracks.values()) if (row.plays > 0 && (!topTrack || row.plays > topTrack.plays)) topTrack = row
  const debutCount = (map: Map<string, string>) => { let total = 0; for (const day of map.values()) if (day >= firstDay) total++; return total }
  return {
    milliseconds, plays, trackCount: tracks.size, activeDays: days.size,
    tracks: [...tracks.values()].sort(rank).slice(0, 10),
    artists: [...artists.values()].sort(rank).slice(0, 5),
    chart, hours, weekdays,
    months: [...months].map(([month, value]) => ({ month, milliseconds: value })),
    // 今天还没听不该算断连击，所以当前段允许结束在今天或昨天。
    // 基准必须是 now 而不是 start —— week/month 周期下 start 是周期起点，减一天会落到周期之外
    streak: { current: previous === dayKey(now) || previous === dayKey(now - 86_400_000) ? run : 0, longest },
    averagePerDay: days.size ? milliseconds / days.size : 0,
    bestDay, topTrack, firstAt, lastAt,
    diversity: { tracks: tracks.size, artists: artists.size },
    discovered: { tracks: debutCount(debutTracks), artists: debutCount(debutArtists) },
  }
}

export function listeningTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}`
}
