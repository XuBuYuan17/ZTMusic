import { engine } from '../player/engine.js'
import { ncm } from '../api/client.js'

function getLS(key, def) {
  try { return localStorage.getItem(key) || def }
  catch { return def }
}
function saveLS(key, val) {
  try { localStorage.setItem(key, typeof val === 'object' ? JSON.stringify(val) : val) } catch {}
}
function getLSJson(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def }
}

let _id = $state(parseInt(getLS('player_id', '0')) || 0)
let _title = $state(getLS('player_title', ''))
let _artist = $state(getLS('player_artist', ''))
let _cover = $state(getLS('player_cover', ''))
let _duration = $state(parseInt(getLS('player_duration', '0')) || 0)
let _currentTime = $state(parseFloat(getLS('player_time', '0')))
let _playing = $state(false)
let _loading = $state(false)
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
  const urls = [`https://music.163.com/song/media/outer/url?id=${id}.mp3`]
  const levels = [...PLAY_LEVELS]
  const prefIdx = levels.indexOf(_preferredLevel)
  if (prefIdx > 0) { levels.splice(prefIdx, 1); levels.unshift(_preferredLevel) }
  for (const level of levels) {
    try {
      const res = await ncm.songUrl(id, level)
      const item = res.data?.[0]
      if (item?.url && !urls.includes(item.url)) urls.push(item.url)
    } catch {}
  }
  return urls
}

function tryNextPlayUrl() {
  if (!_shouldAutoPlay || _playUrlIndex >= _playUrls.length - 1) return false
  _playUrlIndex += 1
  _loading = true
  engine.load(_playUrls[_playUrlIndex])
  engine.play().catch(() => {
    if (!tryNextPlayUrl()) {
      _loading = false
      _playing = false
      _shouldAutoPlay = false
    }
  })
  return true
}

function playTrack(track, index) {
  if (!track) return
  const requestId = ++_playRequestId
  _id = track.id
  _title = track.name
  _artist = (track.ar || track.artists || []).map(a => a.name).join(' / ')
  const album = track.al || track.album || {}
  _cover = album.picUrl || track.coverImgUrl || track.picUrl || ''
  _duration = track.dt || track.duration || 0
  _queueIndex = index >= 0 ? index : _queueIndex
  _loading = true
  _playing = false
  _shouldAutoPlay = true
  persistState()
  addLocalHistory(track)

  getPlayableUrls(track.id).then(urls => {
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
        }
      })
    } else {
      _loading = false
      _playing = false
      _shouldAutoPlay = false
    }
  }).catch(() => {
    if (requestId !== _playRequestId) return
    _loading = false
    _playing = false
    _shouldAutoPlay = false
  })
}

function addLocalHistory(track) {
  if (!track || !track.id) return
  try {
    const key = 'local_history'
    let list = JSON.parse(localStorage.getItem(key) || '[]')
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
    localStorage.setItem(key, JSON.stringify(list))
  } catch {}
}

export function getLocalHistory() {
  try {
    return JSON.parse(localStorage.getItem('local_history') || '[]')
  } catch { return [] }
}

export function clearHistory() {
  try { localStorage.removeItem('local_history') } catch {}
}

function playQueue(tracks, startIndex = 0) {
  _queue = tracks
  _queueIndex = startIndex
  saveLS('player_queue', tracks)
  saveLS('player_qi', startIndex)
  if (tracks[startIndex]) playTrack(tracks[startIndex], startIndex)
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
  localStorage.removeItem('player_queue')
  localStorage.removeItem('player_qi')
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
      _playing = false
      _queueIndex = -1
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
  const savedQueue = getLSJson('player_queue', [])
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
  get cover() { return _cover },
  get duration() { return _duration },
  get currentTime() { return _currentTime },
  get playing() { return _playing },
  get loading() { return _loading },
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
