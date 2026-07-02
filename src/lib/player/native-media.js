/**
 * 原生媒体会话管理
 * - Android 通知栏（通过 Tauri Kotlin Plugin）
 * - Linux 桌面 MPRIS（通过 Tauri Rust 后端）
 * - Windows/macOS 桌面系统媒体控件（Web Media Session API，由 PlayerState 直接维护）
 *
 * 职责：仅处理原生平台媒体控件的双向同步，不涉及播放逻辑。
 */

import { PLAYBACK } from '../utils/constants.js'
import { debugLog, swallowError } from '../utils/error.js'

let _tauriInvoke = null
let _nativeMediaPollTimer = null
let _lastNativeMeta = ''
let _lastNativePosition = 0
let _lastNativePlaying = null
// 外部回调：由 PlayerState 注入
let _getMetadata = () => ({})
let _getPlaybackState = () => ({})
let _onMediaButton = null

function isTauriRuntime() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

function isTauriAndroid() {
  return isTauriRuntime() && /Android/i.test(navigator.userAgent)
}

function isTauriLinux() {
  if (!isTauriRuntime()) return false
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent
  return /Linux/i.test(platform) && !/Android/i.test(navigator.userAgent)
}

function isTauriWindows() {
  if (!isTauriRuntime()) return false
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent
  return /Win/i.test(platform)
}

function shouldUseNativeBridge() {
  return isTauriAndroid() || isTauriLinux()
}

function invokeNative(command, payload, context) {
  if (!_tauriInvoke) return Promise.resolve(null)
  return _tauriInvoke(command, payload).catch((err) => {
    swallowError(`NativeMedia.${context || command}`, err)
    return null
  })
}

/**
 * 初始化原生媒体会话
 * @param {object} options
 * @param {Function} options.getMetadata - () => ({ title, artist, cover, duration })
 * @param {Function} options.getPlaybackState - () => ({ playing, position, duration })
 * @param {Function} options.onMediaButton - (action) => void
 */
export async function initNativeMedia(options = {}) {
  _getMetadata = options.getMetadata || _getMetadata
  _getPlaybackState = options.getPlaybackState || _getPlaybackState
  _onMediaButton = options.onMediaButton || _onMediaButton

  debugLog('native-media', 'init', { runtime: isTauriRuntime(), android: isTauriAndroid(), linux: isTauriLinux(), windows: isTauriWindows() })
  if (!isTauriRuntime() || typeof window === 'undefined') return

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    _tauriInvoke = invoke
  } catch (err) {
    swallowError('NativeMedia.importInvoke', err)
  }

  // Android: 监听通知栏按钮事件
  if (isTauriAndroid() && _tauriInvoke) {
    try {
      const { listen } = await import('@tauri-apps/api/event')
      await listen('media_button', (event) => {
        const action = event?.payload?.action
        debugLog('native-media', 'event-action', { action })
        if (action && _onMediaButton) {
          _onMediaButton(action)
        }
      })
    } catch (err) {
      swallowError('NativeMedia.listen', err)
    }
  }

  // Android 轮询作为通知栏按钮兜底；Linux 轮询 MPRIS 媒体键回调。
  // Windows/macOS 使用 Web Media Session API，不走 Tauri 原生桥，避免双注册媒体会话。
  if (shouldUseNativeBridge() && _tauriInvoke && !_nativeMediaPollTimer) {
    _nativeMediaPollTimer = setInterval(() => {
      pollNativeAction()
    }, PLAYBACK.NATIVE_POLL_INTERVAL)
    debugLog('native-media', 'poll-started', { interval: PLAYBACK.NATIVE_POLL_INTERVAL })
  }
}

function handleMediaButtonAction(action) {
  debugLog('native-media', 'button-action', { action })
  if (_onMediaButton) {
    _onMediaButton(action)
  }
}

async function pollNativeAction() {
  if (!_tauriInvoke) return
  const result = await invokeNative('pollPendingAction', undefined, 'pollPendingAction')
  if (result?.action) handleMediaButtonAction(result.action)
}

/**
 * 同步播放状态到原生平台
 * 由 PlayerState 在 timeupdate / 切歌时调用
 */
export function syncNativeMedia() {
  if (!isTauriRuntime()) return

  const meta = _getMetadata()
  const state = _getPlaybackState()
  const dur = state.duration || 0
  const pos = state.position || 0
  const playing = !!state.playing
  const metaKey = `${meta.title}|${meta.artist}|${meta.cover}|${dur}`

  if (shouldUseNativeBridge() && _tauriInvoke) {
    if (metaKey !== _lastNativeMeta) {
      _lastNativeMeta = metaKey
      debugLog('native-media', 'metadata', { title: meta.title, artist: meta.artist, duration: dur })
      invokeNative('updateMetadata', {
        title: meta.title || '',
        artist: meta.artist || '',
        coverUrl: meta.cover || '',
        duration: dur,
      }, 'updateMetadata')

      _lastNativePosition = pos
      _lastNativePlaying = playing
      invokeNative('updatePlaybackState', {
        playing,
        position: pos,
        duration: dur,
      }, 'updatePlaybackState')
    } else if (
      playing !== _lastNativePlaying ||
      Math.abs(pos - _lastNativePosition) >= PLAYBACK.NATIVE_POSITION_THRESHOLD
    ) {
      _lastNativePosition = pos
      _lastNativePlaying = playing
      invokeNative('updatePlaybackState', {
        playing,
        position: pos,
        duration: dur,
      }, 'updatePlaybackState')
    }
  }
  // Windows/macOS: navigator.mediaSession（Web Media Session API）由 PlayerState 直接处理。
}

/** 清理资源 */
export function destroyNativeMedia() {
  if (_nativeMediaPollTimer) {
    clearInterval(_nativeMediaPollTimer)
    _nativeMediaPollTimer = null
  }
  _tauriInvoke = null
  _lastNativeMeta = ''
  _lastNativePosition = 0
  _lastNativePlaying = null
  debugLog('native-media', 'destroy')
}
