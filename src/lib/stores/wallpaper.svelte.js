import { getBooleanSetting, setBooleanSetting } from '../utils/settings.js'
import { loadWallpaperAsset, removeWallpaperAsset, saveWallpaperAsset } from '../services/wallpaper-storage.js'

class WallpaperState {
  initialized = $state(false)
  loading = $state(false)
  url = $state('')
  kind = $state(null)
  name = $state('')
  size = $state(0)
  error = $state('')
  videoPlaying = $state(getBooleanSetting('wallpaper_video_play', 'true'))

  #initPromise = null

  get active() { return Boolean(this.url && this.kind) }

  async init() {
    if (this.initialized) return
    if (this.#initPromise) return this.#initPromise
    this.loading = true
    this.#initPromise = loadWallpaperAsset()
      .then((asset) => {
        if (asset?.blob && (asset.kind === 'image' || asset.kind === 'video')) this.#applyAsset(asset)
      })
      .catch((error) => { this.error = error?.message || '壁纸读取失败' })
      .finally(() => {
        this.initialized = true
        this.loading = false
        this.#initPromise = null
      })
    return this.#initPromise
  }

  async selectFile(file) {
    this.loading = true
    this.error = ''
    try {
      const asset = await saveWallpaperAsset(file)
      this.#applyAsset(asset)
      return true
    } catch (error) {
      this.error = error?.message || '壁纸保存失败'
      return false
    } finally {
      this.initialized = true
      this.loading = false
    }
  }

  async clear() {
    this.loading = true
    this.error = ''
    try {
      await removeWallpaperAsset()
      this.#revokeUrl()
      this.kind = null
      this.name = ''
      this.size = 0
      return true
    } catch (error) {
      this.error = error?.message || '壁纸移除失败'
      return false
    } finally {
      this.loading = false
    }
  }

  setVideoPlaying(value) {
    this.videoPlaying = setBooleanSetting('wallpaper_video_play', value) === 'true'
  }

  reportPlaybackError() {
    this.error = '视频格式或编码无法播放，请尝试 MP4（H.264）或 WebM'
  }

  #applyAsset(asset) {
    this.#revokeUrl()
    this.url = URL.createObjectURL(asset.blob)
    this.kind = asset.kind
    this.name = asset.name || '自定义壁纸'
    this.size = Number(asset.size) || asset.blob.size || 0
    this.error = ''
  }

  #revokeUrl() {
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = ''
  }
}

export const wallpaper = new WallpaperState()
