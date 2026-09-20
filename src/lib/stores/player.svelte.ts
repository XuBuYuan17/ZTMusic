/**
 * PlayerState — 播放器核心状态管理
 *
 * 职责：整合各子模块（engine、queue、url-resolver、prefetch、history、native-media），
 * 提供统一的播放控制 API。
 *
 * 用法：
 *   import { player } from './player.svelte.ts'
 *   player.playTrack(track, 0)
 *   player.next()
 *   player.pause()
 */

import { engine } from '../player/engine.ts'
import { getStorage, getStorageJson, removeStorage, setStorage } from '../utils/storage.ts'
import { normalizeImageUrl, coverUrl } from '../utils/image.ts'
import { dbCache } from '../db/cache.ts'
import { getPlayableUrls, fillFallbackUrls } from '../player/url-resolver.ts'
import { getTrialPlaybackMessage } from '../player/trial-message.ts'
import {
  compactTrack,
  compactQueue,
  createShuffleState,
  replaceQueueState,
  moveQueueItemState,
  removeQueueItemState,
  getNextIndex,
  getPrevIndex,
  commitNextIndex,
} from '../player/queue.ts'
import type { CompactTrack, CompactTrackInput, QueueState } from '../player/queue.ts'
import { dbHistory } from '../db/history.ts'
import { initNativeMedia, syncNativeMedia, destroyNativeMedia, shouldUseWebMediaSession } from '../player/native-media.ts'
import { createPrefetchManager } from '../player/prefetch.ts'
import { PLAYBACK, QUALITY_ORDER, ERROR_MESSAGES, STORAGE_KEYS, FALLBACK_URL_TEMPLATE } from '../utils/constants.ts'
import { ERROR_KIND, createErrorSnapshot, debugLog, swallowError } from '../utils/error.ts'
import { getBooleanSetting, getSetting, setSetting } from '../utils/settings.ts'
import { createFallbackController } from '../player/fallback.ts'
import { abortAllRequests } from '../utils/request.ts'
import { toast } from './toast.svelte.js'
import { getLocalPlayableUrl } from '../local-music/storage.ts'
import { getWebDavPlayableUrl, subscribeWebDavDownloadProgress } from '../local-music/webdav.ts'
import type { SongId } from '../types/music.ts'
import type { PlayMode, QualityLevel, PlayerEngineState } from '../types/player.ts'

/** App.svelte 注入的登录态提供者（解耦 player 对 auth store 的直接依赖） */
interface PlayerAuthProvider {
  isLoggedIn(): boolean
  getVipInfo(): unknown
  isVip(): boolean
  checkLoginStatus(): boolean | Promise<boolean>
}

/** 等价于 err?.message || fallback，但 catch 变量是 unknown，需要收窄 */
function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

type TimerHandle = ReturnType<typeof setTimeout>
type ProgressFrame = number | TimerHandle

function parseStoredTrackId(value: unknown): SongId {
  const raw = String(value || '')
  if (raw.startsWith('local:') || raw.startsWith('webdav:')) return raw
  return Number.parseInt(raw, 10) || 0
}

class PlayerState {
  // ===== 当前歌曲 =====
  id = $state<SongId>(0)
  title = $state('')
  artist = $state('')
  cover = $state('')
  duration = $state(0)
  currentTrack = $state<CompactTrack | null>(null)

  // ===== 播放状态 =====
  playing = $state(false)
  loading = $state(false)
  currentTime = $state(0)
  error = $state('')
  /** WebDAV 音频下载进度（用于底部播放条小提示）；percent 为 -1 表示总大小未知 */
  webdavDownloading = $state<{ name: string; percent: number } | null>(null)

  // ===== 设置 =====
  volume = $state(0.8)
  mode = $state<PlayMode>('list')
  preferredLevel = $state<QualityLevel>('standard')

  // ===== 队列 =====
  queue = $state<CompactTrack[]>([])
  queueIndex = $state(-1)

  // ===== 内部状态（非响应式） =====
  /** 恢复播放时是否需要 seek */
  _restoreSeeking = false
  /** 加载后是否自动播放 */
  _shouldAutoPlay = false
  /** 保存进度的定时器 */
  _saveTimer: TimerHandle | null = null
  /** 进度 UI 合帧更新 */
  _timeUpdateFrame: ProgressFrame | null = null
  _pendingCurrentTime = 0
  _lastCurrentTimeCommit = 0
  _lastTimedNativeSyncAt = 0
  _lastTimedWebSyncAt = 0
  _lastWebMediaPosition = 0
  /** loading 超时保护 */
  _loadingTimer: TimerHandle | null = null
  /** 播放请求 ID（用于竞态控制） */
  _playRequestId = 0
  /** 首条 URL 的音质等级 */
  _firstUrlLevel = ''
  /** 自动切歌锁 */
  _advanceLock = false
  /** 自动切歌定时器引用 —— destroy 时清理 */
  _advanceTimer: TimerHandle | null = null
  /** 媒体会话是否已初始化 */
  _mediaSessionInited = false
  /** fallback URL 遍历控制器 */
  _fallback = createFallbackController([])
  /** 等待 fillFallback 完成 */
  _waitingForFill = false
  /** 预取管理器 */
  _prefetchManager = createPrefetchManager()
  /** 预取缓存 Map<id, url[]> */
  _prefetchCache: Map<SongId, string[]> = this._prefetchManager.cache
  /** auth 提供者（依赖注入，用于解耦） */
  _authProvider: PlayerAuthProvider = {
    isLoggedIn: () => false,
    getVipInfo: () => null,
    isVip: () => false,
    checkLoginStatus: () => Promise.resolve(true),
  }
  /** 当前播放请求的中止控制器 */
  _abortController = new AbortController()
  /** WebDAV 下载进度订阅的清理函数 */
  _unsubscribeWebDavProgress: (() => void) | null = null
  /** 洗牌状态：保存当前队列的 Fisher-Yates 顺序 */
  shuffleState = createShuffleState()

  constructor() {
    // 从 localStorage 恢复初始状态
    this._restoreInitialState()

    // 订阅 WebDAV 下载进度，供底部播放条显示小提示
    this._unsubscribeWebDavProgress = subscribeWebDavDownloadProgress((progress) => {
      if (!progress) {
        this.webdavDownloading = null
        return
      }
      const percent = progress.total > 0
        ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
        : -1
      this.webdavDownloading = { name: progress.name, percent }
    })

    // 设置 engine 事件监听
    this._setupEngineListeners()

    // 初始化原生媒体会话
    initNativeMedia({
      getMetadata: () => ({
        title: this.title,
        artist: this.artist,
        cover: this.cover,
        duration: this.duration > 0 ? this.duration : 0,
      }),
      getPlaybackState: () => ({
        playing: this.playing,
        position: this.currentTime,
        duration: this.duration > 0 ? this.duration : 0,
      }),
      onMediaButton: (action: string) => this._handleMediaButton(action),
    })

    // 初始化媒体会话（桌面 Web Media Session API）
    this._initMediaSession()
  }

  /** 设置 auth 提供者（依赖注入）—— 在 App 初始化时调用一次 */
  setAuthProvider(provider: Partial<PlayerAuthProvider>) {
    this._authProvider = { ...this._authProvider, ...provider }
  }

  // ==========================================
  // 内部方法
  // ==========================================

  _restoreInitialState(): void {
    this.id = parseStoredTrackId(getStorage(STORAGE_KEYS.PLAYER_ID, '0'))
    this.title = getStorage(STORAGE_KEYS.PLAYER_TITLE, '')
    this.artist = getStorage(STORAGE_KEYS.PLAYER_ARTIST, '')
    this.cover = getStorage(STORAGE_KEYS.PLAYER_COVER, '')
    this.duration = parseInt(getStorage(STORAGE_KEYS.PLAYER_DURATION, '0')) || 0
    this.currentTime = parseFloat(getStorage(STORAGE_KEYS.PLAYER_TIME, '0'))
    this.volume = parseFloat(getSetting(STORAGE_KEYS.VOLUME, '0.8'))
    this.mode = getSetting(STORAGE_KEYS.MODE, 'list') as PlayMode
    this.preferredLevel = getSetting(STORAGE_KEYS.PREFERRED_QUALITY, 'standard') as QualityLevel
    const restoredQueue = replaceQueueState(
      getStorageJson(STORAGE_KEYS.PLAYER_QUEUE, []),
      parseInt(getStorage(STORAGE_KEYS.PLAYER_QI, '-1')),
    )
    this.queue = restoredQueue.queue
    this.queueIndex = restoredQueue.queueIndex
    this.shuffleState = restoredQueue.shuffleState

    engine.setVolume(this.volume)
  }

  _setupEngineListeners(): void {
    engine.onTimeUpdate((t) => {
      this._scheduleProgressUpdate(t)
    })

    engine.onEnded((state: PlayerEngineState) => {
      this.playing = false
      this._handleEnded(state)
    })

    engine.onLoadStart(() => {
      this.loading = true
    })

    engine.onCanPlay((_state: PlayerEngineState) => {
      this.loading = false
      this._clearLoadingTimer()
      this.duration = engine.duration
      this.playing = this._shouldAutoPlay && !engine.paused
      // 恢复播放时 seek
      if (this._restoreSeeking && this.currentTime > 0) {
        const restoreTime = this.currentTime
        engine.seek(restoreTime)
        this._commitProgress(restoreTime, { force: true })
        this._restoreSeeking = false
      } else {
        this._commitProgress(engine.currentTime, { force: true })
      }
      this._syncTimedMedia(this.currentTime, { force: true })
    })

    engine.onError((state) => {
      this._setPlayerError('EngineError', state, ERROR_MESSAGES.PLAY_FAILED)
      this._fallbackNext('EngineErrorNoFallback')
    })

    engine.onPlay(() => {
      this.playing = true
      this._setWebPlaybackState('playing')
      this._syncTimedMedia(engine.currentTime, { force: true })
    })

    engine.onPause(() => {
      this._commitProgress(engine.currentTime, { force: true })
      if (!this.loading || !this._shouldAutoPlay) this.playing = false
      this._setWebPlaybackState('paused')
      this._syncTimedMedia(this.currentTime, { force: true })
    })
  }

  _initMediaSession(): void {
    if (!shouldUseWebMediaSession()) return
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (this._mediaSessionInited) return
    this._mediaSessionInited = true

    // playbackState 的同步在 _setupEngineListeners 的 onPlay/onPause 里，
    // 不能在这里再 engine.onPlay/onPause —— engine 的订阅是单槽的，会把那边整个覆盖掉。

    this._setMediaActionHandler('play', () => { engine.play().catch((err) => swallowError('MediaSession.play', err)) })
    this._setMediaActionHandler('pause', () => { engine.pause() })
    this._setMediaActionHandler('stop', () => { engine.pause(); engine.seek(0) })
    this._setMediaActionHandler('nexttrack', () => this.next())
    this._setMediaActionHandler('previoustrack', () => this.prev())
    this._setMediaActionHandler('seekbackward', (details) => {
      const offset = details?.seekOffset || 10
      engine.seek(Math.max(0, this.currentTime - offset))
    })
    this._setMediaActionHandler('seekforward', (details) => {
      const offset = details?.seekOffset || 10
      const duration = this.duration > 0 ? this.duration : Number.POSITIVE_INFINITY
      engine.seek(Math.min(duration, this.currentTime + offset))
    })
    this._setMediaActionHandler('seekto', (details) => {
      if (details && typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) {
        engine.seek(details.seekTime)
      }
    })
  }

  _setMediaActionHandler(
    action: MediaSessionAction,
    handler: (details?: MediaSessionActionDetails) => void,
  ): void {
    try {
      navigator.mediaSession.setActionHandler(action, handler)
    } catch {
      // Some platforms do not support every media action.
    }
  }

  _setWebPlaybackState(state: MediaSessionPlaybackState): void {
    if (!shouldUseWebMediaSession()) return
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try { navigator.mediaSession.playbackState = state } catch { /* ignore */ }
  }

  _syncWebMediaPosition(position: number = this.currentTime): void {
    if (!shouldUseWebMediaSession()) return
    if (typeof navigator === 'undefined' || !navigator.mediaSession?.setPositionState) return
    const duration = this.duration > 0 ? this.duration : 0
    if (!duration) return
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(Math.max(position || 0, 0), duration),
      })
    } catch {
      // Ignore invalid or unsupported position state.
    }
  }

  _scheduleProgressUpdate(time: number): void {
    this._pendingCurrentTime = Number.isFinite(time) ? time : 0
    if (this._timeUpdateFrame) return
    const tick = () => {
      this._timeUpdateFrame = null
      this._commitProgress(this._pendingCurrentTime)
      this._syncTimedMedia(this._pendingCurrentTime)
    }
    this._timeUpdateFrame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(tick)
      : setTimeout(tick, 16)
  }

  _commitProgress(time: number, { force = false }: { force?: boolean } = {}): void {
    const next = Number.isFinite(time) ? time : 0
    const nearEnd = this.duration > 0 && Math.abs(this.duration - next) < 0.35
    if (force || nearEnd || Math.abs(next - this._lastCurrentTimeCommit) >= 0.2) {
      this.currentTime = next
      this._lastCurrentTimeCommit = next
    }
    this._debouncedSaveTime(next)
  }

  _syncTimedMedia(position: number, { force = false }: { force?: boolean } = {}): void {
    const now = Date.now()
    const pos = Number.isFinite(position) ? position : 0

    if (force || now - this._lastTimedWebSyncAt >= 1000 || Math.abs(pos - this._lastWebMediaPosition) >= 1) {
      this._syncWebMediaPosition(pos)
      this._lastTimedWebSyncAt = now
      this._lastWebMediaPosition = pos
    }

    if (force || now - this._lastTimedNativeSyncAt >= 1000) {
      syncNativeMedia()
      this._lastTimedNativeSyncAt = now
    }
  }

  _debouncedSaveTime(t: number): void {
    if (this._saveTimer) return
    this._saveTimer = setTimeout(() => {
      setStorage(STORAGE_KEYS.PLAYER_TIME, t)
      this._saveTimer = null
    }, PLAYBACK.SAVE_INTERVAL)
  }

  /** loading 超时保护：15 秒后自动解除 loading */
  _startLoadingTimeout(): void {
    this._clearLoadingTimer()
    this._loadingTimer = setTimeout(() => {
      if (this.loading) {
        this.loading = false
        this._setPlayerError('LoadingTimeout', { kind: ERROR_KIND.TIMEOUT, message: '播放加载超时' }, ERROR_MESSAGES.PLAY_FAILED)
      }
    }, 15000)
  }

  _clearLoadingTimer(): void {
    if (this._loadingTimer) {
      clearTimeout(this._loadingTimer)
      this._loadingTimer = null
    }
  }

  _clearError(): void {
    this.error = ''
  }

  _setPlayerError(
    context: string,
    err: unknown,
    userMessage?: string,
    extra: { silent?: boolean } & Record<string, unknown> = {},
  ): void {
    const fbState = this._fallback.getState()
    const snapshot = createErrorSnapshot(context, err, {
      trackId: this.id,
      title: this.title,
      queueIndex: this.queueIndex,
      playRequestId: this._playRequestId,
      currentUrlIndex: fbState.index,
      urlCount: fbState.total,
      ...extra,
    })
    this.error = userMessage || ERROR_MESSAGES.PLAY_FAILED
    debugLog('player', 'error', snapshot)
    // 用户可见错误显示 toast（silent 标记的跳过，如后台填充失败）
    if (!extra?.silent) toast.error(this.error)
  }

  _setNoUrlError(
    context: string = 'PlayerNoUrl',
    extra: { silent?: boolean } = {},
  ): void {
    this._setPlayerError(
      context,
      { kind: ERROR_KIND.NO_URL, message: ERROR_MESSAGES.NO_URL },
      ERROR_MESSAGES.NO_URL,
      extra,
    )
  }

  _persistState(): void {
    setStorage(STORAGE_KEYS.PLAYER_ID, this.id)
    setStorage(STORAGE_KEYS.PLAYER_TITLE, this.title)
    setStorage(STORAGE_KEYS.PLAYER_ARTIST, this.artist)
    setStorage(STORAGE_KEYS.PLAYER_COVER, this.cover)
    setStorage(STORAGE_KEYS.PLAYER_DURATION, this.duration)
    setStorage(STORAGE_KEYS.PLAYER_QI, this.queueIndex)
  }

  _commitQueueState(state: QueueState, { clearStorage = false }: { clearStorage?: boolean } = {}): void {
    this.queue = state.queue
    this.queueIndex = state.queueIndex
    this.shuffleState = state.shuffleState || createShuffleState()
    engine.cancelPreload()
    if (clearStorage) {
      removeStorage(STORAGE_KEYS.PLAYER_QUEUE)
      removeStorage(STORAGE_KEYS.PLAYER_QI)
      return
    }
    setStorage(STORAGE_KEYS.PLAYER_QUEUE, this.queue)
    setStorage(STORAGE_KEYS.PLAYER_QI, this.queueIndex)
  }

  _handleEnded(_state: PlayerEngineState): void {
    if (this._advanceLock || this.queue.length === 0) return
    this._advanceLock = true
    this._shouldAutoPlay = true
    this._advanceTimer = setTimeout(() => {
      if (!this._advanceLock) return
      this._advanceLock = false
      this._advanceTimer = null
      this.next()
    }, PLAYBACK.ADVANCE_DELAY)
  }

  _handleMediaButton(action: string): void {
    if (action === 'play') { engine.play().catch((err) => swallowError('NativeMedia.play', err)) }
    else if (action === 'pause') { engine.pause() }
    else if (action === 'next') { this.next() }
    else if (action === 'prev') { this.prev() }
  }

  /**
   * 尝试 fallback 链中的下一个 URL。
   * 由 engine.onError 和 engine.play().catch 调用。
   * @param exhaustedContext - URL 全部耗尽时的错误上下文
   */
  _fallbackNext(exhaustedContext: string = 'FallbackNoUrl'): void {
    const result = this._fallback.next()

    if (result.status === 'playing') {
      this._waitingForFill = false
      this.loading = true
      this._clearError()
      // 切换 URL 前保留 currentTime：fallback 触发时多半播到中途，切完让 onCanPlay 里的 seek 恢复进度
      if (this.currentTime > 0) this._restoreSeeking = true
      engine.load(result.url)
      engine.play().catch(() => {
        this._setPlayerError('FallbackPlayFailed', { message: 'fallback play failed' }, ERROR_MESSAGES.PLAY_FAILED)
        this._fallbackNext(exhaustedContext)
      })
    } else if (result.status === 'waiting') {
      this._waitingForFill = true
    } else {
      // exhausted — 全部 URL 已尝试完毕
      this._waitingForFill = false
      this._clearLoadingTimer()
      this.loading = false
      this.playing = false
      this._shouldAutoPlay = false
      this._setNoUrlError(exhaustedContext)
    }
  }

  // ==========================================
  // 播放控制
  // ==========================================

  /**
   * 播放指定曲目
   * @param track - 原始曲目数据（中立 Song / 本地曲目 / 历史记录均可）
   * @param index - 在队列中的索引
   */
  playTrack(track: CompactTrackInput | null | undefined, index: number): void {
    if (!track) return
    const playableTrack = compactTrack(track)
    if (!playableTrack) return

    // 中止上次未完成的播放请求
    abortAllRequests()
    this._abortController.abort()
    this._abortController = new AbortController()
    const signal = this._abortController.signal

    // 取消挂起的自动切歌与预加载，避免与本次手动/自动切歌产生竞态（放错歌）
    this._advanceLock = false
    engine.cancelPreload()

    const requestId = ++this._playRequestId
    this._fallback.updateUrls([])
    this.id = playableTrack.id
    this.title = playableTrack.name
    this.artist = playableTrack.ar.map(a => a.name).join(' / ')
    this.currentTrack = playableTrack
    this.cover = normalizeImageUrl(playableTrack.picUrl || playableTrack.al.picUrl || '')
    // 网易云 dt 为毫秒,播放状态统一用秒(audio.duration 同单位)
    this.duration = (playableTrack.dt || 0) / 1000
    this.queueIndex = index >= 0 ? index : this.queueIndex
    this.loading = true
    this.playing = false
    this._shouldAutoPlay = true
    this._clearError()
    this._startLoadingTimeout()
    debugLog('player', 'play-track', { id: playableTrack.id, index, preferredLevel: this.preferredLevel })

    // 更新媒体会话元数据
    if (shouldUseWebMediaSession() && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      const mediaMetadata: MediaMetadataInit = {
        title: this.title,
        artist: this.artist,
        album: playableTrack.al?.name || '',
      }
      if (this.cover) mediaMetadata.artwork = [{ src: coverUrl(this.cover, 512), sizes: '512x512', type: 'image/jpeg' }]
      navigator.mediaSession.metadata = new MediaMetadata(mediaMetadata)
    }

    this._persistState()
    dbHistory.add(playableTrack) // async, non-blocking; handles SQLite + localStorage fallback internally
    this._syncTimedMedia(this.currentTime, { force: true })

    if (playableTrack.source === 'local') {
      this._playLocalTrack(playableTrack, requestId)
      return
    }
    if (playableTrack.source === 'webdav') {
      this._playWebDavTrack(playableTrack, requestId)
      return
    }

    // 获取可播放 URL，传入 auth 状态供 url-resolver 使用（而非 url-resolver 直接 import auth）
    const authOpts = { isLoggedIn: this._authProvider.isLoggedIn(), checkLoginStatus: () => this._authProvider.checkLoginStatus() }
    getPlayableUrls(playableTrack.id, this.preferredLevel, this._prefetchCache, requestId, authOpts, signal)
      .then(({ urls, firstUrlLevel, isTrial }) => {
        if (requestId !== this._playRequestId) return
        this._firstUrlLevel = firstUrlLevel
        this._fallback.updateUrls(urls)

        if (urls.length > 0) {
          // 如果是试听片段且已登录，显示 VIP 提示（仍播放试听）
          if (isTrial && this._authProvider.isLoggedIn()) {
            const trialMessage = getTrialPlaybackMessage({ isLoggedIn: this._authProvider.isLoggedIn(), vipInfo: this._authProvider.getVipInfo(), isVip: this._authProvider.isVip() })
            this._setPlayerError(
              'TrialUrlDetected',
              { kind: ERROR_KIND.TRIAL, message: trialMessage },
              trialMessage,
              { silent: true },
            )
          }
          this._prefetchNextTrack(requestId)
          this._fillFallbackInBackground(playableTrack.id, requestId, signal)

          const first = this._fallback.next()
          if (first.status === 'playing') {
            engine.load(first.url)
            engine.play()
              .then(() => {
                if (requestId === this._playRequestId) this.playing = true
              })
              .catch((err) => {
                if (requestId !== this._playRequestId) return
                this._setPlayerError('InitialPlayFailed', err, ERROR_MESSAGES.PLAY_FAILED)
                this._fallbackNext('InitialPlayNoUrl')
              })
          }
        } else {
          this._clearLoadingTimer()
          this.loading = false
          this.playing = false
          this._shouldAutoPlay = false
          this._setNoUrlError('ResolveNoUrl')
        }
      })
      .catch((err) => {
        if (requestId !== this._playRequestId) return
        this.loading = false
        this.playing = false
        this._shouldAutoPlay = false
        this._setPlayerError('ResolvePlayableUrlsFailed', err, ERROR_MESSAGES.NO_URL)
      })
  }

  async _playLocalTrack(track: CompactTrack, requestId: number): Promise<void> {
    try {
      const url = await getLocalPlayableUrl(track.localId || track.id)
      if (requestId !== this._playRequestId) return
      this._firstUrlLevel = 'local'
      this._fallback.updateUrls([url])
      this._prefetchNextTrack(requestId)
      const first = this._fallback.next()
      if (first.status !== 'playing') throw new Error('Local audio URL is unavailable')
      engine.load(first.url)
      await engine.play()
      if (requestId === this._playRequestId) this.playing = true
    } catch (error) {
      if (requestId !== this._playRequestId) return
      this._clearLoadingTimer()
      this.loading = false
      this.playing = false
      this._shouldAutoPlay = false
      this._setPlayerError('LocalPlaybackFailed', error, errorMessage(error, '本地音频播放失败'))
    }
  }

  async _playWebDavTrack(track: CompactTrack, requestId: number): Promise<void> {
    try {
      const url = await getWebDavPlayableUrl(track)
      if (requestId !== this._playRequestId) return
      this._firstUrlLevel = 'webdav'
      this._fallback.updateUrls([url])
      this._prefetchNextTrack(requestId)
      const first = this._fallback.next()
      if (first.status !== 'playing') throw new Error('WebDAV audio URL is unavailable')
      engine.load(first.url)
      await engine.play()
      if (requestId === this._playRequestId) this.playing = true
    } catch (error) {
      if (requestId !== this._playRequestId) return
      this._clearLoadingTimer()
      this.loading = false
      this.playing = false
      this._shouldAutoPlay = false
      this._setPlayerError('WebDavPlaybackFailed', error, errorMessage(error, 'WebDAV 音频播放失败'))
    }
  }

  _prefetchNextTrack(reqId: number): void {
    if (this.queue.length < 2 || this.queueIndex < 0) return
    this._prefetchManager.prefetchNextTrackUrl({
      queue: this.queue,
      queueIndex: this.queueIndex,
      mode: this.mode,
      preferredLevel: this.preferredLevel,
      reqId,
      isStale: () => reqId !== this._playRequestId,
      preload: (url) => engine.preload(url),
      shuffleState: this.shuffleState,
    }).catch((err) => swallowError('Player.prefetchNextTrack', err))
  }

  async _fillFallbackInBackground(id: SongId, reqId: number, signal: AbortSignal): Promise<void> {
    this._fallback.setFillPending(true)
    try {
      const result = await fillFallbackUrls(id, reqId, {
        currentUrls: this._fallback.getUrls(),
        firstUrlLevel: this._firstUrlLevel,
        preferredLevel: this.preferredLevel,
        isPlaying: this.playing,
        currentTime: this.currentTime,
        authOpts: { isLoggedIn: this._authProvider.isLoggedIn(), checkLoginStatus: () => this._authProvider.checkLoginStatus() },
        onQualityUpgrade: ({ urls }) => {
          // ponytail: 仅更新 URL 列表，不中途切 URL —— 避免 pop/静音
          // 音质升级后的 URL 会在下次切歌或 fallback 链遍历时被使用
          if (reqId !== this._playRequestId) return
          this._fallback.updateUrls(urls)
        },
        isStale: () => reqId !== this._playRequestId,
        signal,
      })

      if (reqId === this._playRequestId) {
        this._fallback.updateUrls(result)
        if (this._waitingForFill) {
          this._waitingForFill = false
          this._fallbackNext()
        }
      }


      // 持久化最新 URL 到 IndexedDB
      if (result.length > 0 && result[0] !== FALLBACK_URL_TEMPLATE(id)) {
        dbCache.urlSet(id, result).catch((err) => swallowError('Player.cacheUrlSet', err))
      }
    } catch (err) {
      if (reqId === this._playRequestId) {
        this._setPlayerError('FillFallbackFailed', err, ERROR_MESSAGES.PLAY_FAILED, { silent: true })
      }
    } finally {
      this._fallback.setFillPending(false)
    }
  }

  /**
   * 播放队列
   * @param tracks - 曲目列表
   * @param startIndex - 开始播放的索引
   */
  playQueue(tracks: readonly CompactTrackInput[], startIndex = 0): void {
    this.replaceQueue(tracks, startIndex)
    const track = this.queue[this.queueIndex]
    if (track) {
      this.playTrack(track, this.queueIndex)
    }
  }

  /** 替换队列但不自动播放。 */
  replaceQueue(tracks: readonly CompactTrackInput[], startIndex = 0): void {
    this._commitQueueState(replaceQueueState(tracks, startIndex))
  }

  /** 下一首 */
  next(): void {
    abortAllRequests()
    engine.cancelPreload()
    if (this.queue.length === 0) return

    if (this._advanceLock) {
      this._advanceLock = false
    }

    const idx = getNextIndex({
      currentIndex: this.queueIndex,
      queueLength: this.queue.length,
      mode: this.mode,
      shuffleState: this.shuffleState,
    })

    const track = this.queue[idx]
    if (!track) return
    // 确认切歌后才推进洗牌指针，避免预取的 peek 把这一首跳过
    commitNextIndex({ mode: this.mode, shuffleState: this.shuffleState })
    this.playTrack(track, idx)
  }

  /**
   * 插入到下一首播放（当前曲目之后）
   */
  playNext(track: CompactTrackInput | readonly CompactTrackInput[]): void {
    const tracks = Array.isArray(track) ? track : [track]
    if (tracks.length === 0) return
    const insertAt = this.queueIndex + 1
    const queue = compactQueue([
      ...this.queue.slice(0, insertAt),
      ...tracks,
      ...this.queue.slice(insertAt),
    ])
    this._commitQueueState({
      queue,
      queueIndex: this.queueIndex < 0 && queue.length > 0 ? 0 : this.queueIndex,
      shuffleState: createShuffleState(),
    })
  }

  /** 添加到队列末尾 */
  addToQueue(track: CompactTrackInput | readonly CompactTrackInput[]): void {
    const tracks = Array.isArray(track) ? track : [track]
    if (tracks.length === 0) return
    const queue = compactQueue([...this.queue, ...tracks])
    this._commitQueueState({
      queue,
      queueIndex: this.queueIndex < 0 && queue.length > 0 ? 0 : this.queueIndex,
      shuffleState: createShuffleState(),
    })
  }

  /** 上一首 */
  prev(): void {
    abortAllRequests()
    engine.cancelPreload()
    if (this.queue.length === 0) return

    if (this._advanceLock) {
      this._advanceLock = false
    }

    const idx = getPrevIndex({
      currentIndex: this.queueIndex,
      queueLength: this.queue.length,
    })

    const track = this.queue[idx]
    if (track) this.playTrack(track, idx)
  }

  /** 暂停 */
  pause(): void {
    engine.pause()
  }

  /** 切换播放/暂停 */
  togglePlay(): void {
    if (!this.id) return

    if (engine.paused) {
      engine.play()
        .then(() => {
          this.playing = true
          this._shouldAutoPlay = true
        })
        .catch((err) => {
          this._setPlayerError('TogglePlayFailed', err, ERROR_MESSAGES.PLAY_FAILED)
          this._fallbackNext('TogglePlayNoUrl')
        })
    } else {
      engine.pause()
      this.playing = false
    }
  }

  /** 跳转到指定时间 */
  seek(time: number): void {
    engine.seek(time)
    this._commitProgress(time, { force: true })
    setStorage(STORAGE_KEYS.PLAYER_TIME, time)
    this._syncTimedMedia(time, { force: true })
  }

  /** 设置音量（input range 给的是字符串，parseFloat 兼容） */
  setVolume(v: number | string): void {
    this.volume = Number.parseFloat(setSetting(STORAGE_KEYS.VOLUME, v))
    engine.setVolume(this.volume)
  }

  /** 设置播放模式 */
  setMode(m: PlayMode): void {
    this.mode = setSetting(STORAGE_KEYS.MODE, m) as PlayMode
  }

  /** 设置偏好音质 */
  setPreferredLevel(level: string): void {
    if (QUALITY_ORDER.includes(level)) {
      this.preferredLevel = setSetting(STORAGE_KEYS.PREFERRED_QUALITY, level) as QualityLevel
    }
  }

  // ==========================================
  // 队列控制
  // ==========================================

  /** 清空队列 */
  clearQueue(): void {
    abortAllRequests()
    this._commitQueueState(
      { queue: [], queueIndex: -1, shuffleState: createShuffleState() },
      { clearStorage: true },
    )
  }

  /** 从队列移除一组曲目 ID，供本地曲库删除文件时清理悬空引用。 */
  removeTracksById(ids?: Iterable<SongId> | Set<SongId> | null): void {
    const removedIds: Set<SongId> = ids instanceof Set ? ids : new Set(ids ?? [])
    if (removedIds.size === 0) return
    const currentRemoved = removedIds.has(this.id)
    const nextQueue = this.queue.filter((track) => !removedIds.has(track.id))

    if (currentRemoved) {
      engine.pause()
      const nextIndex = nextQueue.length > 0
        ? Math.min(Math.max(this.queueIndex, 0), nextQueue.length - 1)
        : -1
      this._commitQueueState({ queue: nextQueue, queueIndex: nextIndex, shuffleState: createShuffleState() })
      const nextTrack = nextQueue[nextIndex]
      if (nextTrack) {
        this.playTrack(nextTrack, nextIndex)
      } else {
        this._clearCurrentTrack()
      }
    } else {
      const removedBefore = this.queue.slice(0, Math.max(this.queueIndex, 0)).filter((track) => removedIds.has(track.id)).length
      this._commitQueueState({
        queue: nextQueue,
        queueIndex: Math.max(-1, this.queueIndex - removedBefore),
        shuffleState: createShuffleState(),
      })
    }
  }

  /** 移动队列项并保持当前歌曲指向不变。 */
  moveQueueItem(fromIndex: number, toIndex: number): boolean {
    const state = moveQueueItemState(this.queue, this.queueIndex, fromIndex, toIndex)
    if (!state) return false
    this._commitQueueState(state)
    return true
  }

  /** 从队列移除指定索引。 */
  removeQueueItem(index: number): boolean {
    const state = removeQueueItemState(this.queue, this.queueIndex, index)
    if (!state) return false
    this._commitQueueState(state)

    if (state.wasCurrent) {
      const current = this.queue[this.queueIndex]
      if (this.queue.length > 0 && this.queueIndex >= 0 && current) {
        this.playTrack(current, this.queueIndex)
      } else {
        this._clearCurrentTrack()
      }
    }
    return true
  }

  _clearCurrentTrack(): void {
    this.id = 0
    this.title = ''
    this.artist = ''
    this.cover = ''
    this.duration = 0
    this.currentTrack = null
    this.playing = false
    this.queueIndex = -1
    this._clearError()
    this._persistState()
  }

  // ==========================================
  // 状态持久化
  // ==========================================

  /** 恢复播放状态（页面加载时调用） */
  restore(): void {
    if (!getBooleanSetting(STORAGE_KEYS.RESTORE_SESSION, 'true')) return

    const savedId = parseStoredTrackId(getStorage(STORAGE_KEYS.PLAYER_ID, '0'))
    if (!savedId) return

    const savedQueueState = replaceQueueState(
      getStorageJson(STORAGE_KEYS.PLAYER_QUEUE, []),
      parseInt(getStorage(STORAGE_KEYS.PLAYER_QI, '-1')),
    )
    const savedQueue = savedQueueState.queue
    const savedTime = parseFloat(getStorage(STORAGE_KEYS.PLAYER_TIME, '0'))
    const idx = savedQueueState.queueIndex

    this.queue = savedQueue
    this.queueIndex = idx
    this.shuffleState = savedQueueState.shuffleState
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
    this.loading = true
    this._clearError()
    this._startLoadingTimeout()

    abortAllRequests()
    this._abortController.abort()
    this._abortController = new AbortController()
    const signal = this._abortController.signal

    const restoredTrack = this.currentTrack
    if (restoredTrack?.source === 'local' || restoredTrack?.source === 'webdav') {
      const resolver = restoredTrack.source === 'webdav'
        ? getWebDavPlayableUrl(restoredTrack)
        : getLocalPlayableUrl(restoredTrack.localId || savedId)
      resolver
        .then((url) => {
          if (requestId !== this._playRequestId) return
          this._fallback.updateUrls([url])
          const first = this._fallback.next()
          if (first.status === 'playing') engine.load(first.url)
        })
        .catch((err) => {
          if (requestId !== this._playRequestId) return
          this._clearLoadingTimer()
          this.loading = false
          this._setPlayerError('RestoreLocalTrackFailed', err, errorMessage(err, '本地音频恢复失败'))
        })
      return
    }

    getPlayableUrls(savedId, this.preferredLevel, this._prefetchCache, requestId, {
      isLoggedIn: this._authProvider.isLoggedIn(),
      checkLoginStatus: () => this._authProvider.checkLoginStatus(),
    }, signal)
      .then(({ urls }) => {
        if (requestId !== this._playRequestId) {
          this._clearLoadingTimer()
          this.loading = false
          return
        }
        this._fallback.updateUrls(urls)
        if (urls.length > 0) {
          const first = this._fallback.next()
          if (first.status === 'playing') engine.load(first.url)
          // 后台填充更多 URL，避免恢复时第一条 URL 过期导致无 fallback
          this._fillFallbackInBackground(savedId, requestId, signal)
        } else {
          this._clearLoadingTimer()
          this.loading = false
          this._setNoUrlError('RestoreNoUrl')
        }
      })
      .catch((err) => {
        if (requestId !== this._playRequestId) {
          this._clearLoadingTimer()
          this.loading = false
          return
        }
        this._clearLoadingTimer()
        this.loading = false
        this._setPlayerError('RestorePlayableUrlsFailed', err, ERROR_MESSAGES.NO_URL)
      })
  }

  /** 保存当前状态到 localStorage */
  save(): void {
    this._persistState()
    setStorage(STORAGE_KEYS.PLAYER_QUEUE, this.queue)
    setStorage(STORAGE_KEYS.PLAYER_TIME, this.currentTime)
  }

  /** 销毁，释放资源 */
  destroy(): void {
    this._unsubscribeWebDavProgress?.()
    this._clearLoadingTimer()
    if (this._advanceTimer) {
      clearTimeout(this._advanceTimer)
      this._advanceTimer = null
    }
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    if (this._timeUpdateFrame) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._timeUpdateFrame as number)
      else clearTimeout(this._timeUpdateFrame)
      this._timeUpdateFrame = null
    }
    destroyNativeMedia()
    engine.destroy()
  }
}

/** 全局单例 */
export const player = new PlayerState()

// ===== 历史记录 API 导出（保持向后兼容）=====
export { clearHistory } from '../player/history.ts'
