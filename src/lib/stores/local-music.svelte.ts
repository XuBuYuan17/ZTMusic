import type { SongId, TrackSource } from '../types/music.ts'
import { createLocalTrackId, isSupportedAudioFile, readLocalMetadata } from '../local-music/metadata.ts'
import { clearLocalTracks, listLocalTracks, removeLocalTrack, saveLocalTrack } from '../local-music/storage.ts'
import { getStoredWebDavSettings, getWebDavPassword, listWebDavTracks, saveWebDavSettings } from '../local-music/webdav.ts'

const MAX_FILE_SIZE = 1024 * 1024 * 1024

interface LocalTrack {
  id: SongId
  localId?: SongId
  webdavId?: SongId
  source: TrackSource
  name: string
  ar: Array<{ id: SongId; name: string }>
  al: { id: SongId; name?: string; picUrl?: string }
  dt: number
  picUrl: string
  fileName?: string
  relativePath?: string
  remoteUrl?: string
  webdavBaseUrl?: string
  webdavUsername?: string
  mime?: string
  fileSize?: number
  addedAt?: number
}

interface StoredWebDavSettings {
  url: string
  username: string
}

interface LocalMetadata {
  title?: string
  artist?: string
  album?: string
}

interface ImportResult {
  imported: number
  skipped: number
}

function pickErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

function readDuration(file: File): Promise<number> {
  if (typeof Audio === 'undefined') return Promise.resolve(0)
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const finish = (duration = 0) => {
      clearTimeout(timer)
      audio.onloadedmetadata = null
      audio.onerror = null
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(duration) ? Math.round(duration * 1000) : 0)
    }
    const timer = setTimeout(() => finish(0), 8000)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => finish(audio.duration)
    audio.onerror = () => finish(0)
    audio.src = url
  })
}

function artistId(name: string): string {
  return `local-artist:${encodeURIComponent(name.toLowerCase())}`
}

class LocalMusicState {
  tracks = $state<LocalTrack[]>([])
  initialized = $state(false)
  loading = $state(false)
  importing = $state(false)
  importCurrent = $state(0)
  importTotal = $state(0)
  message = $state('')
  error = $state('')
  webdavUrl = $state('')
  webdavUsername = $state('')
  webdavPassword = $state('')
  webdavConnected = $state(false)
  webdavLoading = $state(false)
  #initPromise: Promise<unknown> | null = null

  get totalSize(): number { return this.tracks.reduce((sum, track) => sum + (track.fileSize || 0), 0) }
  get localTracks(): LocalTrack[] { return this.tracks.filter((track) => track.source !== 'webdav') }
  get webdavTracks(): LocalTrack[] { return this.tracks.filter((track) => track.source === 'webdav') }

  async init(): Promise<void> {
    if (this.initialized) return
    if (this.#initPromise) {
      await this.#initPromise
      return
    }
    this.loading = true
    const webdav = getStoredWebDavSettings() as StoredWebDavSettings
    this.webdavUrl = webdav.url
    this.webdavUsername = webdav.username
    this.webdavPassword = getWebDavPassword() as string
    this.#initPromise = listLocalTracks()
      .then((rows) => { this.tracks = rows as unknown as LocalTrack[] })
      .catch((error) => { this.error = error?.message || '本地曲库读取失败' })
      .finally(() => {
        this.initialized = true
        this.loading = false
        this.#initPromise = null
      })
    await this.#initPromise
  }

  async importFiles(fileList: FileList | File[] | null | undefined): Promise<ImportResult> {
    const files = [...(fileList || [])].filter(isSupportedAudioFile)
    this.error = ''
    this.message = ''
    if (files.length === 0) {
      this.error = '没有找到支持的音频文件'
      return { imported: 0, skipped: 0 }
    }

    this.importing = true
    this.importCurrent = 0
    this.importTotal = files.length
    let imported = 0
    let skipped = 0
    try {
      for (const file of files) {
        this.importCurrent += 1
        if (!file.size || file.size > MAX_FILE_SIZE) { skipped += 1; continue }
        const id = createLocalTrackId(file) as string
        const metadata = await readLocalMetadata(file) as LocalMetadata
        const duration = await readDuration(file)
        const artist = metadata.artist || '未知歌手'
        const album = metadata.album || '本地音乐'
        const track: LocalTrack = {
          id,
          localId: id,
          source: 'local',
          name: metadata.title || file.name,
          ar: [{ id: artistId(artist), name: artist }],
          al: { id: `local-album:${encodeURIComponent(album.toLowerCase())}`, name: album, picUrl: '' },
          dt: duration,
          picUrl: '',
          fileName: file.name,
          relativePath: file.webkitRelativePath || '',
          mime: file.type || '',
          fileSize: file.size,
          addedAt: Date.now(),
        }
        await saveLocalTrack(track, file)
        imported += 1
      }
      this.tracks = await listLocalTracks() as unknown as LocalTrack[]
      this.message = `已导入 ${imported} 首${skipped ? `，跳过 ${skipped} 首` : ''}`
      return { imported, skipped }
    } catch (error) {
      try { this.tracks = await listLocalTracks() as unknown as LocalTrack[] } catch {}
      this.error = pickErrorMessage(error, '导入失败，请检查存储空间')
      return { imported, skipped }
    } finally {
      this.importing = false
    }
  }

  async remove(id: SongId): Promise<void> {
    const target = this.tracks.find((track) => track.id === id)
    if (target?.source !== 'webdav') await removeLocalTrack(id)
    this.tracks = this.tracks.filter((track) => track.id !== id)
  }

  async clear(): Promise<void> {
    await clearLocalTracks()
    this.tracks = this.webdavTracks
    this.message = '本地曲库已清空'
  }

  async connectWebDav(): Promise<LocalTrack[]> {
    this.error = ''
    this.message = ''
    this.webdavLoading = true
    try {
      const settings = saveWebDavSettings({
        url: this.webdavUrl,
        username: this.webdavUsername,
        password: this.webdavPassword,
      }) as StoredWebDavSettings
      const tracks = await listWebDavTracks({
        ...settings,
        password: this.webdavPassword,
      }) as LocalTrack[]
      this.tracks = [
        ...this.localTracks,
        ...tracks.map((track) => ({
          ...track,
          webdavUsername: settings.username,
        })),
      ]
      this.webdavConnected = true
      this.message = tracks.length ? `已连接 WebDAV，发现 ${tracks.length} 首歌曲` : 'WebDAV 已连接，但当前目录没有音频文件'
      return tracks
    } catch (error) {
      this.error = pickErrorMessage(error, 'WebDAV 连接失败')
      return []
    } finally {
      this.webdavLoading = false
    }
  }

  disconnectWebDav(): void {
    this.tracks = this.localTracks
    this.webdavConnected = false
    this.message = '已断开 WebDAV 曲库'
  }
}

export const localMusic = new LocalMusicState()
