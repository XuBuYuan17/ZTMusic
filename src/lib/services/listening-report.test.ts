import assert from 'node:assert/strict'
import { ListeningSession, dayKey, mergeListeningRows, summarizeReport, type ListeningRecord } from './listening-report.ts'
import { ListeningCheckpoints } from '../db/listening.ts'
import type { CompactTrack } from '../player/queue.ts'
import type { PlayerEngineState } from '../types/player.ts'

const track = { key: 'online:1', name: '测试歌曲', artists: ['甲', '乙', '甲'], cover: '' }
const start = new Date(2026, 8, 28, 12).getTime()
function advance(session: ListeningSession, seconds: number, media = 0, wall = start, duration = 180) {
  session.sample(media, 0, wall, duration)
  for (let i = 1; i <= seconds; i++) session.sample(media + i, i * 1000, wall + i * 1000, duration)
}
const session = new ListeningSession('a', track)
advance(session, 29)
assert.equal(summarizeReport(session.snapshot(), 'all', start + 29_000).plays, 0)
session.sample(30, 30_000, start + 30_000, 180)
assert.equal(summarizeReport(session.snapshot(), 'all', start + 30_000).plays, 1)
session.reset()
advance(session, 31, 30, start + 100_000)
assert.equal(summarizeReport(session.snapshot(), 'all', start + 140_000).plays, 1, 'pause/resume and retry keep the session count')
assert.equal(summarizeReport(session.snapshot(), 'all', start + 140_000).milliseconds, 61_000)

const short = new ListeningSession('short', track)
advance(short, 10, 0, start, 20)
assert.equal(short.snapshot()[0]?.plays, 1)
const unknown = new ListeningSession('unknown', track)
advance(unknown, 30, 0, start, 0)
assert.equal(unknown.snapshot()[0]?.plays, 1)
const jumps = new ListeningSession('jump', track)
jumps.sample(0, 0, start, 180)
jumps.sample(80, 1000, start + 1000, 180)
jumps.sample(1, 2000, start + 2000, 180)
jumps.sample(1, 3000, start + 3000, 180)
assert.equal(jumps.snapshot().length, 0, 'seek and buffering do not add time')
jumps.sample(2, 4000, start + 4000, 180)
jumps.sample(122, 124000, start + 124000, 180)
assert.equal(jumps.snapshot()[0]?.milliseconds, 1000, 'sleep gap discarded')
jumps.reset()
jumps.sample(170, 125000, start + 125000, 180)
assert.equal(jumps.snapshot()[0]?.milliseconds, 1000, 'native seeking resets even a small jump')

// sample() 的返回值是听歌打卡的触发信号：整个 session 只在跨过阈值的那一次返回 true
const signal = new ListeningSession('signal', track)
signal.sample(0, 0, start, 180)
const early = Array.from({ length: 29 }, (_, i) => signal.sample(i + 1, (i + 1) * 1000, start + (i + 1) * 1000, 180))
assert.ok(early.every(value => value === false), 'threshold not reached yet')
assert.equal(signal.sample(30, 30_000, start + 30_000, 180), true, 'true on the sample that crosses the threshold')
assert.equal(signal.sample(31, 31_000, start + 31_000, 180), false, 'true at most once per session')
assert.equal(signal.playedMs, 31_000, 'playedMs counts only accepted samples')

// 被丢弃的采样（seek、休眠缺口、pause）永远不返回 true，也不累计 playedMs
const dropped = new ListeningSession('dropped', track)
dropped.sample(0, 0, start, 180)
assert.equal(dropped.sample(80, 1000, start + 1000, 180), false, 'seek jump')
assert.equal(dropped.playedMs, 0)

const midnight = new Date(2026, 8, 29).getTime()
const split = new ListeningSession('midnight', track)
advance(split, 35, 0, midnight - 30_000)
assert.deepEqual(split.snapshot().map(row => [row.day, row.milliseconds, row.plays]), [
  [dayKey(midnight - 1), 30_000, 0], [dayKey(midnight), 5000, 1],
])
const repeat = new ListeningSession('repeat', track)
advance(repeat, 30)
assert.equal(summarizeReport([...session.snapshot(), ...repeat.snapshot()], 'all', start + 200000).plays, 2)
const report = summarizeReport(split.snapshot(), 'all', midnight + 10_000)
assert.equal(report.artists.length, 2)
assert.equal(report.artists[0]?.milliseconds, report.milliseconds, 'collaborators receive full time without inflating report total')
assert.equal(report.activeDays, 2)

const weekStart = new Date(2026, 8, 28).getTime()
const rows: ListeningRecord[] = Array.from({ length: 250 }, (_, i) => ({ key: `row${i}`, session: `${i}`, day: dayKey(weekStart), track: { ...track, key: `${i}` }, milliseconds: 1000, plays: 0, lastAt: weekStart + 1000 }))
rows.push({ ...rows[0]!, key: 'sunday', day: dayKey(weekStart - 86400000), lastAt: weekStart - 1000, milliseconds: 60000 })
assert.equal(summarizeReport(rows, 'week', start).trackCount, 250)
assert.equal(summarizeReport(rows, 'week', start).milliseconds, 250000)
assert.equal(summarizeReport(rows, 'month', start).milliseconds, 310000)
const allChart = summarizeReport(rows, 'all', start).chart
assert.equal(allChart.length, 365, 'the all-time heatmap covers 53 weeks')
assert.equal(new Date(`${allChart[0]!.day}T12:00:00`).getDay(), 1, 'the heatmap starts on a Monday so its columns are whole weeks')
assert.equal(summarizeReport([...rows, rows[0]!], 'all', start).milliseconds, 310000, 'duplicate keys do not inflate results')
assert.equal(summarizeReport([{ ...rows[0]!, milliseconds: NaN }, { ...rows[0]!, key: 'invalid', day: '2026-02-31' }], 'all', start).milliseconds, 0)
const tieRows = [0, 1, 2].map(i => ({ ...rows[i]!, milliseconds: 10000, plays: i === 0 ? 0 : 1, lastAt: start - 3000 + i * 1000 }))
assert.deepEqual(summarizeReport(tieRows, 'all', start).tracks.map(row => row.track.key), ['2', '1', '0'])

const hourEdge = new Date(2026, 8, 28, 13, 59, 30).getTime()
const hourly = new ListeningSession('hourly', track)
hourly.sample(0, 0, hourEdge, 180)
for (let i = 1; i <= 60; i++) hourly.sample(i, i * 1000, hourEdge + i * 1000, 180)
const hourRow = hourly.snapshot()[0]!
assert.equal(hourRow.hours?.['13'], 30_000, 'the half-minute before the hour lands in hour 13')
assert.equal(hourRow.hours?.['14'], 30_000, 'the half-minute after the hour lands in hour 14')

const compacted = mergeListeningRows([
  { key: 'a/2026-01-01', session: 'a', day: '2026-01-01', track, milliseconds: 60_000, plays: 1, lastAt: 1000, hours: { '9': 60_000 } },
  { key: 'b/2026-01-01', session: 'b', day: '2026-01-01', track, milliseconds: 30_000, plays: 1, lastAt: 5000, hours: { '9': 10_000, '10': 20_000 } },
  { key: 'c/2026-01-01', session: 'c', day: '2026-01-01', track, milliseconds: 10_000, plays: 1, lastAt: 3000 },
])
assert.equal(compacted?.key, 'online:1/2026-01-01')
assert.equal(compacted?.milliseconds, 100_000)
assert.equal(compacted?.plays, 3)
assert.equal(compacted?.lastAt, 5000)
assert.deepEqual(compacted?.hours, { '9': 70_000, '10': 20_000 })
assert.equal(mergeListeningRows([]), null)
assert.equal(summarizeReport([compacted!], 'all', start).plays, 3, 'a compacted row counts every play it holds')

const bare: ListeningRecord[] = [{ key: 'old', session: 'o', day: dayKey(start), track, milliseconds: 12_000, plays: 1, lastAt: start }]
const bareReport = summarizeReport(bare, 'all', start)
assert.deepEqual(bareReport.hours, new Array(24).fill(0), 'rows recorded before the histogram existed read as empty')
assert.equal(bareReport.weekdays.reduce((sum, value) => sum + value, 0), 12_000)

const empty = summarizeReport([], 'all', start)
assert.deepEqual(empty.hours, new Array(24).fill(0))
assert.deepEqual(empty.weekdays, new Array(7).fill(0))
assert.deepEqual(empty.months, [])
assert.equal(empty.bestDay, null)
assert.equal(empty.topTrack, null)
assert.equal(empty.firstAt, null)
assert.equal(empty.averagePerDay, 0)
assert.deepEqual(empty.streak, { current: 0, longest: 0 })
assert.deepEqual(empty.discovered, { tracks: 0, artists: 0 })
assert.deepEqual(empty.diversity, { tracks: 0, artists: 0 })

function dayRow(day: string, key = day, artist = '甲', trackKey = `t${key}`): ListeningRecord {
  return { key, session: 's', day, track: { ...track, key: trackKey, artists: [artist] }, milliseconds: 60_000, plays: 1, lastAt: new Date(`${day}T12:00:00`).getTime() }
}
const crossing = ['2026-08-30', '2026-08-31', '2026-09-01'].map(day => dayRow(day))
assert.equal(summarizeReport(crossing, 'all', new Date(2026, 8, 1, 20).getTime()).streak.longest, 3, 'a streak survives the month boundary')
assert.equal(summarizeReport(crossing, 'all', new Date(2026, 8, 2, 20).getTime()).streak.current, 3, 'yesterday keeps the current streak alive')
assert.equal(summarizeReport(crossing, 'all', new Date(2026, 8, 3, 20).getTime()).streak.current, 0)

// 「昨天」必须相对 now 算。week/month 周期下 start 是周期起点（周一 / 1 号），拿它减一天会落到周期外
const weekStreak = ['2026-09-28', '2026-09-29'].map(day => dayRow(day))
assert.equal(summarizeReport(weekStreak, 'week', new Date(2026, 8, 30, 20).getTime()).streak.current, 2, '本周只在周一周二听过，今天没听也不该断')
assert.equal(summarizeReport(weekStreak, 'month', new Date(2026, 8, 30, 20).getTime()).streak.current, 2, 'month 周期口径一致')
assert.equal(summarizeReport(weekStreak, 'week', new Date(2026, 9, 1, 20).getTime()).streak.current, 0, '隔了两天就该断')

const debuts = [dayRow('2026-08-15', 'x1', '甲', 'x'), dayRow('2026-09-20', 'x2', '甲', 'x'), dayRow('2026-09-20', 'y', '丙', 'y')]
const debutReport = summarizeReport(debuts, 'month', new Date(2026, 8, 25, 12).getTime())
assert.deepEqual(debutReport.discovered, { tracks: 1, artists: 1 }, 'only first encounters inside the period count as discoveries')
assert.deepEqual(debutReport.diversity, { tracks: 2, artists: 2 })

let fail = true
const saved = new Map<string, ListeningRecord>()
const writer = new ListeningCheckpoints(async batch => {
  if (fail) throw new Error('disk full')
  for (const row of batch) saved.set(row.key, row)
})
writer.put(rows)
await assert.rejects(writer.flush())
fail = false
await writer.flush()
writer.put(rows)
await writer.flush()
assert.equal(saved.size, rows.length, 'retry and repeated checkpoint overwrite')
let release!: () => void
let writes = 0
const concurrent = new ListeningCheckpoints(async batch => {
  if (++writes === 1) await new Promise<void>(resolve => { release = resolve })
  for (const row of batch) saved.set(row.key, row)
})
concurrent.put([rows[0]!])
const flight = concurrent.flush()
concurrent.put([{ ...rows[0]!, milliseconds: 4000 }])
release()
await flight
assert.equal(saved.get(rows[0]!.key)?.milliseconds, 4000, 'updates arriving during save are preserved')

class FakeAudio extends EventTarget {
  currentTime = 0
  duration = 180
  paused = true
  ended = false
  readyState = 4
  networkState = 1
  src = ''
  currentSrc = ''
  error = null
  volume = 1
  preload = ''
  canPlayType() { return 'probably' }
  removeAttribute() { this.src = '' }
  load() { this.dispatchEvent(new Event('loadstart')) }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
  async play() { this.paused = false; this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing')) }
}
Object.assign(globalThis, { Audio: FakeAudio })
const { engine, AudioEngine } = await import('../player/engine.ts')
assert.ok(engine instanceof AudioEngine, 'web checks use the HTML audio implementation')
const signals: string[] = []
engine.onListening(signal => signals.push(signal))
engine.load('https://example.com/1.mp3')
await engine.play()
assert.equal(signals.at(-1), 'resume')
engine.audio.dispatchEvent(new Event('waiting'))
assert.equal(signals.at(-1), 'suspend')
engine.seek(90)
assert.equal(signals.at(-1), 'reset')
engine.audio.dispatchEvent(new Event('seeked'))
assert.equal(signals.at(-1), 'resume')
engine.audio.dispatchEvent(new Event('error'))
assert.equal(signals.at(-1), 'suspend')
const previous = engine.audio
engine.preload('https://example.com/2.mp3')
const beforePreload = signals.length
engine.preloadAudio.dispatchEvent(new Event('timeupdate'))
assert.equal(signals.length, beforePreload, 'hidden preloaded audio is not observed')
engine.swapToPreloaded()
assert.equal(signals.at(-1), 'source')
const afterSwap = signals.length
previous.dispatchEvent(new Event('timeupdate'))
assert.equal(signals.length, afterSwap, 'old audio detached after swap')
await engine.play()
engine.audio.dispatchEvent(new Event('ended'))
assert.equal(signals.at(-1), 'end')
engine.destroy()

// 听歌打卡：只上报网易云在线曲目、未登录不发请求、每个 session 至多一次。
// 用 'sample'（引擎 timeupdate）推进——'resume' 每次都 reset 基线，推不动 session
let scrobbles: string[] = []
let mono = 0
let wall = start
Object.assign(globalThis, {
  // innerWidth/Height 必须给：recorder 里 isMobileDevice() 短路会让整条链路直接返回
  window: { innerWidth: 1440, innerHeight: 900, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  performance: { now: () => mono },
  fetch: async (url: unknown) => { scrobbles.push(String(url)); return new Response('{}', { status: 200 }) },
})
const realNow = Date.now
Date.now = () => wall
const { observeListening: observe } = await import('./listening-recorder.ts')
const { apiSession } = await import('../api/session.ts')
const online: CompactTrack = { id: 42, name: '在线曲', ar: [{ id: 7, name: '甲' }], al: { name: '专辑', picUrl: '' }, dt: 180_000, picUrl: '' }
const at = (second: number): PlayerEngineState => ({ src: 'https://example.com/1.mp3', currentTime: second, duration: 180, ended: false, networkState: 1, readyState: 4, paused: false })
function play(seconds: number, track: CompactTrack): void {
  observe('end', at(0), track)
  mono = 0
  wall = start
  observe('resume', at(0), track)
  for (let i = 1; i <= seconds; i++) {
    mono = i * 1000
    wall = start + i * 1000
    observe('sample', at(i), track)
  }
}

// ncm.scrobble 是异步的，走到 fetch 前要跨几个 await；同步断言会永远看不到请求
const settle = () => new Promise(resolve => setTimeout(resolve, 20))

apiSession.setCookie('')
scrobbles = []
play(31, online)
await settle()
assert.equal(scrobbles.length, 0, '未登录时不发打卡请求')

apiSession.setCookie('MUSIC_U=test')
scrobbles = []
play(31, online)
await settle()
assert.equal(scrobbles.length, 1, '跨过阈值只发一次')
assert.match(scrobbles[0] ?? '', /scrobble/, '打到打卡端点')

scrobbles = []
play(31, { ...online, source: 'local' })
await settle()
assert.equal(scrobbles.length, 0, '本地曲目不上报')

Date.now = realNow
console.log('listening report: timing, ranking, checkpoints and engine signals passed')
