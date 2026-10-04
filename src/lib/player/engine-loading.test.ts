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

engine.destroy()
console.log('audio engine loading semantics: play, waiting and playing transitions passed')
