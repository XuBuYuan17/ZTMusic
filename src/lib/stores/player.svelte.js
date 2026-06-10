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
let _volume = $state(parseFloat(getLS('volume', '0.8')))
let _mode = $state(getLS('mode', 'list'))
let _queue = $state(getLSJson('player_queue', []))
let _queueIndex = $state(parseInt(getLS('player_qi', '-1')))

let _saveTimer = null
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
  _playing = true
  // 恢复播放时跳转到上次进度
  if (_restoreSeeking && _currentTime > 0) {
    engine.seek(_currentTime)
    _restoreSeeking = false
  }
})
engine.onError(() => { _loading = false })
engine.setVolume(_volume)

function persistState() {
  saveLS('player_id', _id)
  saveLS('player_title', _title)
  saveLS('player_artist', _artist)
  saveLS('player_cover', _cover)
  saveLS('player_duration', _duration)
  saveLS('player_qi', _queueIndex)
}

function playTrack(track, index) {
  if (!track) return
  _id = track.id
  _title = track.name
  _artist = (track.ar || track.artists || []).map(a => a.name).join(' / ')
  const album = track.al || track.album || {}
  _cover = album.picUrl || track.coverImgUrl || track.picUrl || ''
  _duration = track.dt || track.duration || 0
  _queueIndex = index >= 0 ? index : _queueIndex
  _loading = true
  persistState()
  addLocalHistory(track)

  ncm.songUrl(track.id).then(res => {
    const url = res.data?.[0]?.url
    if (url) {
      engine.load(url)
      engine.play()
    } else {
      _loading = false
    }
  }).catch(() => { _loading = false })
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
  engine.toggle()
  _playing = !engine.paused
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

let _restoreSeeking = false

function restore() {
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

  // 重新加载歌曲并恢复进度
  _restoreSeeking = savedTime > 0
  ncm.songUrl(savedId).then(res => {
    const url = res.data?.[0]?.url
    if (url) {
      engine.load(url)
      engine.play()
    }
  }).catch(() => {})
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
  restore,
}
