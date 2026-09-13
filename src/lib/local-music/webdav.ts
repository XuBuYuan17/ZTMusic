import type { SongId } from '../types/music.ts'
import { isTauriRuntime } from '../utils/runtime.ts'

const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav'])
const SETTINGS_KEY = 'zheting.webdav.settings'
const PASSWORD_KEY = 'zheting.webdav.password'
const playableUrlCache = new Map<unknown, string>()

type TauriCoreModule = typeof import('@tauri-apps/api/core')
let tauriApiPromise: Promise<Pick<TauriCoreModule, 'invoke' | 'convertFileSrc'>> | null = null

async function getTauriApi(): Promise<Pick<TauriCoreModule, 'invoke' | 'convertFileSrc'>> {
  if (!isTauriRuntime()) throw new Error('WebDAV 播放目前仅支持桌面端')
  if (!tauriApiPromise) {
    tauriApiPromise = import('@tauri-apps/api/core')
      .then((mod) => ({ invoke: mod.invoke, convertFileSrc: mod.convertFileSrc }))
  }
  return tauriApiPromise
}

type Loose = Record<string, unknown>

function asRecord(value: unknown): Loose {
  return value && typeof value === 'object' ? value as Loose : {}
}

function normalizeWebDavUrl(url: unknown): string {
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

function extensionOf(name: unknown = ''): string {
  return String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ''
}

export function isSupportedWebDavAudio(name: unknown = ''): boolean {
  return AUDIO_EXTENSIONS.has(extensionOf(name))
}

export interface StoredWebDavSettings {
  url: string
  username: string
}

interface WebDavSettingsInput {
  url?: unknown
  username?: unknown
  password?: unknown
}

export function getStoredWebDavSettings(): StoredWebDavSettings {
  try {
    const data = asRecord(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'))
    return {
      url: String(data.url || ''),
      username: String(data.username || ''),
    }
  } catch {
    return { url: '', username: '' }
  }
}

export function saveWebDavSettings(settings: WebDavSettingsInput | null | undefined): StoredWebDavSettings {
  const s = asRecord(settings)
  const url = normalizeWebDavUrl(s.url)
  const username = String(s.username || '').trim()
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ url, username }))
  if (s.password !== undefined) {
    sessionStorage.setItem(PASSWORD_KEY, String(s.password || ''))
  }
  return { url, username }
}

export function getWebDavPassword(): string {
  return sessionStorage.getItem(PASSWORD_KEY) || ''
}

interface WebDavRequest {
  url: string
  username: string
  password: string
}

function requestFromSettings(settings: WebDavSettingsInput | null | undefined): WebDavRequest {
  const s = asRecord(settings)
  const url = normalizeWebDavUrl(s.url)
  if (!url) throw new Error('请输入有效的 WebDAV 地址')
  return {
    url,
    username: String(s.username || '').trim(),
    password: String(s.password ?? getWebDavPassword()),
  }
}

function titleFromFileName(fileName: unknown = ''): string {
  return String(fileName).replace(/\.[^.]+$/, '').trim() || 'WebDAV 音乐'
}

function artistId(name: string): string {
  return `webdav-artist:${encodeURIComponent(name.toLowerCase())}`
}

export interface WebDavTrack {
  id?: SongId
  webdavId?: SongId
  source: 'webdav'
  name: string
  ar: Array<{ id: SongId; name: string }>
  al: { id: SongId; name?: string; picUrl?: string }
  dt: number
  picUrl: string
  fileName: string
  remoteUrl?: unknown
  webdavBaseUrl: string
  mime: string
  fileSize: number
  addedAt: number
}

export function createWebDavTrack(raw: unknown): WebDavTrack {
  const r = asRecord(raw)
  const fileName = r.name || decodeURIComponent(String(r.url || '').split('/').pop() || 'WebDAV 音乐')
  const artist = 'WebDAV'
  return {
    id: r.id as SongId | undefined,
    webdavId: r.id as SongId | undefined,
    source: 'webdav',
    name: titleFromFileName(fileName),
    ar: [{ id: artistId(artist), name: artist }],
    al: { id: 'webdav-album', name: 'WebDAV 曲库', picUrl: '' },
    dt: 0,
    picUrl: '',
    fileName: fileName as string,
    remoteUrl: r.url,
    webdavBaseUrl: String(r.baseUrl || ''),
    mime: String(r.mime || ''),
    fileSize: (r.fileSize || 0) as number,
    addedAt: Date.now(),
  }
}

export async function listWebDavTracks(settings: WebDavSettingsInput | null | undefined): Promise<WebDavTrack[]> {
  const { invoke } = await getTauriApi()
  const request = requestFromSettings(settings)
  const tracks = await invoke('webdav_list_audio', { request })
  saveWebDavSettings(settings)
  return (Array.isArray(tracks) ? tracks : [])
    .filter((track): track is Loose => {
      const r = asRecord(track)
      return !!r.url && isSupportedWebDavAudio(String(r.name || r.url))
    })
    .map((track) => createWebDavTrack({ ...track, baseUrl: request.url }))
}

interface CachedAudio {
  path: string
}

export async function getWebDavPlayableUrl(track: unknown): Promise<string> {
  const t = asRecord(track)
  const id = t.webdavId || t.id
  if (!id) throw new Error('WebDAV 曲目缺少 ID')
  const cachedPlayable = playableUrlCache.get(id)
  if (cachedPlayable !== undefined) return cachedPlayable
  const remoteUrl = normalizeWebDavUrl(t.remoteUrl)
  if (!remoteUrl) throw new Error('WebDAV 曲目地址无效，请重新扫描')
  const storedSettings = getStoredWebDavSettings()
  const baseUrl = normalizeWebDavUrl(t.webdavBaseUrl || storedSettings.url)
  if (!baseUrl) throw new Error('WebDAV 服务器地址无效，请重新扫描')
  const { invoke, convertFileSrc } = await getTauriApi()
  const cached = await invoke('webdav_cache_audio', {
    request: {
      url: remoteUrl,
      baseUrl,
      username: String(t.webdavUsername || storedSettings.username || ''),
      password: getWebDavPassword(),
    },
  }) as CachedAudio
  const playableUrl = convertFileSrc(cached.path)
  playableUrlCache.set(id, playableUrl)
  return playableUrl
}

export function revokeWebDavPlayableUrl(id: unknown): void {
  playableUrlCache.delete(id)
}
