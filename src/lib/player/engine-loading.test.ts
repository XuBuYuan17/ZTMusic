import assert from 'node:assert/strict'

class FakeAudio extends EventTarget {
  preload = ''
  src = ''
  currentSrc = ''
  currentTime = 0
  duration = 180
  ended = false
  networkState = 1
  readyState = 0
  paused = true
  volume = 1
  error: MediaError | null = null

  canPlayType(): CanPlayTypeResult { return 'probably' }
  load(): void {}
  removeAttribute(name: string): void { if (name === 'src') this.src = '' }
  pause(): void { this.paused = true }
  play(): Promise<void> {
    this.paused = false
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  }
}

globalThis.Audio = FakeAudio as unknown as typeof Audio

const { AudioEngine } = await import('./engine.ts')

const engine = new AudioEngine()
const audio = engine.audio as unknown as FakeAudio
engine.setVolume(.8)
engine.setLoudnessAdjustment(true, -6)
assert.ok(Math.abs(audio.volume - .8 * 10 ** (-6 / 20)) < 1e-8, 'normalization attenuates without changing user volume')
assert.equal(engine.volume, .8)
engine.setLoudnessAdjustment(true, null)
assert.equal(audio.volume, .8, 'unknown sources restore the user volume')
engine.setLoudnessAdjustment(true, 8)
assert.equal(audio.volume, .8, 'positive or invalid gain cannot amplify')
engine.setLoudnessAdjustment(false, -6)
assert.equal(audio.volume, .8, 'turning the setting off restores the user volume')
engine.setLoudnessEnabled(true)
assert.ok(Math.abs(audio.volume - .8 * 10 ** (-6 / 20)) < 1e-8, 'enabling uses the current source adjustment')
engine.setVolume(.5)
assert.equal(engine.volume, .5, 'manual volume remains separate while normalization is active')
assert.ok(Math.abs(audio.volume - .5 * 10 ** (-6 / 20)) < 1e-8)
engine.setLoudnessEnabled(false)
assert.equal(audio.volume, .5)
engine.setVolume(.8)
let loadSignals = 0
let readySignals = 0
let playSignals = 0

engine.onLoadStart(() => { loadSignals++ })
engine.onCanPlay(() => { readySignals++ })
engine.onPlay(() => { playSignals++ })

// HTMLMediaElement `play` only means playback was requested / paused=false. It
// must not be treated as “buffering is finished”.
audio.readyState = 1
await engine.play()
assert.equal(playSignals, 1)
assert.equal(readySignals, 0, 'play must not clear loading before media is actually ready')

// During playback a network stall emits `waiting` without another loadstart.
// The engine must surface that as loading so the store/UI can show buffering.
audio.readyState = 2
audio.dispatchEvent(new Event('waiting'))
assert.equal(loadSignals, 1, 'waiting while playing should enter loading')

// `playing` is the reliable signal that decoded media is flowing again. Once
// HAVE_FUTURE_DATA is reached, it should reuse the ready callback to clear the
// store loading flag and refresh duration/progress state.
audio.readyState = 3
audio.dispatchEvent(new Event('playing'))
assert.equal(readySignals, 1, 'playing with sufficient readyState should leave loading')

// A waiting event while paused is not active buffering and must not put the UI
// back into a loading state.
audio.paused = true
audio.dispatchEvent(new Event('waiting'))
assert.equal(loadSignals, 1, 'paused waiting events must be ignored')

let mediaLoads = 0
audio.load = () => { mediaLoads++; audio.error = null }
engine.load('https://audio.test/retry')
const firstLoads = mediaLoads
engine.load('https://audio.test/retry')
assert.equal(mediaLoads, firstLoads, 'a healthy duplicate URL must not restart playback')
audio.error = { code: 2, message: 'Temporary network failure' } as MediaError
engine.load('https://audio.test/retry')
assert.ok(mediaLoads > firstLoads, 'an explicit retry must reload an errored element even for the same URL')
assert.equal(audio.error, null)

engine.setLoudnessAdjustment(true, -6)
engine.preload('https://audio.test/next')
const nextAudio = engine.preloadAudio as unknown as FakeAudio
nextAudio.readyState = 1
engine.load('https://audio.test/next', -9)
assert.equal(engine.audio, nextAudio as unknown as HTMLAudioElement)
assert.ok(Math.abs(nextAudio.volume - .8 * 10 ** (-9 / 20)) < 1e-8, 'preloaded audio uses the newly selected source gain')
engine.load('https://audio.test/fallback')
assert.equal(nextAudio.volume, .8, 'fallback without metadata must not inherit the previous gain')

engine.destroy()
console.log('audio engine loading semantics: play, waiting and playing transitions passed')
