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
  restoreShuffleState,
  replaceQueueState,
  resolveQueueSelection,
  moveQueueItemState,
  removeQueueItemState,
  getNextIndex,
  getPrevIndex,
  commitNextIndex,
  commitPrevIndex,
} from '../player/queue.ts'
import type { CompactTrack, CompactTrackInput, QueueState } from '../player/queue.ts'
import { dbHistory } from '../db/history.ts'
import { beginListening, initializeListening, installListeningRecorder, observeListening } from '../services/listening-recorder.ts'
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
import type { AndroidPlaybackState } from '../player/android-state.ts'

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
  private _stopListening: (() => void) | undefined
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
  /** 用户队列修改的版本；原生状态回传不递增，推荐补歌据此识别普通点播。 */
  queueRevision = $state(0)

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
    this.shuffleState = restoreShuffleState(
      getStorageJson(STORAGE_KEYS.PLAYER_SHUFFLE, null),
      restoredQueue.queue.length,
      restoredQueue.queueIndex,
    )

    if (!engine.native) engine.setVolume(this.volume)
  }

  _setupEngineListeners(): void {
    engine.onNativeState?.((state: AndroidPlaybackState) => {
      const previousId = this.id
      this.queue = compactQueue(state.tracks)
      this.queueIndex = state.index
      const track = this.queue[state.index] || null
      this.currentTrack = track
      this.id = track?.id || 0
      this.title = track?.name || ''
      this.artist = track?.ar.map(artist => artist.name).join(' / ') || ''
      this.cover = normalizeImageUrl(track?.picUrl || track?.al.picUrl || '')
      this.duration = state.duration / 1000
      this.playing = state.playing
      this.loading = state.loading
      this.volume = state.volume
      this.mode = state.mode
      this._shouldAutoPlay = state.playing
      this._restoreSeeking = false
      this._clearLoadingTimer()
      this._persistState()
      if (track && track.id !== previousId) void dbHistory.add(track)
    })
    this._stopListening = installListeningRecorder(message => toast.warning(message))
    engine.onListening((signal, state) => observeListening(signal, state, this.currentTrack))
    engine.onTimeUpdate((t) => {
      this._scheduleProgressUpdate(t)
    })

    engine.onEnded((state: PlayerEngineState) => {
      this.playing = false
      if (!engine.native) this._handleEnded(state)
    })

    engine.onLoadStart(() => {
      this.loading = true
    })

    engine.onCanPlay((_state: PlayerEngineState) => {
      this.loading = false
      this._clearLoadingTimer()
      this.duration = engine.duration
      this.playing = this._shouldAutoPlay && !engine.paused
      // 音频真的能放了 → 之前记下的错误已经过期（加载超时 / 引擎瞬时错误）。
      // 必须 gate 在 _shouldAutoPlay 上：_setNoUrlError 会把它置 false，
      // 否则一次早先 load() 的迟到 canplay 会抹掉真正的「暂无可用音源」
      if (this._shouldAutoPlay) this._clearError()
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
      if (!engine.native) this._fallbackNext('EngineErrorNoFallback')
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
    debugLog('player', 'error', snapshot)
    // silent = 后台失败（补链等），歌还在正常放，只留日志不上屏。
    // 以前只挡 toast 却照样写 this.error，而 PlayerBar 把它当艺术家名渲染 → 整首歌挂着「播放失败」
    if (extra?.silent) return
    this.error = userMessage || ERROR_MESSAGES.PLAY_FAILED
    toast.error(this.error)
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
    this.queueRevision++
    this.queue = state.queue
    this.queueIndex = state.queueIndex
    this.shuffleState = state.shuffleState || createShuffleState()
    engine.cancelPreload()
    if (engine.setQueue) void engine.setQueue(this.queue, this.queueIndex, false, { mode: this.mode, quality: this.preferredLevel }).catch(error => this._setPlayerError('NativeQueue', error))
    if (clearStorage) {
      removeStorage(STORAGE_KEYS.PLAYER_QUEUE)
      removeStorage(STORAGE_KEYS.PLAYER_QI)
      removeStorage(STORAGE_KEYS.PLAYER_SHUFFLE)
      return
    }
    setStorage(STORAGE_KEYS.PLAYER_QUEUE, this.queue)
    setStorage(STORAGE_KEYS.PLAYER_QI, this.queueIndex)
    setStorage(STORAGE_KEYS.PLAYER_SHUFFLE, this.shuffleState)
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

    // 直接从搜索、消息等入口播放的歌曲不一定属于现有队列。旧逻辑只改 queueIndex，
    // 会让“正在播放”与待播清单脱节；随机模式下也同时校准历史游标。
    const selection = resolveQueueSelection(this.queue, this.shuffleState, playableTrack, index, this.mode)
    if (selection.state) this._commitQueueState(selection.state)
    index = selection.index

    // 中止上次未完成的播放请求
    abortAllRequests()
    this._abortController.abort()
    this._abortController = new AbortController()
    const signal = this._abortController.signal

    // 取消挂起的自动切歌与预加载，避免与本次手动/自动切歌产生竞态（放错歌）
    this._advanceLock = false
    engine.cancelPreload()

    const requestId = ++this._playRequestId
    if (!engine.native) {
      observeListening('suspend', engine.getState(), this.currentTrack)
      beginListening(playableTrack)
    }
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
    void initializeListening().catch(() => {}).then(() => dbHistory.add(playableTrack))
    this._syncTimedMedia(this.currentTime, { force: true })

    if (engine.setQueue) {
      void engine.setQueue(this.queue, this.queueIndex, true, { mode: this.mode, quality: this.preferredLevel })
        .catch(error => { this.loading = false; this._clearLoadingTimer(); this._setPlayerError('NativePlayback', error) })
      return
    }

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
          // 试听片段：只弹一次 toast（仍播放试听）。这是「一次性告知」，
          // 不该写进 player.error —— 那会顶掉 LCD 的歌手名并常驻整首歌
          if (isTrial && this._authProvider.isLoggedIn()) {
            const trialMessage = getTrialPlaybackMessage({ isLoggedIn: this._authProvider.isLoggedIn(), vipInfo: this._authProvider.getVipInfo(), isVip: this._authProvider.isVip() })
            debugLog('player', 'trial-url', { trackId: this.id, title: this.title, message: trialMessage })
            toast.warning(trialMessage)
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
      // 只有当前这次填充能清自己的标记：切歌 / 切音质会立刻起新一次填充，
      // 旧的这次若晚一步收尾，会把新填充刚设上的 pending 抹掉，
      // 于是 _fallbackNext 走 exhausted 分支误报「暂无可用音源」
      if (reqId === this._playRequestId) this._fallback.setFillPending(false)
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
    if (engine.next) { engine.next(); return }
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
    if (this.mode === 'shuffle') setStorage(STORAGE_KEYS.PLAYER_SHUFFLE, this.shuffleState)
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
    if (engine.previous) { engine.previous(); return }
    abortAllRequests()
    engine.cancelPreload()
    if (this.queue.length === 0) return

    if (this._advanceLock) {
      this._advanceLock = false
    }

    const idx = getPrevIndex({
      currentIndex: this.queueIndex,
      queueLength: this.queue.length,
      mode: this.mode,
      shuffleState: this.shuffleState,
    })

    const track = this.queue[idx]
    if (track) {
      commitPrevIndex({ mode: this.mode, shuffleState: this.shuffleState })
      if (this.mode === 'shuffle') setStorage(STORAGE_KEYS.PLAYER_SHUFFLE, this.shuffleState)
      this.playTrack(track, idx)
    }
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
    if (m === 'shuffle' && this.shuffleState.order.length > 0) {
      const position = this.shuffleState.position
      if (position < 0 || this.shuffleState.order[position] !== this.queueIndex) {
        this.shuffleState = createShuffleState()
        setStorage(STORAGE_KEYS.PLAYER_SHUFFLE, this.shuffleState)
      }
    }
    this.mode = setSetting(STORAGE_KEYS.MODE, m) as PlayMode
    engine.setMode?.(this.mode)
  }

  /**
   * 设置偏好音质。正在播的歌会立刻按新档位重取 URL，播放进度不丢。
   *
   * ponytail: 只保证「正在播的这首」立刻换档，且会把新档位的 URL 写回它的缓存。
   * 其他歌若已进过 dbCache，仍会按首次缓存时的档位播放 —— 缓存只按 song_id 存 URL、
   * 不记档位（db/cache.ts 的 song_urls 表，一首歌一个槽）。要彻底修得给缓存行加 level 列
   * 并处理 SQLite / IndexedDB / localStorage 三条路径的迁移，等真有人抱怨再动。
   */
  setPreferredLevel(level: string): void {
    if (!QUALITY_ORDER.includes(level)) return
    const changed = this.preferredLevel !== level
    this.preferredLevel = setSetting(STORAGE_KEYS.PREFERRED_QUALITY, level) as QualityLevel
    if (changed) void this._reloadCurrentAtPreferredLevel()
  }

  /**
   * 按当前偏好音质重取正在播的这首歌。
   *
   * 旧档位的音频继续放着，等新 URL 到手才切——所以听感上不会有静音空档。
   * 失败就静默留在旧 URL 上，不报错：用户只是换了个偏好，歌还在正常播。
   */
  async _reloadCurrentAtPreferredLevel(): Promise<void> {
    if (engine.setQueue) {
      await engine.setQueue(this.queue, this.queueIndex, this.playing, { mode: this.mode, quality: this.preferredLevel, position: this.currentTime })
      return
    }
    const track = this.currentTrack
    // 本地 / WebDAV 曲目没有音质档位
    if (!this.id || !track || track.source === 'local' || track.source === 'webdav') return
    // 音频还在加载中就别插手：下面那句 ++_playRequestId 会让 playTrack 的 .then 直接
    // return，而这边又不调 engine.play()（那时 playing 还是 false），歌就卡在加载态
    // 直到 15 秒超时。偏好已经存下了，这首歌保持原档位，下一首自然按新档位解析
    if (this.loading) return

    const id = this.id
    const position = this.currentTime
    // 顶掉上一次解析：正在跑的 fillFallback / prefetchNext 都是按旧档位发起的
    const requestId = ++this._playRequestId
    const signal = this._abortController.signal

    try {
      const { urls } = await getPlayableUrls(
        id,
        this.preferredLevel,
        this._prefetchCache,
        requestId,
        { isLoggedIn: this._authProvider.isLoggedIn(), checkLoginStatus: () => this._authProvider.checkLoginStatus() },
        signal,
        true,
      )
      if (requestId !== this._playRequestId || urls.length === 0) return

      this._firstUrlLevel = 'quality-switch'
      this._fallback.updateUrls(urls)
      this._prefetchNextTrack(requestId)

      const first = this._fallback.next()
      if (first.status !== 'playing') return
      // 新档位拿到的还是同一个 URL（该档位不可用，解析回落了）→ 不打断当前播放
      if (first.url === engine.src) return

      // 到这里才读播放态：解析期间用户可能已经按了暂停，不该再把歌拉起来
      const wasPlaying = this.playing
      this.loading = true
      this._clearError()
      // 切 URL 会丢掉进度，交给 onCanPlay 里的 seek 恢复（与 _fallbackNext 同一套机制）
      if (position > 0) this._restoreSeeking = true
      engine.load(first.url)
      if (wasPlaying) {
        engine.play().catch((err) => {
          if (requestId !== this._playRequestId) return
          this._setPlayerError('QualitySwitchPlayFailed', err, ERROR_MESSAGES.PLAY_FAILED)
          this._fallbackNext('QualitySwitchNoUrl')
        })
      }
      void this._fillFallbackInBackground(id, requestId, signal)
    } catch {
      // 静默：换档失败不该打断正在播的旧档位
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
    if (engine.connect) {
      void engine.connect().catch(error => this._setPlayerError('NativeConnect', error))
      return
    }
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
    this.shuffleState = restoreShuffleState(
      getStorageJson(STORAGE_KEYS.PLAYER_SHUFFLE, null),
      savedQueue.length,
      idx,
    )
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
    setStorage(STORAGE_KEYS.PLAYER_SHUFFLE, this.shuffleState)
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
    this._stopListening?.()
  }
}

/** 全局单例 */
export const player = new PlayerState()

// ===== 历史记录 API 导出（保持向后兼容）=====
export { clearHistory } from '../player/history.ts'
