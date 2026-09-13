/**
 * 原生媒体会话管理
 * - Linux 桌面 MPRIS（通过 Tauri Rust 后端）
 * - Windows 桌面 SMTC（通过 Tauri Rust 后端）
 * - Web/macOS 系统媒体控件（Web Media Session API，由 PlayerState 直接维护）
 *
 * 职责：仅处理原生平台媒体控件的双向同步，不涉及播放逻辑。
 */

import { PLAYBACK } from '../utils/constants.ts'
import { debugLog, swallowError } from '../utils/error.ts'
import { selectMediaBackend } from './native-media-platform.ts'
import { isTauriRuntime, runtimePlatform } from '../utils/runtime.ts'

interface NativeMetadata {
  title?: string
  artist?: string
  cover?: string
  duration?: number
}

interface NativePlaybackState {
  playing?: boolean
  position?: number
  duration?: number
}

interface InitNativeMediaOptions {
  getMetadata?: () => NativeMetadata
  getPlaybackState?: () => NativePlaybackState
  onMediaButton?: (action: string) => void
}

interface PendingSyncPayload {
  metaChanged: boolean
  playing: boolean
  position: number
  duration: number
  meta: NativeMetadata
}

type InvokeFn = (command: string, payload?: unknown) => Promise<unknown>

let _tauriInvoke: InvokeFn | null = null
let _nativeMediaPollTimer: ReturnType<typeof setInterval> | null = null
let _lastNativeMeta = ''
let _lastNativePosition = 0
let _lastNativePlaying: boolean | null = null
// 外部回调：由 PlayerState 注入
let _getMetadata: () => NativeMetadata = () => ({})
let _getPlaybackState: () => NativePlaybackState = () => ({})
let _onMediaButton: ((action: string) => void) | null = null

function isTauriLinux(): boolean {
  return isTauriRuntime() && /Linux/i.test(runtimePlatform())
}

function isTauriWindows(): boolean {
  return isTauriRuntime() && /Win/i.test(runtimePlatform())
}

function shouldUseNativeBridge(): boolean {
  return selectMediaBackend(isTauriRuntime(), runtimePlatform()) === 'native'
}

export function shouldUseWebMediaSession(): boolean {
  return selectMediaBackend(isTauriRuntime(), runtimePlatform()) === 'web'
}

function invokeNative(command: string, payload: unknown, context?: string): Promise<unknown> {
  if (!_tauriInvoke) return Promise.resolve(null)
  return _tauriInvoke(command, payload).catch((err: unknown) => {
    swallowError(`NativeMedia.${context || command}`, err)
    return null
  })
}

/**
 * 初始化原生媒体会话
 */
export async function initNativeMedia(options: InitNativeMediaOptions = {}): Promise<void> {
  _getMetadata = options.getMetadata || _getMetadata
  _getPlaybackState = options.getPlaybackState || _getPlaybackState
  _onMediaButton = options.onMediaButton || _onMediaButton

  debugLog('native-media', 'init', { runtime: isTauriRuntime(), linux: isTauriLinux(), windows: isTauriWindows() })
  if (!isTauriRuntime() || typeof window === 'undefined') return

  try {
    const mod = await import('@tauri-apps/api/core') as { invoke: InvokeFn }
    _tauriInvoke = mod.invoke
  } catch (err) {
    swallowError('NativeMedia.importInvoke', err)
  }

  // Linux 和 Windows 都由原生桥接收系统媒体键，避免 WebView2 重复注册媒体会话。
  if (shouldUseNativeBridge() && _tauriInvoke && !_nativeMediaPollTimer) {
    const interval = PLAYBACK.NATIVE_POLL_INTERVAL
    _nativeMediaPollTimer = setInterval(() => {
      pollNativeAction()
    }, interval)
    debugLog('native-media', 'poll-started', { interval })
  }
}

function handleMediaButtonAction(action: string): void {
  debugLog('native-media', 'button-action', { action })
  if (_onMediaButton) {
    _onMediaButton(action)
  }
}

async function pollNativeAction(): Promise<void> {
  if (!_tauriInvoke) return
  const result = await invokeNative('pollPendingAction', undefined, 'pollPendingAction') as { action?: string } | null
  if (result?.action) handleMediaButtonAction(result.action)
}

/**
 * 同步播放状态到原生平台
 * 由 PlayerState 在 timeupdate / 切歌时调用
 */
let _pendingSyncTimer: ReturnType<typeof setTimeout> | null = null
let _pendingSyncPayload: PendingSyncPayload | null = null

export function syncNativeMedia(): void {
  if (!isTauriRuntime()) return

  const meta = _getMetadata()
  const state = _getPlaybackState()
  const dur = state.duration || 0
  const pos = state.position || 0
  const playing = !!state.playing
  const metaKey = `${meta.title}|${meta.artist}|${meta.cover}|${dur}`

  if (!shouldUseNativeBridge() || !_tauriInvoke) return

  const metaChanged = metaKey !== _lastNativeMeta
  const stateChanged = playing !== _lastNativePlaying ||
    Math.abs(pos - _lastNativePosition) >= PLAYBACK.NATIVE_POSITION_THRESHOLD

  if (metaChanged || stateChanged) {
    _pendingSyncPayload = { metaChanged, playing, position: pos, duration: dur, meta }
    if (metaChanged) {
      // 元数据变化立即同步
      _doSyncNative()
    } else if (!_pendingSyncTimer) {
      // 播放状态变化防抖 500ms
      _pendingSyncTimer = setTimeout(() => _doSyncNative(), 500)
    }
  }
  // Web/macOS: navigator.mediaSession（Web Media Session API）由 PlayerState 直接处理。
}

function _doSyncNative(): void {
  if (_pendingSyncTimer) {
    clearTimeout(_pendingSyncTimer)
    _pendingSyncTimer = null
  }
  const payload = _pendingSyncPayload
  if (!payload) return
  const { metaChanged, playing, position, duration, meta } = payload

  if (metaChanged) {
    _lastNativeMeta = `${meta.title}|${meta.artist}|${meta.cover}|${duration}`
    debugLog('native-media', 'metadata', { title: meta.title, artist: meta.artist, duration: duration })
    invokeNative('updateMetadata', {
      title: meta.title || '',
      artist: meta.artist || '',
      coverUrl: meta.cover || '',
      duration,
    }, 'updateMetadata')
  }
  _lastNativePosition = position
  _lastNativePlaying = playing
  invokeNative('updatePlaybackState', { playing, position, duration }, 'updatePlaybackState')
  _pendingSyncPayload = null
}

/** 清理资源 */
export function destroyNativeMedia(): void {
  if (_nativeMediaPollTimer) {
    clearInterval(_nativeMediaPollTimer)
    _nativeMediaPollTimer = null
  }
  if (_pendingSyncTimer) {
    clearTimeout(_pendingSyncTimer)
    _pendingSyncTimer = null
  }
  _pendingSyncPayload = null
  _tauriInvoke = null
  _lastNativeMeta = ''
  _lastNativePosition = 0
  _lastNativePlaying = null
  debugLog('native-media', 'destroy')
}
