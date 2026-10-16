import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { compactTrack, appendQueueState, createShuffleState, getNextIndex, getPrevIndex, commitNextIndex, commitPrevIndex, resolveQueueSelection } from './queue.ts'
import { createFallbackController } from './fallback.ts'
import { PLAYBACK, ERROR_MESSAGES, STORAGE_KEYS } from '../utils/constants.ts'

class FakeAudio extends EventTarget {
  src = ''
  currentSrc = ''
  currentTime = 0
  duration = 180
  readyState = 3
  paused = true
  error = null
  playResult = null
  canPlayType() { return 'probably' }
  load() {}
  removeAttribute() { this.src = '' }
  pause() { this.paused = true }
  play() { this.paused = false; return this.playResult ?? Promise.resolve() }
}
globalThis.Audio = FakeAudio
const { AudioEngine } = await import('./engine.ts')
const source = await readFile(new URL('../stores/player.svelte.ts', import.meta.url), 'utf8')
const script = stripTypeScriptTypes(source.slice(source.indexOf('function errorMessage'), source.indexOf('/** 全局单例 */')))
const track = id => compactTrack({ id, name: `Song ${id}`, ar: [], al: {}, dt: 180000 })

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

function harness() {
  const engine = new AudioEngine()
  const errors = []
  const storage = new Map()
  const invalidated = []
  const timers = []
  let fillUrls = async (_id, _revision, options) => options.currentUrls
  let resolveUrls = async (id, _quality, cache) => {
    const urls = cache.get(id) ?? [`https://audio.test/${id}`]
    cache.delete(id)
    return { urls, firstUrlLevel: 'standard', isTrial: false }
  }
  const context = {
    engine, URL, AbortController, DOMException, createFallbackController, compactTrack, createShuffleState, appendQueueState,
    getNextIndex, getPrevIndex, commitNextIndex, commitPrevIndex, resolveQueueSelection,
    PLAYBACK, ERROR_MESSAGES, STORAGE_KEYS,
    ERROR_KIND: { TIMEOUT: 'timeout' },
    setTimeout: callback => { timers.push(callback); return timers.length },
    clearTimeout: handle => { timers[handle - 1] = null },
    normalizeImageUrl: value => value,
    abortAllRequests() {}, observeListening() {}, beginListening() {},
    installListeningRecorder: () => () => {},
    initializeListening: async () => {}, dbHistory: { add: async () => {} },
    shouldUseWebMediaSession: () => false, debugLog() {},
    setStorage: (key, value) => storage.set(key, value),
    getPlayableUrls: (...args) => resolveUrls(...args),
    fillFallbackUrls: (...args) => fillUrls(...args),
    invalidatePlayableUrl: async (id, url) => { invalidated.push({ id, url }) },
    swallowError() {},
    getLocalPlayableUrl: async () => 'https://audio.test/local',
    getWebDavPlayableUrl: async () => 'https://audio.test/webdav',
    getBooleanSetting: () => true,
    getStorage: (key, fallback) => storage.get(key) ?? fallback,
    getStorageJson: (key, fallback) => storage.get(key) ?? fallback,
    replaceQueueState: (queue, queueIndex) => ({ queue, queueIndex }),
    restoreShuffleState: () => createShuffleState(),
  }
  runInNewContext(script + '\nglobalThis.PlayerState = PlayerState', context)
  const player = Object.assign(Object.create(context.PlayerState.prototype), {
    id: 1, currentTrack: track(1), currentTime: 0, duration: 180,
    queue: [track(1), track(2), track(3)], queueIndex: 0, queueRevision: 0, mode: 'list', preferredLevel: 'standard',
    playing: false, loading: false, _shouldAutoPlay: true, _restoreSeeking: false,
    _playRequestId: 1, _abortController: new AbortController(), _advanceLock: false,
    _fallback: createFallbackController([]), _prefetchCache: new Map(), shuffleState: createShuffleState(),
    _authProvider: { isLoggedIn: () => false, checkLoginStatus: async () => true },
    _persistState() {}, _syncTimedMedia() {}, _startLoadingTimeout() {}, _clearLoadingTimer() {},
    _setPlayerError: (...args) => { errors.push(args[0]); player.error = args[0] },
    _setNoUrlError: () => { errors.push('NoUrl'); player.error = 'NoUrl' },
    _prefetchNextTrack() {}, _fillFallbackInBackground() {},
  })
  return { player, engine, errors, storage, invalidated, timers, resolveWith: fn => { resolveUrls = fn }, fillWith: fn => { fillUrls = fn } }
}

let passed = 0
async function test(name, run) {
  await run()
  passed++
  console.log(`PASS: ${name}`)
}

await test('late fallback rejection cannot advance a new track', async () => {
  const { player, engine, errors } = harness()
  const oldPlay = deferred()
  engine.audio.playResult = oldPlay.promise
  player._fallback.updateUrls(['https://audio.test/old'])
  player._fallbackNext()
  player._playRequestId++
  player._fallback.updateUrls(['https://audio.test/new', 'https://audio.test/new-backup'])
  player._fallback.next()
  engine.load('https://audio.test/new')
  oldPlay.reject(new Error('old playback was interrupted'))
  await settle()
  assert.equal(engine.src, 'https://audio.test/new')
  assert.equal(player._fallback.getState().index, 0)
  assert.deepEqual(errors, [])
})

await test('a delayed engine error from an old source cannot invalidate the new source', async () => {
  const { player, engine, errors, invalidated } = harness()
  player._setupEngineListeners()
  player._fallback.updateUrls(['https://audio.test/new'])
  player._fallback.next()
  engine.load('https://audio.test/new')
  engine._onError({ ...engine.getState(), src: 'https://audio.test/old', code: 2, message: 'Old source failed' })
  assert.deepEqual(player._fallback.getUrls(), ['https://audio.test/new'])
  assert.deepEqual(invalidated, [])
  assert.deepEqual(errors, [])
})

await test('late rejection from a replaced URL does not advance the same session twice', async () => {
  const { player, engine, errors } = harness()
  const oldPlay = deferred()
  engine.audio.playResult = oldPlay.promise
  player._fallback.updateUrls(['https://audio.test/one', 'https://audio.test/two', 'https://audio.test/three'])
  player._fallbackNext()
  engine.audio.playResult = Promise.resolve()
  player._fallbackNext()
  oldPlay.reject(new Error('previous URL failed'))
  await settle()
  assert.equal(engine.src, 'https://audio.test/two')
  assert.deepEqual(errors, [])
})

await test('a current playback failure still tries the next URL', async () => {
  const { player, engine, errors } = harness()
  const currentPlay = deferred()
  engine.audio.playResult = currentPlay.promise
  player._fallback.updateUrls(['https://audio.test/one', 'https://audio.test/two'])
  player._fallbackNext()
  engine.audio.playResult = Promise.resolve()
  currentPlay.reject(new Error('current URL failed'))
  await settle()
  assert.equal(engine.src, 'https://audio.test/two')
  assert.deepEqual(errors, [], 'recoverable source failures stay silent while another candidate is available')
})

await test('late resume rejection cannot mutate the new track', async () => {
  const { player, engine, errors } = harness()
  engine.load('https://audio.test/old')
  player._fallback.updateUrls(['https://audio.test/old'])
  player._fallback.next()
  const oldPlay = deferred()
  engine.audio.playResult = oldPlay.promise
  player.togglePlay()
  player._playRequestId++
  player._fallback.updateUrls(['https://audio.test/new', 'https://audio.test/new-backup'])
  player._fallback.next()
  engine.load('https://audio.test/new')
  oldPlay.reject(new Error('old resume failed'))
  await settle()
  assert.equal(engine.src, 'https://audio.test/new')
  assert.deepEqual(errors, [])
})

await test('pausing pending playback does not treat its AbortError as a source failure', async () => {
  const { player, engine, errors } = harness()
  const pendingPlay = deferred()
  engine.audio.playResult = pendingPlay.promise
  player.playTrack(player.queue[0], 0)
  await settle()
  player.togglePlay()
  pendingPlay.reject(new DOMException('play interrupted by pause', 'AbortError'))
  await settle()
  assert.equal(engine.paused, true)
  assert.equal(player.playing, false)
  assert.equal(player._fallback.getState().index, 0)
  assert.deepEqual(errors, [])
})

await test('pausing during URL resolution keeps the new source paused', async () => {
  const { player, engine, errors, resolveWith } = harness()
  const urls = deferred()
  resolveWith(() => urls.promise)
  player.playTrack(player.queue[0], 0)
  player.pause()
  urls.resolve({ urls: ['https://audio.test/one'], firstUrlLevel: 'standard', isTrial: false })
  await settle()
  assert.equal(engine.src, 'https://audio.test/one')
  assert.equal(engine.paused, true)
  assert.deepEqual(errors, [])
})

await test('system media play restores playback intent after an explicit pause', async () => {
  const { player, engine } = harness()
  player._setupEngineListeners()
  player._commitProgress = time => { player.currentTime = time }
  player._fallback.updateUrls(['https://audio.test/one'])
  engine.load('https://audio.test/one')
  player._handleMediaButton('pause')
  assert.equal(player._shouldAutoPlay, false)
  player._handleMediaButton('play')
  await settle()
  engine.audio.dispatchEvent(new Event('playing'))
  assert.equal(player._shouldAutoPlay, true)
  assert.equal(player.playing, true)
})

await test('native play errors remain visible even without a frontend URL chain', async () => {
  const { player, engine, errors } = harness()
  engine.native = true
  engine.load('ztmusic://song/1')
  engine.audio.playResult = Promise.reject(new Error('Native playback unavailable'))
  player.togglePlay()
  await settle()
  assert.deepEqual(errors, ['TogglePlayNoUrl'])
})

await test('pausing pending local and WebDAV playback keeps both sources paused', async () => {
  for (const source of ['local', 'webdav']) {
    const { player, engine, errors } = harness()
    const selected = compactTrack({ ...track(1), source })
    const pendingPlay = deferred()
    engine.audio.playResult = pendingPlay.promise
    const pending = source === 'local'
      ? player._playLocalTrack(selected, player._playRequestId)
      : player._playWebDavTrack(selected, player._playRequestId)
    await settle()
    player.pause()
    pendingPlay.reject(new DOMException('play interrupted by pause', 'AbortError'))
    await pending
    assert.equal(engine.paused, true)
    assert.equal(player.playing, false)
    assert.deepEqual(errors, [])
  }
})

await test('late quality-switch rejection does not advance an already replaced URL', async () => {
  const { player, engine, errors, resolveWith } = harness()
  const oldPlay = deferred()
  engine.audio.playResult = oldPlay.promise
  player.playing = true
  engine.load('https://audio.test/standard')
  resolveWith(async () => ({ urls: ['https://audio.test/lossless', 'https://audio.test/backup', 'https://audio.test/last'], firstUrlLevel: 'lossless', isTrial: false }))
  await player._reloadCurrentAtPreferredLevel()
  engine.audio.playResult = Promise.resolve()
  player._fallbackNext()
  oldPlay.reject(new Error('quality URL already replaced'))
  await settle()
  assert.equal(engine.src, 'https://audio.test/backup')
  assert.deepEqual(errors, [])
})

await test('queue or quality changes invalidate the pending prefetch session', async () => {
  const { player } = harness()
  let pending
  player.queueRevision = 1
  player._prefetchNextTrack = Object.getPrototypeOf(player)._prefetchNextTrack
  player._prefetchManager = { prefetchNextTrackUrl: options => { pending = options; return Promise.resolve() } }
  player._prefetchNextTrack(player._playRequestId)
  assert.equal(pending.isStale(), false)
  player.queueRevision++
  assert.equal(pending.isStale(), true)
  player._prefetchNextTrack(player._playRequestId)
  assert.equal(pending.isStale(), false)
  player.preferredLevel = 'lossless'
  assert.equal(pending.isStale(), true)
})

await test('background queue append preserves current playback, progress and native append semantics', async () => {
  const { player, engine, storage } = harness()
  const commands = []
  engine.load('https://audio.test/1')
  await engine.play()
  engine.seek(42)
  player.currentTime = 42
  player.playing = true
  engine.setQueue = async (_tracks, index, start) => { commands.push({ index, start }) }
  const revision = player.playbackRevision
  assert.equal(player.appendQueue([track(4), track(5)]), 2)
  assert.deepEqual(player.queue.map(item => item.id), [1, 2, 3, 4, 5])
  assert.equal(player.id, 1)
  assert.equal(player.queueIndex, 0)
  assert.equal(player.currentTime, 42)
  assert.equal(engine.currentTime, 42)
  assert.equal(player.playing, true)
  assert.equal(engine.paused, false)
  assert.equal(player.playbackRevision, revision)
  assert.equal(player.queueRevision, 1)
  assert.deepEqual(commands, [{ index: 0, start: false }])
  assert.equal(storage.get(STORAGE_KEYS.PLAYER_QUEUE).length, 5)
})

await test('next reuses the decoded buffer before prefetching the following track', async () => {
  const { player, engine } = harness()
  const target = 'https://audio.test/2'
  player._prefetchCache.set(2, [target])
  engine.preload(target)
  const bufferedAudio = engine.preloadAudio
  player._prefetchNextTrack = () => engine.preload('https://audio.test/3')
  player.next()
  await settle()
  assert.equal(player.id, 2)
  assert.equal(engine.audio, bufferedAudio)
  assert.equal(engine.src, target)
  assert.equal(engine.preloadedSrc, 'https://audio.test/3')
})

await test('new songs do not inherit fallback seeking or waiting state from the previous song', async () => {
  const { player, engine } = harness()
  player._setupEngineListeners()
  player._commitProgress = time => { player.currentTime = time }
  player.currentTime = 42
  player._restoreSeeking = true
  player._waitingForFill = true
  player._prefetchCache.set(2, ['https://audio.test/2'])
  engine.preload('https://audio.test/2')
  player.next()
  await settle()
  engine.audio.dispatchEvent(new Event('playing'))
  assert.equal(engine.currentTime, 0)
  assert.equal(player.currentTime, 0)
  assert.equal(player._restoreSeeking, false)
  assert.equal(player._waitingForFill, false)
})

await test('direct selection discards a buffer belonging to another track', async () => {
  const { player, engine } = harness()
  engine.preload('https://audio.test/2')
  const wrongBuffer = engine.preloadAudio
  player.playTrack(player.queue[2], 2)
  await settle()
  assert.equal(engine.src, 'https://audio.test/3')
  assert.notEqual(engine.audio, wrongBuffer)
  assert.equal(engine.preloadedSrc, '')
})

await test('late native queue rejection cannot clear the new loading state', async () => {
  const { player, engine, errors } = harness()
  const oldQueue = deferred()
  engine.setQueue = () => oldQueue.promise
  player.playTrack(player.queue[0], 0)
  player._playRequestId++
  player.loading = true
  oldQueue.reject(new Error('old queue failed'))
  await settle()
  assert.equal(player.loading, true)
  assert.deepEqual(errors, [])
})

await test('late restore completion leaves a newer loading session intact', async () => {
  const { player, engine, errors, storage, resolveWith } = harness()
  storage.set(STORAGE_KEYS.PLAYER_ID, '1')
  storage.set(STORAGE_KEYS.PLAYER_QUEUE, player.queue)
  storage.set(STORAGE_KEYS.PLAYER_QI, '0')
  const oldResolve = deferred()
  resolveWith(() => oldResolve.promise)
  player.restore()
  player._playRequestId++
  player.loading = true
  oldResolve.resolve({ urls: ['https://audio.test/old'], firstUrlLevel: 'standard', isTrial: false })
  await settle()
  assert.equal(player.loading, true)
  assert.equal(engine.src, '')
  assert.deepEqual(errors, [])
})

await test('a paused restored source clears an earlier failure once it becomes ready', async () => {
  const { player, engine } = harness()
  player._setupEngineListeners()
  player._commitProgress = time => { player.currentTime = time }
  player._shouldAutoPlay = false
  player.error = 'LoadingTimeout'
  player._fallback.updateUrls(['https://audio.test/restored'])
  player._fallback.next()
  engine.load('https://audio.test/restored')
  engine.audio.dispatchEvent(new Event('canplay'))
  assert.equal(player.error, '')
  assert.equal(player.playing, false)
  assert.equal(engine.paused, true)
})

await test('failed passive preparation stays quiet and the first explicit play fetches fresh URLs', async () => {
  const { player, engine, errors, storage, resolveWith } = harness()
  storage.set(STORAGE_KEYS.PLAYER_ID, '1')
  storage.set(STORAGE_KEYS.PLAYER_QUEUE, player.queue)
  storage.set(STORAGE_KEYS.PLAYER_QI, '0')
  let calls = 0
  resolveWith(async (...args) => {
    calls++
    if (calls === 1) return { urls: [], firstUrlLevel: '', isTrial: false }
    assert.equal(args[6], true, 'explicit retry must bypass an unusable startup cache')
    return { urls: ['https://audio.test/fresh'], firstUrlLevel: 'standard', isTrial: false }
  })
  player.restore()
  await settle()
  assert.deepEqual(errors, [], 'preparing a paused startup track is not failed user playback')
  player.togglePlay()
  await settle()
  assert.equal(engine.src, 'https://audio.test/fresh')
  assert.equal(player.playing, true)
  assert.equal(calls, 2)
})

await test('system media play also retries a failed startup source and repeated play never cancels it', async () => {
  const { player, engine, errors, storage, resolveWith } = harness()
  storage.set(STORAGE_KEYS.PLAYER_ID, '1')
  storage.set(STORAGE_KEYS.PLAYER_QUEUE, player.queue)
  storage.set(STORAGE_KEYS.PLAYER_QI, '0')
  const retry = deferred()
  let calls = 0
  resolveWith(async () => ++calls === 1 ? { urls: [], firstUrlLevel: '', isTrial: false } : retry.promise)
  player.restore()
  await settle()
  player._handleMediaButton('play')
  player._handleMediaButton('play')
  retry.resolve({ urls: ['https://audio.test/fresh'], firstUrlLevel: 'standard', isTrial: false })
  await settle()
  assert.equal(engine.src, 'https://audio.test/fresh')
  assert.equal(player.playing, true)
  assert.deepEqual(errors, [])
  assert.equal(calls, 2)
})

await test('genuine exhaustion after an explicit play still reports failure', async () => {
  const { player, errors } = harness()
  player._shouldAutoPlay = true
  player._fallback.updateUrls([])
  player._fallbackNext()
  assert.deepEqual(errors, ['NoUrl'])
  assert.equal(player.loading, false)
})

await test('a stalled startup source falls back quietly to an available fresh URL', async () => {
  const { player, engine, errors, timers } = harness()
  player._startLoadingTimeout = Object.getPrototypeOf(player)._startLoadingTimeout
  player._clearLoadingTimer = Object.getPrototypeOf(player)._clearLoadingTimer
  player._fallback.updateUrls(['https://audio.test/stalled', 'https://audio.test/fresh'])
  player._fallback.next()
  engine.load('https://audio.test/stalled')
  player._shouldAutoPlay = false
  player.loading = true
  player._startLoadingTimeout()
  timers[0]()
  assert.equal(engine.src, 'https://audio.test/fresh')
  assert.equal(engine.paused, true)
  assert.deepEqual(errors, [])
})

await test('URL resolution has its own deadlines; the media loading timer starts after a source is loaded', async () => {
  const { player, engine, storage, resolveWith } = harness()
  player._setupEngineListeners()
  storage.set(STORAGE_KEYS.PLAYER_ID, '1')
  storage.set(STORAGE_KEYS.PLAYER_QUEUE, player.queue)
  storage.set(STORAGE_KEYS.PLAYER_QI, '0')
  const resolving = deferred()
  resolveWith(() => resolving.promise)
  let mediaTimers = 0
  player._startLoadingTimeout = () => { mediaTimers++ }
  player.restore()
  assert.equal(mediaTimers, 0, 'cold URL resolution must not be cut off by the audio buffering timeout')
  resolving.resolve({ urls: ['https://audio.test/restored'], firstUrlLevel: 'standard', isTrial: false })
  await settle()
  engine.audio.dispatchEvent(new Event('loadstart'))
  assert.equal(mediaTimers, 1)
})

await test('clicking play during restoration waits for the URL and starts the first source', async () => {
  const { player, engine, errors, storage, resolveWith } = harness()
  storage.set(STORAGE_KEYS.PLAYER_ID, '1')
  storage.set(STORAGE_KEYS.PLAYER_QUEUE, player.queue)
  storage.set(STORAGE_KEYS.PLAYER_QI, '0')
  const resolving = deferred()
  resolveWith(() => resolving.promise)
  const play = engine.play.bind(engine)
  let calls = 0
  engine.play = () => {
    calls++
    return engine.src ? play() : Promise.reject(new DOMException('No source', 'NotSupportedError'))
  }
  player.restore()
  player.togglePlay()
  await settle()
  assert.equal(calls, 0, 'play must not be called with an empty restored source')
  assert.deepEqual(errors, [])
  resolving.resolve({ urls: ['https://audio.test/restored'], firstUrlLevel: 'standard', isTrial: false })
  await settle()
  assert.equal(calls, 1)
  assert.equal(engine.paused, false)
  assert.equal(player.playing, true)
})

await test('a second click can cancel queued playback while startup is still resolving', async () => {
  const { player, engine, storage, resolveWith } = harness()
  storage.set(STORAGE_KEYS.PLAYER_ID, '1')
  storage.set(STORAGE_KEYS.PLAYER_QUEUE, player.queue)
  storage.set(STORAGE_KEYS.PLAYER_QI, '0')
  const resolving = deferred()
  resolveWith(() => resolving.promise)
  player.restore()
  player.togglePlay()
  player.togglePlay()
  resolving.resolve({ urls: ['https://audio.test/restored'], firstUrlLevel: 'standard', isTrial: false })
  await settle()
  assert.equal(engine.paused, true)
  assert.equal(player._shouldAutoPlay, false)
})

await test('a failed startup URL waits silently and uses the first fresh candidate immediately', async () => {
  const { player, engine, errors, storage, invalidated, resolveWith, fillWith } = harness()
  player._setupEngineListeners()
  player._commitProgress = time => { player.currentTime = time }
  player._fillFallbackInBackground = Object.getPrototypeOf(player)._fillFallbackInBackground
  storage.set(STORAGE_KEYS.PLAYER_ID, '1')
  storage.set(STORAGE_KEYS.PLAYER_QUEUE, player.queue)
  storage.set(STORAGE_KEYS.PLAYER_QI, '0')
  resolveWith(async () => ({ urls: ['https://audio.test/expired'], firstUrlLevel: 'standard', isTrial: false }))
  const filled = deferred()
  let options
  fillWith((_id, _revision, actual) => { options = actual; return filled.promise })
  player.restore()
  await settle()
  engine.audio.dispatchEvent(new Event('error'))
  assert.deepEqual(errors, [], 'recoverable preparation failures must not announce playback failure')
  assert.deepEqual(invalidated, [{ id: 1, url: 'https://audio.test/expired' }])
  options.onUrls(['https://audio.test/fresh'])
  assert.equal(engine.src, 'https://audio.test/fresh', 'fresh URL is used while slower candidates are still pending')
  assert.equal(engine.paused, true, 'startup preparation must not autoplay')
  filled.resolve(['https://audio.test/expired', 'https://audio.test/fresh'])
  await settle()
  assert.equal(player._fallback.getUrls().includes('https://audio.test/expired'), false)
})

await test('manual quality change requests and loads lossless even when standard is available', async () => {
  const { ncm } = await import('../api/client.ts')
  const { dbCache } = await import('../db/cache.ts')
  const { getPlayableUrls } = await import('./url-resolver.ts')
  const original = { songUrl: ncm.songUrl, urlSetEntry: dbCache.urlSetEntry }
  try {
    const requested = []
    ncm.songUrl = async (_id, level) => {
      requested.push(level)
      return { code: 200, data: [{ url: `https://audio.test/${level}`, level }] }
    }
    dbCache.urlSetEntry = async () => null
    const { player, engine, resolveWith } = harness()
    resolveWith(getPlayableUrls)
    engine.load('https://audio.test/standard')
    player.preferredLevel = 'lossless'
    player.playing = true
    player.currentTime = 12
    await player._reloadCurrentAtPreferredLevel()
    assert.deepEqual(requested, ['lossless'])
    assert.equal(engine.src, 'https://audio.test/lossless')
    assert.equal(player._restoreSeeking, true)
  } finally {
    ncm.songUrl = original.songUrl
    dbCache.urlSetEntry = original.urlSetEntry
  }
})

await test('a superseded quality request cannot overwrite the latest persistent cache', async () => {
  const { ncm } = await import('../api/client.ts')
  const { dbCache } = await import('../db/cache.ts')
  const { getPlayableUrls } = await import('./url-resolver.ts')
  const original = { songUrl: ncm.songUrl, urlSetEntry: dbCache.urlSetEntry }
  try {
    const oldStream = deferred()
    const writes = []
    ncm.songUrl = async (_id, level) => level === 'exhigh'
      ? oldStream.promise
      : { data: [{ url: `https://audio.test/${level}`, level }] }
    dbCache.urlSetEntry = async (_id, streams) => { writes.push(...streams.map(stream => stream.url)); return null }
    const { player, engine, resolveWith } = harness()
    resolveWith(getPlayableUrls)
    engine.load('https://audio.test/standard')
    player.preferredLevel = 'exhigh'
    player.playing = true
    const oldReload = player._reloadCurrentAtPreferredLevel()
    await settle()
    player.preferredLevel = 'lossless'
    await player._reloadCurrentAtPreferredLevel()
    oldStream.resolve({ data: [{ url: 'https://audio.test/exhigh', level: 'exhigh' }] })
    await oldReload
    assert.deepEqual(writes, ['https://audio.test/lossless'])
    assert.equal(engine.src, 'https://audio.test/lossless')
  } finally {
    ncm.songUrl = original.songUrl
    dbCache.urlSetEntry = original.urlSetEntry
  }
})

console.log(`Playback sessions: ${passed} behavior checks passed`)
