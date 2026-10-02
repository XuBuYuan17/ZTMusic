import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import ts from 'typescript'
import { ListeningSession, summarizeReport } from './listening-report.ts'
import { ListeningCheckpoints } from '../db/listening.ts'

const saved = new Map()
let archive
let failed = false
let wall = new Date(2026, 9, 2, 12).getTime()
let mono = 0
let interval
let cleared = false
const scrobbles = []
const warnings = []
const windowEvents = new EventTarget()
Object.assign(windowEvents, { innerWidth: 392, innerHeight: 872 })
const documentEvents = new EventTarget()
const originalNow = Date.now
const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance')
const originalInterval = globalThis.setInterval
const originalClear = globalThis.clearInterval
Object.assign(globalThis, { window: windowEvents, document: documentEvents })
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => mono } })
Date.now = () => wall
globalThis.setInterval = (callback, delay) => { assert.equal(delay, 5000); interval = callback; return 1 }
globalThis.clearInterval = () => { cleared = true }

globalThis.__listeningFixture = {
  ListeningSession, ListeningCheckpoints,
  listeningDB: {
    read: async () => ({ archive, records: [...saved.values()] }),
    initialize: async value => { archive ??= value },
    save: async rows => {
      if (failed) throw new Error('fixture storage unavailable')
      for (const row of rows) saved.set(row.key, structuredClone(row))
    },
  },
  dbHistory: { list: async () => [] },
  summarizeLocalListening: () => ({ playCount: 0, totalDuration: 0 }),
  ncm: { scrobble: async (...args) => { scrobbles.push(args) } },
  apiSession: { getCookie: () => 'fixture-cookie' },
  isMobileDevice: () => true,
}
const source = await readFile(new URL('./listening-recorder.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '')
const fixture = 'const { ListeningSession, ListeningCheckpoints, listeningDB, dbHistory, summarizeLocalListening, ncm, apiSession, isMobileDevice } = globalThis.__listeningFixture;\n'
const recorder = await import(`data:text/javascript;base64,${Buffer.from(fixture + code).toString('base64')}`)
const track = { id: 1, name: '测试歌曲', ar: [{ name: '测试歌手' }], al: { picUrl: '' } }
let position = 0
const state = () => ({ currentTime: position, duration: 180, paused: false, ended: false, src: '', networkState: 1, readyState: 4 })
const observe = signal => recorder.observeListening(signal, state(), track)
const seconds = count => {
  for (let i = 0; i < count; i++) { position++; mono += 1000; wall += 1000; observe('sample') }
}
const report = () => summarizeReport([...saved.values()], 'all', wall)
let stop
try {
  stop = recorder.installListeningRecorder(message => warnings.push(message))
  assert.equal(typeof interval, 'function', 'mobile installs the periodic checkpoint')
  await recorder.initializeListening()
  assert.ok(archive, 'mobile initializes its listening archive')
  recorder.beginListening(track)
  observe('source')
  observe('resume')
  seconds(31)
  interval()
  await setImmediate()
  assert.equal(report().milliseconds, 31_000, 'mobile playback accumulates real time')
  assert.equal(report().plays, 1)
  assert.equal(scrobbles.length, 1)
  observe('suspend')
  await recorder.flushListening()
  seconds(10)
  observe('reset')
  position = 120
  observe('resume')
  seconds(5)
  documentEvents.dispatchEvent(new Event('visibilitychange'))
  await setImmediate()
  assert.equal(report().milliseconds, 36_000, 'pause and seek do not inflate listening')
  assert.equal(report().plays, 1, 'resume does not count a second play')
  await recorder.flushListening()
  assert.equal(report().milliseconds, 36_000, 'repeated checkpoints overwrite, not add')
  seconds(5)
  failed = true
  await recorder.flushListening()
  assert.ok(recorder.listeningSaveError())
  assert.equal(warnings.length, 1, 'a failed write is visible to the user')
  failed = false
  await recorder.flushListening()
  assert.equal(report().milliseconds, 41_000, 'failed writes retain data for retry')
  assert.equal(recorder.listeningSaveError(), '')
  observe('end')
  await recorder.flushListening()
  assert.equal(report().plays, 1)
  stop()
  assert.equal(cleared, true)
} finally {
  stop?.()
  await recorder.flushListening()
  Date.now = originalNow
  if (originalPerformance) Object.defineProperty(globalThis, 'performance', originalPerformance)
  globalThis.setInterval = originalInterval
  globalThis.clearInterval = originalClear
  delete globalThis.__listeningFixture
}
console.log('Mobile listening recorder: archive, playback, checkpoints, pause, seek, scrobble and retry passed')
