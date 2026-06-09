import { engine } from '../player/engine.js'
import { ncm } from '../api/client.js'

function getLS(key, def) {
  try { return localStorage.getItem(key) || def }
  catch { return def }
}

let _id = $state(0)
let _title = $state('')
let _artist = $state('')
let _cover = $state('')
let _duration = $state(0)
let _currentTime = $state(0)
let _playing = $state(false)
let _loading = $state(false)
let _volume = $state(parseFloat(getLS('volume', '0.8')))
let _mode = $state(getLS('mode', 'list'))
let _queue = $state([])
let _queueIndex = $state(-1)

engine.onTimeUpdate((t) => { _currentTime = t })
engine.onEnded(() => { next() })
engine.onLoadStart(() => { _loading = true })
engine.onCanPlay(() => {
  _loading = false
  _duration = engine.duration
  _playing = true
})
engine.onError(() => { _loading = false })
engine.setVolume(_volume)

function playTrack(track, index) {
  if (!track) return
  _id = track.id
  _title = track.name
  _artist = (track.ar || track.artists || []).map(a => a.name).join(' / ')
  _cover = (track.al || track.album || {}).picUrl || ''
  _duration = track.dt || track.duration || 0
  _queueIndex = index >= 0 ? index : _queueIndex
  _loading = true

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

function playQueue(tracks, startIndex = 0) {
  _queue = tracks
  _queueIndex = startIndex
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
}

function setVolume(v) {
  _volume = v
  engine.setVolume(v)
  localStorage.setItem('volume', v)
}

function setMode(m) {
  _mode = m
  localStorage.setItem('mode', m)
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
}
