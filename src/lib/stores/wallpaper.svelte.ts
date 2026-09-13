import { getBooleanSetting, setBooleanSetting } from '../utils/settings.ts'
import { loadWallpaperAsset, removeWallpaperAsset, saveWallpaperAsset } from '../services/wallpaper-storage.ts'

type WallpaperKind = 'image' | 'video'

interface WallpaperAsset {
  blob: Blob
  kind: WallpaperKind
  name?: string
  size?: number
}

function pickErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

class WallpaperState {
  initialized = $state(false)
  loading = $state(false)
  url = $state('')
  kind = $state<WallpaperKind | null>(null)
  name = $state('')
  size = $state(0)
  error = $state('')
  videoPlaying = $state(getBooleanSetting('wallpaper_video_play', 'true'))

  #initPromise: Promise<unknown> | null = null

  get active() { return Boolean(this.url && this.kind) }

  async init(): Promise<void> {
    if (this.initialized) return
    if (this.#initPromise) {
      await this.#initPromise
      return
    }
    this.loading = true
    this.#initPromise = loadWallpaperAsset()
      .then((asset) => {
        const typed = asset as WallpaperAsset | undefined
        if (typed?.blob && (typed.kind === 'image' || typed.kind === 'video')) this.#applyAsset(typed)
      })
      .catch((error: unknown) => { this.error = pickErrorMessage(error, '壁纸读取失败') })
      .finally(() => {
        this.initialized = true
        this.loading = false
        this.#initPromise = null
      })
    await this.#initPromise
  }

  async selectFile(file: File): Promise<boolean> {
    this.loading = true
    this.error = ''
    try {
      const asset = (await saveWallpaperAsset(file)) as WallpaperAsset
      this.#applyAsset(asset)
      return true
    } catch (error) {
      this.error = pickErrorMessage(error, '壁纸保存失败')
      return false
    } finally {
      this.initialized = true
      this.loading = false
    }
  }

  async clear(): Promise<boolean> {
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
      this.error = pickErrorMessage(error, '壁纸移除失败')
      return false
    } finally {
      this.loading = false
    }
  }

  setVideoPlaying(value: boolean): void {
    this.videoPlaying = setBooleanSetting('wallpaper_video_play', value) === 'true'
  }

  reportPlaybackError(): void {
    this.error = '视频格式或编码无法播放，请尝试 MP4（H.264）或 WebM'
  }

  #applyAsset(asset: WallpaperAsset): void {
    this.#revokeUrl()
    this.url = URL.createObjectURL(asset.blob)
    this.kind = asset.kind
    this.name = asset.name || '自定义壁纸'
    this.size = Number(asset.size) || asset.blob.size || 0
    this.error = ''
  }

  #revokeUrl(): void {
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = ''
  }
}

export const wallpaper = new WallpaperState()
