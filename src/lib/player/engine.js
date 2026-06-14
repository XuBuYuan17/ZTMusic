class AudioEngine {
  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.currentUrl = ''
    // 隐藏预加载器：用于后台加载下一首歌的音频
    this.preloadAudio = new Audio()
    this.preloadAudio.preload = 'auto'
    this.preloadedUrl = ''
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
      if (this._onEnded) this._onEnded(this.getState())
    })
    this.audio.addEventListener('loadstart', () => {
      if (this._onLoadStart) this._onLoadStart(this.getState())
    })
    this.audio.addEventListener('canplay', () => {
      if (this._onCanPlay) this._onCanPlay(this.getState())
    })
    this.audio.addEventListener('error', (event) => {
      if (this._onError) this._onError(this.getErrorState(event))
    })
    this.audio.addEventListener('play', () => {
      if (this._onPlay) this._onPlay(this.getState())
    })
    this.audio.addEventListener('pause', () => {
      if (this._onPause) this._onPause(this.getState())
    })
  }

  /** 后台预加载一首歌的音频到隐藏元素（不播放） */
  preload(url) {
    if (!url) return
    const u = String(url).trim()
    if (!u || u === this.preloadedUrl) return
    this.cancelPreload()
    this.preloadedUrl = u
    this.preloadAudio.src = u
    this.preloadAudio.load()
  }

  /** 取消预加载并释放资源 */
  cancelPreload() {
    this.preloadedUrl = ''
    this.preloadAudio.pause()
    this.preloadAudio.removeAttribute('src')
    this.preloadAudio.load()
  }

  /** 交换主播放器与预加载器：预加载的音频变为当前播放 */
  swapToPreloaded() {
    if (!this.preloadedUrl) return false
    const oldAudio = this.audio
    const oldUrl = this.currentUrl
    this.audio = this.preloadAudio
    this.currentUrl = this.preloadedUrl
    this.preloadAudio = oldAudio
    this.preloadedUrl = ''
    // 清理旧 audio
    this.preloadAudio.pause()
    this.preloadAudio.removeAttribute('src')
    this.preloadAudio.load()
    return true
  }

  /** 预加载的 URL（用于 playTrack 判断命中） */
  get preloadedSrc() { return this.preloadedUrl }

  getState() {
    return {
      src: this.audio.currentSrc || this.audio.src || this.currentUrl,
      currentTime: this.audio.currentTime,
      duration: this.audio.duration || 0,
      ended: this.audio.ended,
      networkState: this.audio.networkState,
      readyState: this.audio.readyState,
      paused: this.audio.paused,
    }
  }

  getErrorState(event) {
    const error = this.audio.error
    return {
      ...this.getState(),
      event,
      code: error?.code || 0,
      message: error?.message || '',
    }
  }

  load(url) {
    if (!url) return
    const nextUrl = String(url).trim()
    if (!nextUrl) return
    // 如果是预加载命中，直接 swap
    if (this.preloadedUrl && this.preloadedUrl === nextUrl) {
      this.swapToPreloaded()
      return
    }
    if (this.currentUrl && this.currentUrl !== nextUrl) {
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.audio.load()
    }
    this.currentUrl = nextUrl
    this.audio.src = nextUrl
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
    this.cancelPreload()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.currentUrl = ''
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
