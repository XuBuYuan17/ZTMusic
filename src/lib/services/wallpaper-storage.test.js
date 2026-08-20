import assert from 'node:assert/strict'
import {
  WALLPAPER_LIMITS,
  classifyWallpaperFile,
  formatWallpaperSize,
  validateWallpaperFile,
} from './wallpaper-storage.js'

assert.equal(classifyWallpaperFile({ name: 'cover.webp', type: '' }), 'image')
assert.equal(classifyWallpaperFile({ name: 'loop.bin', type: 'video/mp4' }), 'video')
assert.equal(classifyWallpaperFile({ name: 'notes.txt', type: 'text/plain' }), null)

assert.equal(validateWallpaperFile({ name: 'cover.png', type: 'image/png', size: 1024 }), 'image')
assert.equal(validateWallpaperFile({ name: 'loop.webm', type: 'video/webm', size: 1024 }), 'video')
assert.throws(
  () => validateWallpaperFile({ name: 'large.jpg', type: 'image/jpeg', size: WALLPAPER_LIMITS.image + 1 }),
  /30 MB/,
)
assert.throws(
  () => validateWallpaperFile({ name: 'large.mp4', type: 'video/mp4', size: WALLPAPER_LIMITS.video + 1 }),
  /300 MB/,
)
assert.throws(() => validateWallpaperFile({ name: 'empty.png', type: 'image/png', size: 0 }), /文件为空/)

assert.equal(formatWallpaperSize(1024), '1 KB')
assert.equal(formatWallpaperSize(1536 * 1024), '1.5 MB')

console.log('wallpaper-storage tests passed')
