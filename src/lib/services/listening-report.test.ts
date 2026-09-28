import assert from 'node:assert/strict'
import { ListeningSession, dayKey, summarizeReport, type ListeningRecord } from './listening-report.ts'
import { ListeningCheckpoints } from '../db/listening.ts'

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
assert.equal(summarizeReport(rows, 'all', start).chart.length, 30)
assert.equal(summarizeReport([...rows, rows[0]!], 'all', start).milliseconds, 310000, 'duplicate keys do not inflate results')
assert.equal(summarizeReport([{ ...rows[0]!, milliseconds: NaN }, { ...rows[0]!, key: 'invalid', day: '2026-02-31' }], 'all', start).milliseconds, 0)
const tieRows = [0, 1, 2].map(i => ({ ...rows[i]!, milliseconds: 10000, plays: i === 0 ? 0 : 1, lastAt: start - 3000 + i * 1000 }))
assert.deepEqual(summarizeReport(tieRows, 'all', start).tracks.map(row => row.track.key), ['2', '1', '0'])

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
const { engine } = await import('../player/engine.ts')
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
console.log('listening report: timing, ranking, checkpoints and engine signals passed')
