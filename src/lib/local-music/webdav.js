const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav'])
const SETTINGS_KEY = 'zheting.webdav.settings'
const PASSWORD_KEY = 'zheting.webdav.password'
const playableUrlCache = new Map()
let tauriApiPromise = null

function isTauriRuntime() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

async function getTauriApi() {
  if (!isTauriRuntime()) throw new Error('WebDAV 播放目前仅支持桌面端')
  if (!tauriApiPromise) {
    tauriApiPromise = import('@tauri-apps/api/core')
      .then((mod) => ({ invoke: mod.invoke, convertFileSrc: mod.convertFileSrc }))
  }
  return tauriApiPromise
}

function normalizeWebDavUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

function extensionOf(name = '') {
  return String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ''
}

export function isSupportedWebDavAudio(name = '') {
  return AUDIO_EXTENSIONS.has(extensionOf(name))
}

export function getStoredWebDavSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return {
      url: String(data.url || ''),
      username: String(data.username || ''),
    }
  } catch {
    return { url: '', username: '' }
  }
}

export function saveWebDavSettings(settings) {
  const url = normalizeWebDavUrl(settings?.url)
  const username = String(settings?.username || '').trim()
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ url, username }))
  if (settings?.password !== undefined) {
    sessionStorage.setItem(PASSWORD_KEY, String(settings.password || ''))
  }
  return { url, username }
}

export function getWebDavPassword() {
  return sessionStorage.getItem(PASSWORD_KEY) || ''
}

function requestFromSettings(settings) {
  const url = normalizeWebDavUrl(settings?.url)
  if (!url) throw new Error('请输入有效的 WebDAV 地址')
  return {
    url,
    username: String(settings?.username || '').trim(),
    password: String(settings?.password ?? getWebDavPassword()),
  }
}

function titleFromFileName(fileName = '') {
  return String(fileName).replace(/\.[^.]+$/, '').trim() || 'WebDAV 音乐'
}

function artistId(name) {
  return `webdav-artist:${encodeURIComponent(name.toLowerCase())}`
}

export function createWebDavTrack(raw) {
  const fileName = raw?.name || decodeURIComponent(String(raw?.url || '').split('/').pop() || 'WebDAV 音乐')
  const artist = 'WebDAV'
  return {
    id: raw.id,
    webdavId: raw.id,
    source: 'webdav',
    name: titleFromFileName(fileName),
    ar: [{ id: artistId(artist), name: artist }],
    al: { id: 'webdav-album', name: 'WebDAV 曲库', picUrl: '' },
    dt: 0,
    picUrl: '',
    fileName,
    remoteUrl: raw.url,
    mime: raw.mime || '',
    fileSize: raw.fileSize || 0,
    addedAt: Date.now(),
  }
}

export async function listWebDavTracks(settings) {
  const { invoke } = await getTauriApi()
  const request = requestFromSettings(settings)
  const tracks = await invoke('webdav_list_audio', { request })
  saveWebDavSettings(settings)
  return (Array.isArray(tracks) ? tracks : [])
    .filter((track) => track?.url && isSupportedWebDavAudio(track.name || track.url))
    .map(createWebDavTrack)
}

export async function getWebDavPlayableUrl(track) {
  const id = track?.webdavId || track?.id
  if (!id) throw new Error('WebDAV 曲目缺少 ID')
  if (playableUrlCache.has(id)) return playableUrlCache.get(id)
  const remoteUrl = normalizeWebDavUrl(track.remoteUrl)
  if (!remoteUrl) throw new Error('WebDAV 曲目地址无效，请重新扫描')
  const { invoke, convertFileSrc } = await getTauriApi()
  const cached = await invoke('webdav_cache_audio', {
    request: {
      url: remoteUrl,
      username: String(track.webdavUsername || getStoredWebDavSettings().username || ''),
      password: getWebDavPassword(),
    },
  })
  const playableUrl = convertFileSrc(cached.path)
  playableUrlCache.set(id, playableUrl)
  return playableUrl
}

export function revokeWebDavPlayableUrl(id) {
  playableUrlCache.delete(id)
}
