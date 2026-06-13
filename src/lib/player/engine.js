class AudioEngine {
  constructor() {
    this.audio = new Audio()
    this._onTimeUpdate = null
    this._onEnded = null
    this._onLoadStart = null
    this._onCanPlay = null
    this._onError = null
    this._onPlay = null
    this._onPause = null

    this.audio.addEventListener('timeupdate', () => {
      if (this._onTimeUpdate) this._onTimeUpdate(this.audio.currentTime)
    })
    this.audio.addEventListener('ended', () => {
      if (this._onEnded) this._onEnded()
    })
    this.audio.addEventListener('loadstart', () => {
      if (this._onLoadStart) this._onLoadStart()
    })
    this.audio.addEventListener('canplay', () => {
      if (this._onCanPlay) this._onCanPlay()
    })
    this.audio.addEventListener('error', (e) => {
      if (this._onError) this._onError(e)
    })
    this.audio.addEventListener('play', () => {
      if (this._onPlay) this._onPlay()
    })
    this.audio.addEventListener('pause', () => {
      if (this._onPause) this._onPause()
    })
  }

  load(url) {
    if (!url) return
    if (this.audio.src && this.audio.src !== url) {
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.audio.load()
    }
    this.audio.src = url
    this.audio.load()
  }

  play() {
    return this.audio.play()
  }

  pause() {
    this.audio.pause()
  }

  toggle() {
    if (this.audio.paused) return this.play()
    this.pause()
  }

  seek(time) {
    this.audio.currentTime = time
  }

  setVolume(v) {
    this.audio.volume = Math.max(0, Math.min(1, v))
  }

  get volume() { return this.audio.volume }
  get currentTime() { return this.audio.currentTime }
  get duration() { return this.audio.duration || 0 }
  get paused() { return this.audio.paused }
  get src() { return this.audio.src }

  onTimeUpdate(fn) { this._onTimeUpdate = fn }
  onEnded(fn) { this._onEnded = fn }
  onLoadStart(fn) { this._onLoadStart = fn }
  onCanPlay(fn) { this._onCanPlay = fn }
  onError(fn) { this._onError = fn }
  onPlay(fn) { this._onPlay = fn }
  onPause(fn) { this._onPause = fn }

  destroy() {
    this.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this._onTimeUpdate = null
    this._onEnded = null
    this._onLoadStart = null
    this._onCanPlay = null
    this._onError = null
    this._onPlay = null
    this._onPause = null
  }
}

export const engine = new AudioEngine()
