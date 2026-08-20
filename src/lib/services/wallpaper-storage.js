const DB_NAME = 'zheting-wallpaper'
const DB_VERSION = 1
const STORE_NAME = 'assets'
const ACTIVE_KEY = 'active'

export const WALLPAPER_LIMITS = {
  image: 30 * 1024 * 1024,
  video: 300 * 1024 * 1024,
}

const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'webp'])
const VIDEO_EXTENSIONS = new Set(['m4v', 'mov', 'mp4', 'ogv', 'webm'])

function extensionOf(name = '') {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] || ''
}

export function classifyWallpaperFile(file) {
  const mime = String(file?.type || '').toLowerCase()
  const extension = extensionOf(file?.name)
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)) return 'video'
  return null
}

export function validateWallpaperFile(file) {
  if (!file) throw new Error('请选择图片或视频文件')
  const kind = classifyWallpaperFile(file)
  if (!kind) throw new Error('仅支持浏览器可播放的图片或视频格式')
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('文件为空或无法读取')
  if (file.size > WALLPAPER_LIMITS[kind]) {
    throw new Error(kind === 'image' ? '图片不能超过 30 MB' : '视频不能超过 300 MB')
  }
  return kind
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('当前环境不支持本地壁纸存储'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开本地壁纸存储'))
  })
}

async function runRequest(mode, action) {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode)
      const request = action(transaction.objectStore(STORE_NAME))
      let result
      request.onsuccess = () => { result = request.result }
      request.onerror = () => reject(request.error || new Error('壁纸存储操作失败'))
      transaction.onabort = () => reject(transaction.error || new Error('壁纸存储事务已中止'))
      transaction.onerror = () => reject(transaction.error || new Error('壁纸存储事务失败'))
      transaction.oncomplete = () => resolve(result)
    })
  } finally {
    db.close()
  }
}

export async function loadWallpaperAsset() {
  return runRequest('readonly', (store) => store.get(ACTIVE_KEY))
}

export async function saveWallpaperAsset(file) {
  const kind = validateWallpaperFile(file)
  const asset = {
    blob: file,
    kind,
    name: file.name || `wallpaper.${kind}`,
    size: file.size,
    type: file.type || '',
    updatedAt: Date.now(),
  }
  await runRequest('readwrite', (store) => store.put(asset, ACTIVE_KEY))
  try { await navigator.storage?.persist?.() } catch {}
  return asset
}

export async function removeWallpaperAsset() {
  await runRequest('readwrite', (store) => store.delete(ACTIVE_KEY))
}

export function formatWallpaperSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}
