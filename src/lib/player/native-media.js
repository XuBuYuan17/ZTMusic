/**
 * 原生媒体会话管理
 * - Android 通知栏（通过 Tauri Kotlin Plugin）
 * - 桌面系统媒体控件（Web Media Session API）
 *
 * 职责：仅处理原生平台媒体控件的双向同步，不涉及播放逻辑。
 */

import { PLAYBACK } from '../utils/constants.js'

let _tauriInvoke = null
let _nativeMediaPollTimer = null
let _lastNativeMeta = ''
let _lastNativePosition = 0

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

  if (!isTauriRuntime() || typeof window === 'undefined') return

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    _tauriInvoke = invoke
  } catch {
    // Tauri API not available
  }

  // Android: 监听通知栏按钮事件
  if (isTauriAndroid() && _tauriInvoke) {
    try {
      const { listen } = await import('@tauri-apps/api/event')
      await listen('media_button', (event) => {
        const action = event?.payload?.action
        if (action && _onMediaButton) {
          _onMediaButton(action)
        }
      }).catch(() => {})
    } catch {
      // listen not available
    }

    // 轮询兜底（某些 Android 版本事件可能丢失）
    _nativeMediaPollTimer = setInterval(() => {
      pollAndroidAction()
    }, PLAYBACK.NATIVE_POLL_INTERVAL)
  }
}

function handleMediaButtonAction(action) {
  if (_onMediaButton) {
    _onMediaButton(action)
  }
}

async function pollAndroidAction() {
  if (!_tauriInvoke) return
  try {
    const result = await _tauriInvoke('pollPendingAction')
    if (result?.action) handleMediaButtonAction(result.action)
  } catch {
    // poll failed
  }
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
  const metaKey = `${meta.title}|${meta.artist}|${meta.cover}|${dur}`

  if (isTauriAndroid() && _tauriInvoke) {
    if (metaKey !== _lastNativeMeta) {
      _lastNativeMeta = metaKey
      _tauriInvoke('updateMetadata', {
        title: meta.title || '',
        artist: meta.artist || '',
        coverUrl: meta.cover || '',
        duration: dur,
      }).catch(() => {})

      _lastNativePosition = pos
      _tauriInvoke('updatePlaybackState', {
        playing: !!state.playing,
        position: pos,
        duration: dur,
      }).catch(() => {})
    } else if (Math.abs(pos - _lastNativePosition) >= PLAYBACK.NATIVE_POSITION_THRESHOLD) {
      _lastNativePosition = pos
      _tauriInvoke('updatePlaybackState', {
        playing: !!state.playing,
        position: pos,
        duration: dur,
      }).catch(() => {})
    }
  }
  // 桌面端: navigator.mediaSession（Web Media Session API）由浏览器自动处理
}

/** 清理资源 */
export function destroyNativeMedia() {
  if (_nativeMediaPollTimer) {
    clearInterval(_nativeMediaPollTimer)
    _nativeMediaPollTimer = null
  }
  _tauriInvoke = null
}
