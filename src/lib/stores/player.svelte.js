import { engine } from '../player/engine.js'
import { ncm } from '../api/client.js'
import { getStorage, getStorageJson, removeStorage, setStorage } from '../utils/storage.js'
import { coverUrl } from '../utils/image.js'

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
const PLAY_LEVELS = ['lossless', 'exhigh', 'higher', 'standard']
const FAST_PLAY_TIMEOUT = 3500
const FALLBACK_PLAY_TIMEOUT = 5000
const MAX_QUEUE_SIZE = 500
const SHOULD_LOG_PLAY_URLS = typeof import.meta !== 'undefined' && import.meta.env?.DEV

let _mediaSessionInited = false

function logPlayUrlAttempt(type, payload) {
  if (!SHOULD_LOG_PLAY_URLS || typeof console === 'undefined') return
  console.debug(`[play-url:${type}]`, payload)
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
  return {
    id: track.id,
    name: track.name || '',
    ar: (track.ar || track.artists || []).map(compactArtist).filter(Boolean),
    al: {
      id: album.id,
      name: album.name || '',
      picUrl: album.picUrl || album.blurPicUrl || track.coverImgUrl || track.picUrl || '',
    },
    dt: track.dt || track.duration || 0,
    picUrl: album.picUrl || album.blurPicUrl || track.coverImgUrl || track.picUrl || '',
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
})
engine.onEnded(() => { next() })
engine.onLoadStart(() => { _loading = true })
engine.onCanPlay(() => {
  _loading = false
  _duration = engine.duration
  _playing = _shouldAutoPlay && !engine.paused
  // 恢复播放时跳转到上次进度
  if (_restoreSeeking && _currentTime > 0) {
    engine.seek(_currentTime)
    _restoreSeeking = false
  }
})
engine.onError(() => {
  if (tryNextPlayUrl()) return
  _loading = false
  _playing = false
  _shouldAutoPlay = false
  _error = '当前歌曲暂无可用音源'
})
engine.setVolume(initialVolume)

function persistState() {
  saveLS('player_id', _id)
  saveLS('player_title', _title)
  saveLS('player_artist', _artist)
  saveLS('player_cover', _cover)
  saveLS('player_duration', _duration)
  saveLS('player_qi', _queueIndex)
}

async function getPlayableUrls(id) {
  const fallbackUrl = `https://music.163.com/song/media/outer/url?id=${id}.mp3`
  const urls = []
  const levels = orderedPlayLevels()
  const fastLevels = uniqueLevels([_preferredLevel, 'standard', 'higher']).filter(level => levels.includes(level))

  const fastResults = await Promise.all(fastLevels.map(level => fetchSongUrl(id, level, false, FAST_PLAY_TIMEOUT)))
  fastResults.forEach(url => addUrl(urls, url))

  if (urls.length === 0) {
    const unblockResults = await Promise.all(fastLevels.map(level => fetchSongUrl(id, level, true, FAST_PLAY_TIMEOUT)))
    unblockResults.forEach(url => addUrl(urls, url))
  }

  if (urls.length === 0) addUrl(urls, fallbackUrl)

  const remainingLevels = levels.filter(level => !fastLevels.includes(level))
  const fallbackResults = await Promise.all([
    ...remainingLevels.map(level => fetchSongUrl(id, level, false, FALLBACK_PLAY_TIMEOUT)),
    ...remainingLevels.map(level => fetchSongUrl(id, level, true, FALLBACK_PLAY_TIMEOUT)),
  ])
  fallbackResults.forEach(url => addUrl(urls, url))
  addUrl(urls, fallbackUrl)
  return urls
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

function addUrl(urls, url) {
  const playableUrl = normalizePlayUrl(url)
  if (playableUrl && !urls.includes(playableUrl)) urls.push(playableUrl)
}

function normalizePlayUrl(url) {
  if (!url) return ''
  return url.replace(/^http:\/\/(m\d+\.music\.126\.net)\//i, 'https://$1/')
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
    if (!item?.url || item.code === 404 || item.freeTrialInfo) return ''
    return normalizePlayUrl(item.url)
  } catch (error) {
    logPlayUrlAttempt('error', {
      id,
      level,
      unblock,
      message: error?.message || 'play url request failed',
    })
    return ''
  }
}

function tryNextPlayUrl() {
  if (!_shouldAutoPlay || _playUrlIndex >= _playUrls.length - 1) return false
  _playUrlIndex += 1
  _loading = true
  _error = ''
  engine.load(_playUrls[_playUrlIndex])
  engine.play().catch(() => {
    if (!tryNextPlayUrl()) {
      _loading = false
      _playing = false
      _shouldAutoPlay = false
      _error = '当前歌曲暂无可用音源'
      if (_queue.length > 1) next()
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
  _cover = playableTrack.picUrl || playableTrack.al.picUrl || ''
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

  getPlayableUrls(playableTrack.id).then(urls => {
    if (requestId !== _playRequestId) return
    _playUrls = urls
    _playUrlIndex = 0
    if (urls.length > 0) {
      engine.load(urls[0])
      engine.play().then(() => {
        if (requestId === _playRequestId) _playing = true
      }).catch(() => {
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
      picUrl: album.picUrl || track.coverImgUrl || track.picUrl || '',
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
  if (_queue.length === 0) return
  let idx
  if (_mode === 'shuffle') {
    idx = Math.floor(Math.random() * _queue.length)
  } else if (_mode === 'repeat') {
    idx = _queueIndex
  } else {
    idx = (_queueIndex + 1) % _queue.length
  }
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
