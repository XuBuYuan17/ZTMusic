/**
 * 播放器领域类型。纯状态/契约定义，不放实现。
 */
import type { Song } from './music.ts'
import type { CompactTrack } from '../player/queue.ts'
import type { AndroidPlaybackState } from '../player/android-state.ts'

export type PlayMode = 'list' | 'shuffle' | 'repeat'

/**
 * 音质档位，与 src/lib/utils/constants.ts 的 QUALITY_ORDER 一一对应。
 * 索引越小音质越好。
 */
export type QualityLevel = 'lossless' | 'exhigh' | 'higher' | 'standard'

/** AudioEngine.getState() 的快照形状 */
export interface PlayerEngineState {
  src: string
  currentTime: number
  duration: number
  ended: boolean
  networkState: number
  readyState: number
  paused: boolean
}

/** AudioEngine.getErrorState()：快照 + <audio> error 诊断信息 */
export interface PlayerEngineErrorState extends PlayerEngineState {
  event: Event
  code: number
  message: string
  codecSupport: {
    mp3: string
    aac: string
    mp4: string
    flac: string
  }
}

export type EngineTimeListener = (currentTime: number) => void
export type EngineStateListener = (state: PlayerEngineState) => void
export type EngineErrorListener = (state: PlayerEngineErrorState) => void
export type ListeningSignal = 'sample' | 'resume' | 'suspend' | 'reset' | 'source' | 'end'

/**
 * 播放引擎契约。当前唯一实现是基于双 HTMLAudioElement 的 AudioEngine
 * （当前元素 + 隐藏预加载元素 + swapToPreloaded）。未来若加 Native 后端，
 * 新增 NativePlayerEngine 实现本接口，不要替换 Web 引擎。
 */
export interface PlayerEngine {
  getState(): PlayerEngineState
  readonly native?: boolean
  connect?(): Promise<void>
  setQueue?(tracks: readonly CompactTrack[], index: number, play: boolean, options: { mode: PlayMode; quality: QualityLevel; position?: number }): Promise<void>
  onNativeState?(listener: (state: AndroidPlaybackState) => void): void
  setMode?(mode: PlayMode): void
  next?(): void
  previous?(): void
  load(url: string): void
  play(): Promise<void>
  pause(): void
  toggle(): Promise<void> | void
  seek(time: number): void
  setVolume(volume: number): void

  preload(url: string): void
  cancelPreload(): void
  swapToPreloaded(): boolean

  destroy(): void

  onTimeUpdate(listener: EngineTimeListener): void
  onEnded(listener: EngineStateListener): void
  onLoadStart(listener: EngineStateListener): void
  onCanPlay(listener: EngineStateListener): void
  onError(listener: EngineErrorListener): void
  onPlay(listener: EngineStateListener): void
  onPause(listener: EngineStateListener): void
  onListening(listener: (signal: ListeningSignal, state: PlayerEngineState) => void): void

  readonly currentTime: number
  readonly duration: number
  readonly paused: boolean
  readonly src: string
  readonly preloadedSrc: string
}

/**
 * 队列中的可播放曲目。当前就是中立 Song；
 * 本地 / WebDAV 曲目在后续阶段会扩展成 Song | LocalTrack 联合类型。
 */
export type PlayableTrack = Song
