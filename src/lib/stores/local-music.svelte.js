import { createLocalTrackId, isSupportedAudioFile, readLocalMetadata } from '../local-music/metadata.js'
import { clearLocalTracks, listLocalTracks, removeLocalTrack, saveLocalTrack } from '../local-music/storage.js'
import { getStoredWebDavSettings, getWebDavPassword, listWebDavTracks, saveWebDavSettings } from '../local-music/webdav.js'

const MAX_FILE_SIZE = 1024 * 1024 * 1024

function readDuration(file) {
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

function artistId(name) {
  return `local-artist:${encodeURIComponent(name.toLowerCase())}`
}

class LocalMusicState {
  tracks = $state([])
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
  #initPromise = null

  get totalSize() { return this.tracks.reduce((sum, track) => sum + (track.fileSize || 0), 0) }
  get localTracks() { return this.tracks.filter((track) => track.source !== 'webdav') }
  get webdavTracks() { return this.tracks.filter((track) => track.source === 'webdav') }

  async init() {
    if (this.initialized) return
    if (this.#initPromise) return this.#initPromise
    this.loading = true
    const webdav = getStoredWebDavSettings()
    this.webdavUrl = webdav.url
    this.webdavUsername = webdav.username
    this.webdavPassword = getWebDavPassword()
    this.#initPromise = listLocalTracks()
      .then((tracks) => { this.tracks = tracks })
      .catch((error) => { this.error = error?.message || '本地曲库读取失败' })
      .finally(() => {
        this.initialized = true
        this.loading = false
        this.#initPromise = null
      })
    return this.#initPromise
  }

  async importFiles(fileList) {
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
        const id = createLocalTrackId(file)
        const metadata = await readLocalMetadata(file)
        const duration = await readDuration(file)
        const artist = metadata.artist || '未知歌手'
        const album = metadata.album || '本地音乐'
        const track = {
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
      this.tracks = await listLocalTracks()
      this.message = `已导入 ${imported} 首${skipped ? `，跳过 ${skipped} 首` : ''}`
      return { imported, skipped }
    } catch (error) {
      try { this.tracks = await listLocalTracks() } catch {}
      this.error = error?.message || '导入失败，请检查存储空间'
      return { imported, skipped }
    } finally {
      this.importing = false
    }
  }

  async remove(id) {
    const target = this.tracks.find((track) => track.id === id)
    if (target?.source !== 'webdav') await removeLocalTrack(id)
    this.tracks = this.tracks.filter((track) => track.id !== id)
  }

  async clear() {
    await clearLocalTracks()
    this.tracks = this.webdavTracks
    this.message = '本地曲库已清空'
  }

  async connectWebDav() {
    this.error = ''
    this.message = ''
    this.webdavLoading = true
    try {
      const settings = saveWebDavSettings({
        url: this.webdavUrl,
        username: this.webdavUsername,
        password: this.webdavPassword,
      })
      const tracks = await listWebDavTracks({
        ...settings,
        password: this.webdavPassword,
      })
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
      this.error = error?.message || 'WebDAV 连接失败'
      return []
    } finally {
      this.webdavLoading = false
    }
  }

  disconnectWebDav() {
    this.tracks = this.localTracks
    this.webdavConnected = false
    this.message = '已断开 WebDAV 曲库'
  }
}

export const localMusic = new LocalMusicState()
