import { engine } from '../player/engine.js'
import { ncm } from '../api/client.js'
import { getStorage, getStorageJson, removeStorage, setStorage } from '../utils/storage.js'
import { coverUrl, normalizeImageUrl } from '../utils/image.js'

// ===== 原生媒体会话（Android 通知栏 + 桌面系统媒体控件） =====
let _tauriInvoke = null
let _nativeMediaPollTimer = null
let _lastNativeMeta = ''
let _lastNativePosition = 0

function isTauriRuntime() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

function isTauriAndroid() {
  return isTauriRuntime() && /Android/i.test(navigator.userAgent)
}

async function initNativeMedia() {
  if (!isTauriRuntime() || typeof window === 'undefined') return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    _tauriInvoke = invoke
  } catch {}

  // Android: 轮询通知栏按钮事件
  if (isTauriAndroid() && _tauriInvoke) {
    try {
      const { listen } = await import('@tauri-apps/api/event')
      await listen('media_button', (event) => {
        const action = event?.payload?.action
        handleMediaButtonAction(action)
      }).catch(() => {})
    } catch {}
    // 轮询兜底
    _nativeMediaPollTimer = setInterval(() => {
      pollAndroidAction()
    }, 500)
  }
}

function handleMediaButtonAction(action) {
  if (action === 'play') { engine.play().catch(() => {}) }
  else if (action === 'pause') { engine.pause() }
  else if (action === 'next') { next() }
  else if (action === 'prev') { prev() }
}

async function pollAndroidAction() {
  if (!_tauriInvoke) return
  try {
    const result = await _tauriInvoke('pollPendingAction')
    if (result?.action) handleMediaButtonAction(result.action)
  } catch {}
}

function syncNativeMedia() {
  if (!isTauriRuntime()) return

  const dur = _duration > 0 ? _duration / 1000 : 0
  const pos = _currentTime || 0
  const metaKey = `${_title}|${_artist}|${_cover}|${dur}`

  if (isTauriAndroid() && _tauriInvoke) {
    // Android: invoke → Kotlin Plugin
    if (metaKey !== _lastNativeMeta) {
      _lastNativeMeta = metaKey
      _tauriInvoke('updateMetadata', {
        title: _title || '',
        artist: _artist || '',
        coverUrl: _cover || '',
        duration: dur,
      }).catch(() => {})
      // 元数据变化时同步一次位置
      _lastNativePosition = pos
      _tauriInvoke('updatePlaybackState', {
        playing: !!_playing,
        position: pos,
        duration: dur,
      }).catch(() => {})
    } else if (Math.abs(pos - _lastNativePosition) >= 5) {
      // 进度变化超过 5 秒再同步，降低 invoke 频率
      _lastNativePosition = pos
      _tauriInvoke('updatePlaybackState', {
        playing: !!_playing,
        position: pos,
        duration: dur,
      }).catch(() => {})
    }
  }
  // 桌面端: 由 navigator.mediaSession（Web Media Session API）自动处理
}
// ===== 原生媒体会话结束 =====

function getLS(key, def) {
  return getStorage(key, def)
}
function saveLS(key, val) {
  setStorage(key, val)
}
function getLSJson(key, def) {
  return getStorageJson(key, def)
}

let _id = $state(parseInt(getLS('player_id', '0')) || 0)
let _title = $state(getLS('player_title', ''))
let _artist = $state(getLS('player_artist', ''))
let _cover = $state(getLS('player_cover', ''))
let _duration = $state(parseInt(getLS('player_duration', '0')) || 0)
let _currentTrack = $state(null)
let _currentTime = $state(parseFloat(getLS('player_time', '0')))
let _playing = $state(false)
let _loading = $state(false)
let _error = $state('')
const initialVolume = parseFloat(getLS('volume', '0.8'))
let _volume = $state(initialVolume)
let _mode = $state(getLS('mode', 'list'))
let _preferredLevel = $state(getLS('preferred_quality', 'lossless'))
let _queue = $state(getLSJson('player_queue', []))
let _queueIndex = $state(parseInt(getLS('player_qi', '-1')))

let _restoreSeeking = false
let _shouldAutoPlay = false
let _saveTimer = null
let _playRequestId = 0
let _playUrls = []
let _playUrlIndex = 0
let _advanceLock = false
let _prefetchCache = new Map()
const PLAY_LEVELS = ['lossless', 'exhigh', 'higher', 'standard']
const FAST_PLAY_TIMEOUT = 3500
const FALLBACK_PLAY_TIMEOUT = 5000
const MAX_QUEUE_SIZE = 500
const SHOULD_LOG_PLAY_URLS = typeof import.meta !== 'undefined' && import.meta.env?.DEV

let _mediaSessionInited = false

function shouldDebugPlayback() {
  return SHOULD_LOG_PLAY_URLS || (typeof localStorage !== 'undefined' && localStorage.getItem('debug_playback') === 'true')
}

function logPlayUrlAttempt(type, payload) {
  if (!shouldDebugPlayback() || typeof console === 'undefined') return
  console.debug(`[play-url:${type}]`, payload)
}

function logPlayback(type, payload = {}) {
  if (!shouldDebugPlayback() || typeof console === 'undefined') return
  console.debug(`[playback:${type}]`, payload)
}

function initMediaSession() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  if (_mediaSessionInited) return
  _mediaSessionInited = true

  const setPlaybackState = (state) => {
    try { navigator.mediaSession.playbackState = state } catch {}
  }

  engine.onPlay(() => setPlaybackState('playing'))
  engine.onPause(() => setPlaybackState('paused'))

  navigator.mediaSession.setActionHandler('play', () => { engine.play() })
  navigator.mediaSession.setActionHandler('pause', () => { engine.pause() })
  navigator.mediaSession.setActionHandler('nexttrack', () => next())
  navigator.mediaSession.setActionHandler('previoustrack', () => prev())

  // 初始化原生媒体会话（Tauri 桌面 + Android 通知栏）
  initNativeMedia()
}

function compactArtist(artist) {
  if (!artist) return null
  return {
    id: artist.id,
    name: artist.name || '',
  }
}

function compactTrack(track) {
  if (!track) return null
  const album = track.al || track.album || {}
  const picUrl = normalizeImageUrl(album.picUrl || album.blurPicUrl || track.coverImgUrl || track.picUrl || '')
  return {
    id: track.id,
    name: track.name || '',
    ar: (track.ar || track.artists || []).map(compactArtist).filter(Boolean),
    al: {
      id: album.id,
      name: album.name || '',
      picUrl,
    },
    dt: track.dt || track.duration || 0,
    picUrl,
  }
}

function compactQueue(tracks) {
  return (Array.isArray(tracks) ? tracks : []).slice(0, MAX_QUEUE_SIZE).map(compactTrack).filter(Boolean)
}

engine.onTimeUpdate((t) => {
  _currentTime = t
  // 每 3 秒保存一次播放进度，避免频繁写入
  if (_saveTimer) return
  _saveTimer = setTimeout(() => { saveLS('player_time', t); _saveTimer = null }, 3000)
  // 每 3 秒同步原生媒体位置
  syncNativeMedia()
})
engine.onEnded((state) => { handleEnded(state) })
engine.onLoadStart((state) => { _loading = true; logPlayback('loadstart', state) })
engine.onCanPlay((state) => {
  _loading = false
  _duration = engine.duration
  _playing = _shouldAutoPlay && !engine.paused
  logPlayback('canplay', state)
  // 恢复播放时跳转到上次进度
  if (_restoreSeeking && _currentTime > 0) {
    engine.seek(_currentTime)
    _restoreSeeking = false
  }
  syncNativeMedia()
})
engine.onError((state) => {
  logPlayback('error', state)
  if (tryNextPlayUrl()) return
  _loading = false
  _playing = false
  _shouldAutoPlay = false
  _error = '当前歌曲暂无可用音源'
})
engine.setVolume(initialVolume)

// 初始化原生媒体会话（模块加载时，不阻塞）
initNativeMedia()

function handleEnded(state) {
  logPlayback('ended', { ...state, queueLength: _queue.length, queueIndex: _queueIndex })
  if (_advanceLock || _queue.length === 0) return
  _advanceLock = true
  _shouldAutoPlay = true
  setTimeout(() => {
    try {
      next()
    } finally {
      _advanceLock = false
    }
  }, 80)
}

function persistState() {
  saveLS('player_id', _id)
  saveLS('player_title', _title)
  saveLS('player_artist', _artist)
  saveLS('player_cover', _cover)
  saveLS('player_duration', _duration)
  saveLS('player_qi', _queueIndex)
}

async function getPlayableUrls(id) {
  // 检查预取缓存
  const cached = _prefetchCache.get(id)
  if (cached) {
    _prefetchCache.delete(id)
    logPlayback('prefetch-hit', { id, urls: cached })
    return cached
  }

  const fallbackUrl = `https://music.163.com/song/media/outer/url?id=${id}.mp3`
  const urls = []
  const trialUrls = []
  const reqId = _playRequestId

  // Phase 1: 快速出声 — 优先完整版 URL，找不到才收集试听片段
  const fastTiers = uniqueLevels(['standard', 'higher', _preferredLevel])
  for (const level of fastTiers) {
    const result = await fetchSongUrl(id, level, false, FAST_PLAY_TIMEOUT)
    if (!result) continue
    if (result.isTrial) {
      addUrl(trialUrls, result.url)
    } else {
      addUrl(urls, result.url)
      break
    }
  }

  // 降级尝试带 unblock 的版本
  if (urls.length === 0) {
    for (const level of fastTiers) {
      const result = await fetchSongUrl(id, level, true, FAST_PLAY_TIMEOUT)
      if (!result) continue
      if (result.isTrial) {
        addUrl(trialUrls, result.url)
      } else {
        addUrl(urls, result.url)
        break
      }
    }
  }

  // 没有完整版时 fallback 试听片段
  if (urls.length === 0 && trialUrls.length > 0) {
    urls.push(...trialUrls)
  }

  // 兜底
  if (urls.length === 0) addUrl(urls, fallbackUrl)

  // Phase 2: 后台获取偏好音质并补全 fallback 链
  // 不 await — 让播放先开始
  fillFallbackUrls(id, reqId)

  return urls
}

async function fillFallbackUrls(id, reqId) {
  const allLevels = orderedPlayLevels()
  let upgraded = false

  // Step 1: 优先获取用户偏好的音质，作为主播放 URL
  for (const level of allLevels) {
    if (_playRequestId !== reqId) return
    const result = await fetchSongUrl(id, level, false, FALLBACK_PLAY_TIMEOUT)
    if (!result || _playUrls.includes(result.url)) continue

    if (!upgraded && _playUrls.length > 0) {
      // 升级到偏好音质：插入到 _playUrls[0] 并切换播放
      _playUrls.unshift(result.url)
      _playUrlIndex = 0
      upgraded = true
      logPlayback('quality-upgrade', { level, url: result.url })
      if (_playing && _playRequestId === reqId && !engine.paused) {
        const savedTime = engine.currentTime
        _currentTime = savedTime
        _restoreSeeking = savedTime > 0
        engine.load(result.url)
        engine.play().catch(() => {
          if (_playRequestId !== reqId) return
          // 升级失败：移除刚插入的 URL，并继续 fallback
          const badIdx = _playUrls.indexOf(result.url)
          if (badIdx >= 0) _playUrls.splice(badIdx, 1)
          _playUrlIndex = 0
          tryNextPlayUrl()
        })
      }
    } else {
      _playUrls.push(result.url)
    }
  }

  // Step 2: 获取带 unblock 的版本
  for (const level of allLevels) {
    if (_playRequestId !== reqId) return
    const result = await fetchSongUrl(id, level, true, FALLBACK_PLAY_TIMEOUT)
    if (result && !_playUrls.includes(result.url)) _playUrls.push(result.url)
  }

  // Step 3: 补充网易官方 fallback
  const fbUrl = normalizePlayUrl(`https://music.163.com/song/media/outer/url?id=${id}.mp3`)
  if (_playRequestId === reqId && fbUrl && !_playUrls.includes(fbUrl)) {
    _playUrls.push(fbUrl)
  }

  // Step 4: 最终兜底 — 使用 UnblockNeteaseMusic 直接解灰
  if (_playRequestId === reqId && _playUrls.length <= 1) {
    try {
      const matchRes = await ncm.songUrlMatch(id)
      const matchUrl = matchRes?.data?.[0]?.url || matchRes?.data?.url || matchRes?.url || ''
      if (matchUrl) {
        const normalized = normalizePlayUrl(matchUrl)
        if (normalized && !_playUrls.includes(normalized)) {
          _playUrls.push(normalized)
          logPlayback('unblock-fallback', { url: normalized })
        }
      }
    } catch {}
  }

  logPlayback('fallback-urls-filled', { totalUrls: _playUrls.length, id, upgraded })

  // Step 5: 后台预取下一首歌的 URL（批量预取）
  if (_playRequestId === reqId && _queue.length > 1 && _queueIndex >= 0) {
    prefetchNextTrackUrl(reqId)
  }
}

/** 后台预取下一首歌的 URL，切歌时零等待 */
async function prefetchNextTrackUrl(reqId) {
  if (_queue.length < 2 || _queueIndex < 0) return
  const nextIdx = (_queueIndex + 1) % _queue.length
  if (nextIdx === _queueIndex) return
  const nextTrack = _queue[nextIdx]
  if (!nextTrack?.id || _prefetchCache.has(nextTrack.id)) return

  // 限制预取缓存大小，防止内存泄漏
  if (_prefetchCache.size >= 10) {
    const firstKey = _prefetchCache.keys().next().value
    _prefetchCache.delete(firstKey)
  }

  // 先尝试 standard（最快），再尝试用户偏好的音质
  const tiers = uniqueLevels(['standard', 'higher', _preferredLevel])
  for (const level of tiers) {
    if (_playRequestId !== reqId) return
    const url = await fetchSongUrl(nextTrack.id, level, false, FAST_PLAY_TIMEOUT)
    if (url) {
      _prefetchCache.set(nextTrack.id, [url])
      logPlayback('prefetch-cached', { id: nextTrack.id, level, url })
      return
    }
  }
}

function orderedPlayLevels() {
  const levels = [...PLAY_LEVELS]
  const prefIdx = levels.indexOf(_preferredLevel)
  if (prefIdx > 0) { levels.splice(prefIdx, 1); levels.unshift(_preferredLevel) }
  return levels
}

function uniqueLevels(levels) {
  return [...new Set(levels.filter(Boolean))]
}

function addUrl(urls, urlOrObj) {
  if (!urlOrObj) return
  const playableUrl = typeof urlOrObj === 'string' ? urlOrObj : urlOrObj.url
  if (playableUrl && !urls.includes(playableUrl)) urls.push(playableUrl)
}

function normalizePlayUrl(url) {
  if (!url || typeof url !== 'string') return ''
  return url.trim().replace(/^http:\/\/([^/?#]+\.music\.126\.net)([/?#]|$)/i, 'https://$1$2')
}

function withTimeout(promise, timeout) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('play url timeout')), timeout)),
  ])
}

async function fetchSongUrl(id, level, unblock, timeout) {
  try {
    const res = await withTimeout(ncm.songUrl(id, level, unblock), timeout)
    const item = res?.data?.[0]
    logPlayUrlAttempt('result', {
      id,
      level,
      unblock,
      code: item?.code ?? res?.code,
      hasUrl: Boolean(item?.url),
      freeTrial: Boolean(item?.freeTrialInfo),
      message: item?.message || res?.message || res?.msg || '',
    })
    if (!item?.url || item.code !== 200) return null
    return {
      url: normalizePlayUrl(item.url),
      isTrial: Boolean(item.freeTrialInfo),
    }
  } catch (error) {
    logPlayUrlAttempt('error', {
      id,
      level,
      unblock,
      message: error?.message || 'play url request failed',
    })
    return null
  }
}

function tryNextPlayUrl() {
  if (_playUrlIndex >= _playUrls.length - 1) {
    // 当前歌曲没有更多可用 URL，自动切到下一首
    if (_shouldAutoPlay && _queue.length > 1 && !_advanceLock) {
      _advanceLock = true
      setTimeout(() => {
        try { next() } finally { _advanceLock = false }
      }, 120)
    }
    return false
  }
  _playUrlIndex += 1
  _loading = true
  _error = ''
  const url = _playUrls[_playUrlIndex]
  logPlayback('fallback-url', { index: _playUrlIndex, url })
  engine.load(url)
  engine.play().catch((error) => {
    logPlayback('fallback-play-reject', { index: _playUrlIndex, message: error?.message || String(error) })
    if (!tryNextPlayUrl()) {
      _loading = false
      _playing = false
      _shouldAutoPlay = false
      _error = '当前歌曲暂无可用音源'
    }
  })
  return true
}

function playTrack(track, index) {
  if (!track) return
  const playableTrack = compactTrack(track)
  if (!playableTrack) return
  const requestId = ++_playRequestId
  _id = playableTrack.id
  _title = playableTrack.name
  _artist = playableTrack.ar.map(a => a.name).join(' / ')
  _currentTrack = playableTrack
  _cover = normalizeImageUrl(playableTrack.picUrl || playableTrack.al.picUrl || '')
  _duration = playableTrack.dt || 0
  _queueIndex = index >= 0 ? index : _queueIndex
  _loading = true
  _playing = false
  _shouldAutoPlay = true
  _error = ''

  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    initMediaSession()
    navigator.mediaSession.metadata = new MediaMetadata({
      title: _title,
      artist: _artist,
      album: '',
      artwork: [{ src: coverUrl(_cover, 512), sizes: '512x512', type: 'image/jpeg' }],
    })
  }

  persistState()
  addLocalHistory(playableTrack)
  syncNativeMedia()

  getPlayableUrls(playableTrack.id).then(urls => {
    if (requestId !== _playRequestId) return
    _playUrls = urls
    _playUrlIndex = 0
    if (urls.length > 0) {
      logPlayback('load-url', { id: playableTrack.id, url: urls[0], count: urls.length })
      engine.load(urls[0])
      engine.play().then(() => {
        if (requestId === _playRequestId) _playing = true
      }).catch((error) => {
        logPlayback('play-reject', { id: playableTrack.id, message: error?.message || String(error) })
        if (requestId !== _playRequestId) return
        if (!tryNextPlayUrl()) {
          _playing = false
          _loading = false
          _shouldAutoPlay = false
          _error = '当前歌曲暂无可用音源'
        }
      })
    } else {
      _loading = false
      _playing = false
      _shouldAutoPlay = false
      _error = '当前歌曲暂无可用音源'
    }
  }).catch(() => {
    if (requestId !== _playRequestId) return
    _loading = false
    _playing = false
    _shouldAutoPlay = false
    _error = '当前歌曲暂无可用音源'
  })
}

function addLocalHistory(track) {
  if (!track || !track.id) return
  try {
    const key = 'local_history'
    let list = getStorageJson(key, [])
    // 去重：移除同 id 的旧记录
    list = list.filter(t => t.id !== track.id)
    // 插入到头部
    const album = track.al || track.album || {}
    const entry = {
      id: track.id,
      name: track.name,
      artists: track.ar || track.artists || [],
      album: album,
      picUrl: normalizeImageUrl(album.picUrl || track.coverImgUrl || track.picUrl || ''),
      duration: track.dt || track.duration || 0,
      playedAt: Date.now(),
    }
    list.unshift(entry)
    // 最多保留 200 条
    if (list.length > 200) list.length = 200
    setStorage(key, list)
  } catch {}
}

export function getLocalHistory() {
  return getStorageJson('local_history', [])
}

export function clearHistory() {
  removeStorage('local_history')
}

function playQueue(tracks, startIndex = 0) {
  _queue = compactQueue(tracks)
  _queueIndex = Math.min(Math.max(startIndex, 0), Math.max(_queue.length - 1, 0))
  saveLS('player_queue', _queue)
  saveLS('player_qi', _queueIndex)
  if (_queue[_queueIndex]) playTrack(_queue[_queueIndex], _queueIndex)
}

function next() {
  if (_queue.length === 0) {
    logPlayback('next-empty-queue')
    return
  }
  if (_advanceLock) {
    logPlayback('next-locked')
    return
  }
  let idx
  if (_mode === 'shuffle') {
    idx = Math.floor(Math.random() * _queue.length)
  } else if (_mode === 'repeat') {
    idx = _queueIndex
  } else {
    idx = (_queueIndex + 1) % _queue.length
  }
  logPlayback('next', { fromIndex: _queueIndex, toIndex: idx, mode: _mode })
  playTrack(_queue[idx], idx)
}

function prev() {
  if (_queue.length === 0) return
  const idx = _queueIndex <= 0 ? _queue.length - 1 : _queueIndex - 1
  playTrack(_queue[idx], idx)
}

function togglePlay() {
  if (!_id) return
  const result = engine.toggle()
  if (result?.catch) {
    _shouldAutoPlay = true
    result.then(() => {
      _playing = !engine.paused
    }).catch(() => {
      if (!tryNextPlayUrl()) {
        _playing = false
        _shouldAutoPlay = false
        _error = '当前歌曲暂无可用音源'
      }
    })
  } else {
    _playing = !engine.paused
    _shouldAutoPlay = _playing
  }
}

function seek(time) {
  engine.seek(time)
  _currentTime = time
  saveLS('player_time', time)
}

function setVolume(v) {
  _volume = v
  engine.setVolume(v)
  saveLS('volume', v)
}

function setMode(m) {
  _mode = m
  saveLS('mode', m)
}

function setPreferredLevel(level) {
  if (PLAY_LEVELS.includes(level)) {
    _preferredLevel = level
    saveLS('preferred_quality', level)
  }
}

function clearQueue() {
  _queue = []
  _queueIndex = -1
  removeStorage('player_queue')
  removeStorage('player_qi')
}

function removeFromQueue(index) {
  if (index < 0 || index >= _queue.length) return
  const wasCurrent = index === _queueIndex
  _queue = _queue.filter((_, i) => i !== index)
  if (wasCurrent) {
    _queueIndex = Math.min(index, _queue.length - 1)
    if (_queue.length > 0 && _queueIndex >= 0) {
      playTrack(_queue[_queueIndex], _queueIndex)
    } else {
      _id = 0
      _title = ''
      _artist = ''
      _cover = ''
      _duration = 0
      _currentTrack = null
      _playing = false
      _queueIndex = -1
      _error = ''
      persistState()
    }
  } else if (index < _queueIndex) {
    _queueIndex--
  }
  saveLS('player_queue', _queue)
  saveLS('player_qi', _queueIndex)
}

function restore() {
  if (getLS('restore_session', 'true') !== 'true') return
  const savedId = parseInt(getLS('player_id', '0'))
  if (!savedId) return
  const savedQueue = compactQueue(getLSJson('player_queue', []))
  const savedTime = parseFloat(getLS('player_time', '0'))
  const savedIndex = parseInt(getLS('player_qi', '-1'))
  const idx = savedIndex >= 0 ? savedIndex : 0

  // 恢复内存状态
  _queue = savedQueue
  _queueIndex = idx
  _id = savedId
  _title = getLS('player_title', '')
  _artist = getLS('player_artist', '')
  _cover = getLS('player_cover', '')
  _duration = parseInt(getLS('player_duration', '0'))
  _currentTime = savedTime
  _currentTrack = savedQueue.find(track => track?.id === savedId) || savedQueue[idx] || null

  // 恢复播放列表到 UI
  if (savedQueue.length > 0) {
    saveLS('player_queue', savedQueue)
  }

  // 重新加载音频地址并恢复进度，但不自动播放，避免触发浏览器/WebView 自动播放限制
  const requestId = ++_playRequestId
  _restoreSeeking = savedTime > 0
  _shouldAutoPlay = false
  _playing = false
  getPlayableUrls(savedId).then(urls => {
    if (requestId !== _playRequestId) return
    _playUrls = urls
    _playUrlIndex = 0
    if (urls.length > 0) {
      engine.load(urls[0])
    } else {
      _loading = false
    }
  }).catch(() => {
    if (requestId !== _playRequestId) return
    _loading = false
  })
}

export const player = {
  get id() { return _id },
  get title() { return _title },
  get artist() { return _artist },
  get currentTrack() { return _currentTrack },
  get cover() { return _cover },
  get duration() { return _duration },
  get currentTime() { return _currentTime },
  get playing() { return _playing },
  get loading() { return _loading },
  get error() { return _error },
  get volume() { return _volume },
  get mode() { return _mode },
  get preferredLevel() { return _preferredLevel },
  get queue() { return _queue },
  get queueIndex() { return _queueIndex },
  playTrack,
  playQueue,
  next,
  prev,
  togglePlay,
  seek,
  setVolume,
  setMode,
  setPreferredLevel,
  clearQueue,
  removeFromQueue,
  restore,
}
