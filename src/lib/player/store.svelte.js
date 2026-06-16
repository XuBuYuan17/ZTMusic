/**
 * PlayerState — 播放器核心状态管理
 *
 * 职责：整合各子模块（engine、queue、url-resolver、prefetch、history、native-media），
 * 提供统一的播放控制 API。
 *
 * 用法：
 *   import { player } from './store.js'
 *   player.playTrack(track, 0)
 *   player.next()
 *   player.pause()
 */

import { engine } from './engine.js'
import { ncm } from '../api/client.js'
import { auth } from '../stores/auth.svelte.js'
import { getStorage, getStorageJson, removeStorage, setStorage } from '../utils/storage.js'
import { normalizeImageUrl, coverUrl } from '../utils/image.js'
import { dbUrlSet } from '../utils/dbcache.js'
import { dbCache } from '../db/cache.js'
import { getPlayableUrls, fillFallbackUrls } from './url-resolver.js'
import { compactTrack, compactQueue, getNextIndex, getPrevIndex } from './queue.js'
import { addLocalHistory } from './history.js'
import { dbHistory } from '../db/history.js'
import { initNativeMedia, syncNativeMedia, destroyNativeMedia } from './native-media.js'
import { PLAYBACK, QUALITY_ORDER, ERROR_MESSAGES, STORAGE_KEYS, FALLBACK_URL_TEMPLATE } from '../utils/constants.js'
import { handleError, swallowError } from '../utils/error.js'

class PlayerState {
  // ===== 当前歌曲 =====
  id = $state(0)
  title = $state('')
  artist = $state('')
  cover = $state('')
  duration = $state(0)
  currentTrack = $state(null)

  // ===== 播放状态 =====
  playing = $state(false)
  loading = $state(false)
  currentTime = $state(0)
  error = $state('')

  // ===== 设置 =====
  volume = $state(0.8)
  mode = $state('list') // 'list' | 'shuffle' | 'repeat'
  preferredLevel = $state('standard')

  // ===== 队列 =====
  queue = $state([])
  queueIndex = $state(-1)

  // ===== 内部状态（非响应式） =====
  /** 恢复播放时是否需要 seek */
  _restoreSeeking = false
  /** 加载后是否自动播放 */
  _shouldAutoPlay = false
  /** 保存进度的定时器 */
  _saveTimer = null
  /** loading 超时保护 */
  _loadingTimer = null
  /** 上次 error 的 reqId（防重复） */
  _lastErrorReqId = 0
  /** 播放请求 ID（用于竞态控制） */
  _playRequestId = 0
  /** 当前可用的 URL 列表 */
  _playUrls = []
  /** 当前 URL 索引 */
  _playUrlIndex = 0
  /** 首条 URL 的音质等级 */
  _firstUrlLevel = ''
  /** 自动切歌锁 */
  _advanceLock = false
  /** 是否正在填充 fallback URL */
  _fillFallbackPending = false
  /** 媒体会话是否已初始化 */
  _mediaSessionInited = false
  /** 预取缓存 Map<id, url[]> */
  _prefetchCache = new Map()

  constructor() {
    // 从 localStorage 恢复初始状态
    this._restoreInitialState()

    // 设置 engine 事件监听
    this._setupEngineListeners()

    // 初始化原生媒体会话
    initNativeMedia({
      getMetadata: () => ({
        title: this.title,
        artist: this.artist,
        cover: this.cover,
        duration: this.duration > 0 ? this.duration / 1000 : 0,
      }),
      getPlaybackState: () => ({
        playing: this.playing,
        position: this.currentTime,
        duration: this.duration > 0 ? this.duration / 1000 : 0,
      }),
      onMediaButton: (action) => this._handleMediaButton(action),
    })

    // 初始化媒体会话（桌面 Web Media Session API）
    this._initMediaSession()
  }

  // ==========================================
  // 内部方法
  // ==========================================

  _restoreInitialState() {
    this.id = parseInt(getStorage(STORAGE_KEYS.PLAYER_ID, '0')) || 0
    this.title = getStorage(STORAGE_KEYS.PLAYER_TITLE, '')
    this.artist = getStorage(STORAGE_KEYS.PLAYER_ARTIST, '')
    this.cover = getStorage(STORAGE_KEYS.PLAYER_COVER, '')
    this.duration = parseInt(getStorage(STORAGE_KEYS.PLAYER_DURATION, '0')) || 0
    this.currentTime = parseFloat(getStorage(STORAGE_KEYS.PLAYER_TIME, '0'))
    this.volume = parseFloat(getStorage(STORAGE_KEYS.VOLUME, '0.8'))
    this.mode = getStorage(STORAGE_KEYS.MODE, 'list')
    this.preferredLevel = getStorage(STORAGE_KEYS.PREFERRED_QUALITY, 'standard')
    this.queue = getStorageJson(STORAGE_KEYS.PLAYER_QUEUE, [])
    this.queueIndex = parseInt(getStorage(STORAGE_KEYS.PLAYER_QI, '-1'))

    engine.setVolume(this.volume)
  }

  _setupEngineListeners() {
    engine.onTimeUpdate((t) => {
      this.currentTime = t
      this._debouncedSaveTime(t)
      syncNativeMedia()
    })

    engine.onEnded((state) => {
      this._handleEnded(state)
    })

    engine.onLoadStart(() => {
      this.loading = true
    })

    engine.onCanPlay((state) => {
      this.loading = false
      this._clearLoadingTimer()
      this.duration = engine.duration
      this.playing = this._shouldAutoPlay && !engine.paused
      // 恢复播放时 seek
      if (this._restoreSeeking && this.currentTime > 0) {
        engine.seek(this.currentTime)
        this._restoreSeeking = false
      }
      syncNativeMedia()
    })

    engine.onError((state) => {
      if (this._playRequestId !== this._lastErrorReqId) {
        this._lastErrorReqId = this._playRequestId
      }
      if (this._tryNextPlayUrl()) return
      this._clearLoadingTimer()
      this.loading = false
      this.playing = false
      this._shouldAutoPlay = false
      this.error = ERROR_MESSAGES.NO_URL
    })
  }

  _initMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (this._mediaSessionInited) return
    this._mediaSessionInited = true

    const setPlaybackState = (state) => {
      try { navigator.mediaSession.playbackState = state } catch { /* ignore */ }
    }

    engine.onPlay(() => setPlaybackState('playing'))
    engine.onPause(() => setPlaybackState('paused'))

    navigator.mediaSession.setActionHandler('play', () => { engine.play() })
    navigator.mediaSession.setActionHandler('pause', () => { engine.pause() })
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next())
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prev())
  }

  _debouncedSaveTime(t) {
    if (this._saveTimer) return
    this._saveTimer = setTimeout(() => {
      setStorage(STORAGE_KEYS.PLAYER_TIME, t)
      this._saveTimer = null
    }, PLAYBACK.SAVE_INTERVAL)
  }

  /** loading 超时保护：15 秒后自动解除 loading */
  _startLoadingTimeout() {
    this._clearLoadingTimer()
    this._loadingTimer = setTimeout(() => {
      if (this.loading) {
        this.loading = false
        this.error = ERROR_MESSAGES.PLAY_FAILED
      }
    }, 15000)
  }

  _clearLoadingTimer() {
    if (this._loadingTimer) {
      clearTimeout(this._loadingTimer)
      this._loadingTimer = null
    }
  }

  _persistState() {
    setStorage(STORAGE_KEYS.PLAYER_ID, this.id)
    setStorage(STORAGE_KEYS.PLAYER_TITLE, this.title)
    setStorage(STORAGE_KEYS.PLAYER_ARTIST, this.artist)
    setStorage(STORAGE_KEYS.PLAYER_COVER, this.cover)
    setStorage(STORAGE_KEYS.PLAYER_DURATION, this.duration)
    setStorage(STORAGE_KEYS.PLAYER_QI, this.queueIndex)
  }

  _handleEnded(state) {
    if (this._advanceLock || this.queue.length === 0) return
    this._advanceLock = true
    this._shouldAutoPlay = true
    setTimeout(() => {
      if (!this._advanceLock) return
      this._advanceLock = false
      this.next()
    }, PLAYBACK.ADVANCE_DELAY)
  }

  _handleMediaButton(action) {
    if (action === 'play') { engine.play().catch(swallowError) }
    else if (action === 'pause') { engine.pause() }
    else if (action === 'next') { this.next() }
    else if (action === 'prev') { this.prev() }
  }

  /**
   * 尝试下一个 fallback URL
   * @returns {boolean} 是否还有 URL 可试
   */
  _tryNextPlayUrl() {
    const reqId = this._playRequestId
    if (this._playUrlIndex >= this._playUrls.length - 1) {
      if (this._fillFallbackPending) {
        this.loading = true
        setTimeout(() => {
          if (reqId !== this._playRequestId) return
          if (this._playUrlIndex < this._playUrls.length - 1) {
            this._tryNextPlayUrl()
          } else if (this.playing && this._shouldAutoPlay && this.queue.length > 1 && !this._advanceLock) {
            this._advanceLock = true
            setTimeout(() => {
              if (reqId !== this._playRequestId) return
              this._advanceLock = false
              this.next()
            }, 120)
          } else {
            this.loading = false
            this.playing = false
            this._shouldAutoPlay = false
            this.error = ERROR_MESSAGES.NO_URL
          }
        }, PLAYBACK.FALLBACK_WAIT_TIMEOUT)
        return true
      }
      if (this.playing && this._shouldAutoPlay && this.queue.length > 1 && !this._advanceLock) {
        this._advanceLock = true
        setTimeout(() => {
          if (reqId !== this._playRequestId) return
          this._advanceLock = false
          this.next()
        }, 120)
      }
      return false
    }

    this._playUrlIndex += 1
    this.loading = true
    this.error = ''
    const url = this._playUrls[this._playUrlIndex]
    engine.load(url)
    engine.play().catch((err) => {
      if (reqId !== this._playRequestId) return
      if (!this._tryNextPlayUrl()) {
        this.loading = false
        this.playing = false
        this._shouldAutoPlay = false
        this.error = ERROR_MESSAGES.NO_URL
      }
    })
    return true
  }

  // ==========================================
  // 播放控制
  // ==========================================

  /**
   * 播放指定曲目
   * @param {object} track - 原始曲目数据
   * @param {number} index - 在队列中的索引
   */
  playTrack(track, index) {
    if (!track) return
    const playableTrack = compactTrack(track)
    if (!playableTrack) return

    const requestId = ++this._playRequestId
    this.id = playableTrack.id
    this.title = playableTrack.name
    this.artist = playableTrack.ar.map(a => a.name).join(' / ')
    this.currentTrack = playableTrack
    this.cover = normalizeImageUrl(playableTrack.picUrl || playableTrack.al.picUrl || '')
    this.duration = playableTrack.dt || 0
    this.queueIndex = index >= 0 ? index : this.queueIndex
    this.loading = true
    this.playing = false
    this._shouldAutoPlay = true
    this.error = ''
    this._startLoadingTimeout()

    // 更新媒体会话元数据
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.title,
        artist: this.artist,
        album: '',
        artwork: [{ src: coverUrl(this.cover, 512), sizes: '512x512', type: 'image/jpeg' }],
      })
    }

    this._persistState()
    addLocalHistory(playableTrack)
    dbHistory.add(playableTrack) // async, non-blocking
    syncNativeMedia()

    // 获取可播放 URL
    getPlayableUrls(playableTrack.id, this.preferredLevel, this._prefetchCache, requestId)
      .then(({ urls, firstUrlLevel, isTrial }) => {
        if (requestId !== this._playRequestId) return
        this._playUrls = urls
        this._playUrlIndex = 0
        this._firstUrlLevel = firstUrlLevel

        if (urls.length > 0) {
          // 如果是试听片段且已登录，显示 VIP 提示（仍播放试听）
          if (isTrial && auth.isLoggedIn) {
            this.error = ERROR_MESSAGES.COOKIE_EXPIRED
          }
          engine.load(urls[0])
          engine.play()
            .then(() => {
              if (requestId === this._playRequestId) this.playing = true
            })
            .catch((err) => {
              if (requestId !== this._playRequestId) return
              if (!this._tryNextPlayUrl()) {
                this._clearLoadingTimer()
                this.playing = false
                this.loading = false
                this._shouldAutoPlay = false
                this.error = ERROR_MESSAGES.NO_URL
              }
            })
        } else {
          this._clearLoadingTimer()
          this.loading = false
          this.playing = false
          this._shouldAutoPlay = false
          this.error = ERROR_MESSAGES.NO_URL
        }
      })
      .catch(() => {
        if (requestId !== this._playRequestId) return
        this.loading = false
        this.playing = false
        this._shouldAutoPlay = false
        this.error = ERROR_MESSAGES.NO_URL
      })

    // 后台填充更多 URL
    this._fillFallbackInBackground(playableTrack.id, requestId)
  }

  async _fillFallbackInBackground(id, reqId) {
    this._fillFallbackPending = true
    try {
      const result = await fillFallbackUrls(id, reqId, {
        currentUrls: this._playUrls,
        firstUrlLevel: this._firstUrlLevel,
        preferredLevel: this.preferredLevel,
        isPlaying: this.playing,
        currentTime: this.currentTime,
        onQualityUpgrade: ({ url, currentTime, urls }) => {
          if (reqId !== this._playRequestId) return
          this._playUrls = urls
          this._playUrlIndex = 0
          if (this.playing && !engine.paused) {
            this.currentTime = currentTime
            this._restoreSeeking = currentTime > 0
            engine.load(url)
            engine.play().catch(() => {
              if (reqId !== this._playRequestId) return
              const badIdx = this._playUrls.indexOf(url)
              if (badIdx >= 0) this._playUrls.splice(badIdx, 1)
              this._playUrlIndex = 0
              this._tryNextPlayUrl()
            })
          }
        },
        isStale: () => reqId !== this._playRequestId,
      })

      if (reqId === this._playRequestId) {
        this._playUrls = result
      }

      // 后台预取下一首
      if (this.queue.length > 1 && this.queueIndex >= 0) {
        this._prefetchNextTrack(reqId)
      }

      // 持久化最新 URL 到 IndexedDB
      if (result.length > 0 && result[0] !== FALLBACK_URL_TEMPLATE(id)) {
        dbCache.urlSet(id, result).catch(swallowError)
        dbUrlSet(id, result).catch(swallowError)
      }
    } finally {
      this._fillFallbackPending = false
    }
  }

  /** 后台预取下一首歌的 URL + 音频，切歌时零等待 */
  async _prefetchNextTrack(reqId) {
    if (this.queue.length < 2 || this.queueIndex < 0) return
    const nextIdx = (this.queueIndex + 1) % this.queue.length
    if (nextIdx === this.queueIndex) return
    const nextTrack = this.queue[nextIdx]
    if (!nextTrack?.id || this._prefetchCache.has(nextTrack.id)) return

    // 限制预取缓存大小
    if (this._prefetchCache.size >= 10) {
      const firstKey = this._prefetchCache.keys().next().value
      this._prefetchCache.delete(firstKey)
    }

    const tiers = [...new Set(['standard', 'higher', this.preferredLevel].filter(Boolean))]
    for (const level of tiers) {
      if (reqId !== this._playRequestId) return
      try {
        const res = await ncm.songUrl(nextTrack.id, level, false)
        const item = res?.data?.[0]
        if (!item?.url) continue
        const urlStr = item.url.trim()
        this._prefetchCache.set(nextTrack.id, [urlStr])
        // 持久化到 IndexedDB
        dbCache.urlSet(nextTrack.id, [urlStr]).catch(swallowError)
        dbUrlSet(nextTrack.id, [urlStr]).catch(swallowError)
        // 预加载音频
        engine.preload(urlStr)
        return
      } catch { /* try next level */ }
    }
  }

  /**
   * 播放队列
   * @param {Array} tracks - 曲目列表
   * @param {number} startIndex - 开始播放的索引
   */
  playQueue(tracks, startIndex = 0) {
    this.queue = compactQueue(tracks)
    this.queueIndex = Math.min(Math.max(startIndex, 0), Math.max(this.queue.length - 1, 0))
    setStorage(STORAGE_KEYS.PLAYER_QUEUE, this.queue)
    setStorage(STORAGE_KEYS.PLAYER_QI, this.queueIndex)
    if (this.queue[this.queueIndex]) {
      this.playTrack(this.queue[this.queueIndex], this.queueIndex)
    }
  }

  /** 下一首 */
  next() {
    engine.cancelPreload()
    if (this.queue.length === 0) return

    if (this._advanceLock) {
      this._advanceLock = false
    }

    const idx = getNextIndex({
      currentIndex: this.queueIndex,
      queueLength: this.queue.length,
      mode: this.mode,
    })

    this.playTrack(this.queue[idx], idx)
  }

  /** 上一首 */
  prev() {
    engine.cancelPreload()
    if (this.queue.length === 0) return

    if (this._advanceLock) {
      this._advanceLock = false
    }

    const idx = getPrevIndex({
      currentIndex: this.queueIndex,
      queueLength: this.queue.length,
    })

    this.playTrack(this.queue[idx], idx)
  }

  /** 暂停 */
  pause() {
    engine.pause()
  }

  /** 切换播放/暂停 */
  togglePlay() {
    if (!this.id) return

    if (engine.paused) {
      engine.play()
        .then(() => {
          this.playing = true
          this._shouldAutoPlay = true
        })
        .catch(() => {
          if (!this._tryNextPlayUrl()) {
            this.playing = false
            this._shouldAutoPlay = false
            this.error = ERROR_MESSAGES.NO_URL
          }
        })
    } else {
      engine.pause()
      this.playing = false
    }
  }

  /** 跳转到指定时间 */
  seek(time) {
    engine.seek(time)
    this.currentTime = time
    setStorage(STORAGE_KEYS.PLAYER_TIME, time)
  }

  /** 设置音量 */
  setVolume(v) {
    this.volume = v
    engine.setVolume(v)
    setStorage(STORAGE_KEYS.VOLUME, v)
  }

  /** 设置播放模式 */
  setMode(m) {
    this.mode = m
    setStorage(STORAGE_KEYS.MODE, m)
  }

  /** 设置偏好音质 */
  setPreferredLevel(level) {
    if (QUALITY_ORDER.includes(level)) {
      this.preferredLevel = level
      setStorage(STORAGE_KEYS.PREFERRED_QUALITY, level)
    }
  }

  // ==========================================
  // 队列控制
  // ==========================================

  /** 清空队列 */
  clearQueue() {
    this.queue = []
    this.queueIndex = -1
    removeStorage(STORAGE_KEYS.PLAYER_QUEUE)
    removeStorage(STORAGE_KEYS.PLAYER_QI)
  }

  /** 从队列移除指定索引 */
  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return

    const wasCurrent = index === this.queueIndex
    this.queue = this.queue.filter((_, i) => i !== index)

    if (wasCurrent) {
      this.queueIndex = Math.min(index, this.queue.length - 1)
      if (this.queue.length > 0 && this.queueIndex >= 0) {
        this.playTrack(this.queue[this.queueIndex], this.queueIndex)
      } else {
        this._clearCurrentTrack()
      }
    } else if (index < this.queueIndex) {
      this.queueIndex--
    }

    setStorage(STORAGE_KEYS.PLAYER_QUEUE, this.queue)
    setStorage(STORAGE_KEYS.PLAYER_QI, this.queueIndex)
  }

  _clearCurrentTrack() {
    this.id = 0
    this.title = ''
    this.artist = ''
    this.cover = ''
    this.duration = 0
    this.currentTrack = null
    this.playing = false
    this.queueIndex = -1
    this.error = ''
    this._persistState()
  }

  // ==========================================
  // 状态持久化
  // ==========================================

  /** 恢复播放状态（页面加载时调用） */
  restore() {
    if (getStorage(STORAGE_KEYS.RESTORE_SESSION, 'true') !== 'true') return

    const savedId = parseInt(getStorage(STORAGE_KEYS.PLAYER_ID, '0'))
    if (!savedId) return

    const savedQueue = compactQueue(getStorageJson(STORAGE_KEYS.PLAYER_QUEUE, []))
    const savedTime = parseFloat(getStorage(STORAGE_KEYS.PLAYER_TIME, '0'))
    const savedIndex = parseInt(getStorage(STORAGE_KEYS.PLAYER_QI, '-1'))
    const idx = savedIndex >= 0 ? savedIndex : 0

    this.queue = savedQueue
    this.queueIndex = idx
    this.id = savedId
    this.title = getStorage(STORAGE_KEYS.PLAYER_TITLE, '')
    this.artist = getStorage(STORAGE_KEYS.PLAYER_ARTIST, '')
    this.cover = getStorage(STORAGE_KEYS.PLAYER_COVER, '')
    this.duration = parseInt(getStorage(STORAGE_KEYS.PLAYER_DURATION, '0'))
    this.currentTime = savedTime
    this.currentTrack = savedQueue.find(track => track?.id === savedId) || savedQueue[idx] || null

    if (savedQueue.length > 0) {
      setStorage(STORAGE_KEYS.PLAYER_QUEUE, savedQueue)
    }

    const requestId = ++this._playRequestId
    this._restoreSeeking = savedTime > 0
    this._shouldAutoPlay = false
    this.playing = false

    getPlayableUrls(savedId, this.preferredLevel, this._prefetchCache, requestId)
      .then(({ urls }) => {
        if (requestId !== this._playRequestId) return
        this._playUrls = urls
        this._playUrlIndex = 0
        if (urls.length > 0) {
          engine.load(urls[0])
        } else {
          this.loading = false
        }
      })
      .catch(() => {
        if (requestId !== this._playRequestId) return
        this.loading = false
      })
  }

  /** 保存当前状态到 localStorage */
  save() {
    this._persistState()
    setStorage(STORAGE_KEYS.PLAYER_QUEUE, this.queue)
    setStorage(STORAGE_KEYS.PLAYER_TIME, this.currentTime)
  }

  /** 销毁，释放资源 */
  destroy() {
    this._clearLoadingTimer()
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    destroyNativeMedia()
    engine.destroy()
  }
}

/** 全局单例 */
export const player = new PlayerState()
