import QRCode from 'qrcode'
import { coverUrl } from '../utils/image.ts'
import { isTauriRuntime, runtimePlatform } from '../utils/runtime.ts'
import type { SongId } from '../types/music.ts'

export interface SongShareInput {
  id: SongId
  title: string
  artist: string
  album?: string
  cover?: string
  url?: string
}

export type SongShareResult = 'native-image' | 'web-image' | 'web-link' | 'clipboard'

const POSTER_WIDTH = 1080
const POSTER_HEIGHT = 1440
const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "HarmonyOS Sans SC", "Noto Sans SC", sans-serif'

function songUrl(id: SongId, url?: string): string {
  return url || `https://music.163.com/song?id=${encodeURIComponent(String(id))}`
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, minSize: number, weight = 700): number {
  let size = startSize
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${FONT}`
    if (ctx.measureText(text).width <= maxWidth) return size
    size -= 2
  }
  ctx.font = `${weight} ${minSize}px ${FONT}`
  return minSize
}

function drawImageCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, size: number): void {
  ctx.save()
  roundedRect(ctx, x, y, size, size, 22)
  ctx.clip()
  ctx.drawImage(image, x, y, size, size)
  ctx.restore()
}

function drawCoverPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size)
  gradient.addColorStop(0, '#29292d')
  gradient.addColorStop(1, '#101012')
  ctx.fillStyle = gradient
  roundedRect(ctx, x, y, size, size, 22)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.78)'
  ctx.font = `700 ${Math.round(size * .14)}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('折听', x + size / 2, y + size / 2)
}

async function loadBitmap(url: string): Promise<ImageBitmap | null> {
  if (!url) return null
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!response.ok) return null
    return await createImageBitmap(await response.blob())
  } catch {
    return null
  }
}

async function loadDataImage(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to render QR image'))
    image.src = dataUrl
  })
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to encode share poster')), 'image/png')
  })
}

/**
 * “折听”分享卡不是把唱片贴在一张背景图上，而是一件真的“折起来的唱片封套”：
 * 黑胶从纸套侧边抽出，右下角折页承载二维码，折痕本身就是品牌语言。
 */
export async function createSongSharePoster(input: SongShareInput): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = POSTER_WIDTH
  canvas.height = POSTER_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')

  const url = songUrl(input.id, input.url)
  const qrData = await QRCode.toDataURL(url, {
    width: 340,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#121214', light: '#f5f0e7' },
  })
  const [cover, qr] = await Promise.all([
    loadBitmap(input.cover ? coverUrl(input.cover, 900) : ''),
    loadDataImage(qrData),
  ])

  // 工作台：不使用随机风景图，让纸、折痕和唱片成为识别物。
  ctx.fillStyle = '#d8d2c8'
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
  const desk = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
  desk.addColorStop(0, 'rgba(255,255,255,.46)')
  desk.addColorStop(.55, 'rgba(255,255,255,.08)')
  desk.addColorStop(1, 'rgba(0,0,0,.08)')
  ctx.fillStyle = desk
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  // 黑胶在纸套后方，只露出右半边，形成“从折页中抽出”的实体关系。
  const discX = 760
  const discY = 405
  const discR = 292
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.32)'
  ctx.shadowBlur = 42
  ctx.shadowOffsetY = 24
  ctx.fillStyle = '#111113'
  ctx.beginPath()
  ctx.arc(discX, discY, discR, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  for (let r = discR - 18; r > 82; r -= 13) {
    ctx.strokeStyle = r % 2 ? 'rgba(255,255,255,.045)' : 'rgba(255,255,255,.025)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(discX, discY, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  const labelR = 84
  ctx.save()
  ctx.beginPath()
  ctx.arc(discX, discY, labelR, 0, Math.PI * 2)
  ctx.clip()
  if (cover) ctx.drawImage(cover, discX - labelR, discY - labelR, labelR * 2, labelR * 2)
  else {
    ctx.fillStyle = '#eee7da'
    ctx.fillRect(discX - labelR, discY - labelR, labelR * 2, labelR * 2)
  }
  ctx.restore()
  ctx.fillStyle = '#d8d2c8'
  ctx.beginPath()
  ctx.arc(discX, discY, 8, 0, Math.PI * 2)
  ctx.fill()

  // 主纸套。
  const sleeveX = 72
  const sleeveY = 104
  const sleeveW = 720
  const sleeveH = 1030
  ctx.save()
  ctx.shadowColor = 'rgba(41,31,22,.24)'
  ctx.shadowBlur = 36
  ctx.shadowOffsetY = 22
  ctx.fillStyle = '#f5f0e7'
  roundedRect(ctx, sleeveX, sleeveY, sleeveW, sleeveH, 28)
  ctx.fill()
  ctx.restore()

  // 左侧装订/折线是整套模板固定的识别元素。
  ctx.strokeStyle = 'rgba(24,22,20,.16)'
  ctx.lineWidth = 2
  ctx.setLineDash([9, 10])
  ctx.beginPath()
  ctx.moveTo(sleeveX + 42, sleeveY + 38)
  ctx.lineTo(sleeveX + 42, sleeveY + sleeveH - 38)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#161618'
  ctx.font = `700 22px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillText('ZTMUSIC / 折听', sleeveX + 72, sleeveY + 58)

  const coverX = sleeveX + 72
  const coverY = sleeveY + 104
  const coverSize = 438
  if (cover) drawImageCover(ctx, cover, coverX, coverY, coverSize)
  else drawCoverPlaceholder(ctx, coverX, coverY, coverSize)

  // 小号目录编号，让它更像可收藏的唱片封套，而不是常规社交海报。
  ctx.fillStyle = 'rgba(20,20,22,.5)'
  ctx.font = `600 18px ${FONT}`
  ctx.fillText(`ZT / SONG ${String(input.id).slice(-8).padStart(8, '0')}`, coverX, coverY + coverSize + 46)

  const title = input.title || '未命名歌曲'
  const titleSize = fitText(ctx, title, 575, 66, 42, 760)
  ctx.fillStyle = '#151517'
  ctx.font = `760 ${titleSize}px ${FONT}`
  ctx.fillText(title, coverX, coverY + coverSize + 126)

  const artistLine = [input.artist, input.album].filter(Boolean).join(' · ') || '折听音乐'
  fitText(ctx, artistLine, 560, 28, 20, 520)
  ctx.fillStyle = 'rgba(21,21,23,.62)'
  ctx.fillText(artistLine, coverX, coverY + coverSize + 174)

  // 右下角是真正“折”出来的二维码页：先画折痕，再压一层纸片。
  const foldTop = sleeveY + 728
  ctx.strokeStyle = 'rgba(26,23,19,.2)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(sleeveX + 470, foldTop)
  ctx.lineTo(sleeveX + sleeveW, foldTop + 218)
  ctx.stroke()

  ctx.fillStyle = '#e7ded0'
  ctx.beginPath()
  ctx.moveTo(sleeveX + 470, foldTop)
  ctx.lineTo(sleeveX + sleeveW, foldTop + 218)
  ctx.lineTo(sleeveX + sleeveW, sleeveY + sleeveH)
  ctx.lineTo(sleeveX + 430, sleeveY + sleeveH)
  ctx.closePath()
  ctx.fill()

  const qrSize = 184
  const qrX = sleeveX + sleeveW - qrSize - 34
  const qrY = sleeveY + sleeveH - qrSize - 34
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize)

  ctx.fillStyle = '#151517'
  ctx.font = `700 25px ${FONT}`
  ctx.fillText('扫码一起听', coverX, sleeveY + sleeveH - 118)
  ctx.fillStyle = 'rgba(21,21,23,.54)'
  ctx.font = `500 19px ${FONT}`
  ctx.fillText('把唱片翻开，音乐就在里面。', coverX, sleeveY + sleeveH - 78)

  // 海报底部只留品牌与来源，不用装饰性鸡汤文案。
  ctx.fillStyle = '#171719'
  ctx.font = `760 31px ${FONT}`
  ctx.fillText('折听音乐', 78, 1242)
  ctx.fillStyle = 'rgba(23,23,25,.52)'
  ctx.font = `540 19px ${FONT}`
  ctx.fillText('ZTMusic · 来自 网易云音乐', 78, 1282)
  ctx.textAlign = 'right'
  ctx.font = `600 17px ${FONT}`
  ctx.fillText('FOLD · LISTEN · KEEP', 1002, 1282)

  // 轻微纸张颗粒，避免大面积纯色像网页截图；强度刻意很低，二维码区域不会被覆盖。
  ctx.globalAlpha = .055
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * POSTER_WIDTH
    const y = Math.random() * POSTER_HEIGHT
    if (x > qrX - 10 && x < qrX + qrSize + 10 && y > qrY - 10 && y < qrY + qrSize + 10) continue
    ctx.fillStyle = i % 2 ? '#000' : '#fff'
    ctx.fillRect(x, y, 1.2, 1.2)
  }
  ctx.globalAlpha = 1

  cover?.close()
  return await canvasBlob(canvas)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 8192
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

async function shareWithAndroid(blob: Blob, input: SongShareInput, url: string, text: string): Promise<boolean> {
  if (!isTauriRuntime() || !/Android/i.test(runtimePlatform())) return false
  const { invoke } = await import('@tauri-apps/api/core')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  await invoke('plugin:zt-player|execute', {
    payload: {
      action: 'shareImage',
      data: {
        bytes: bytesToBase64(bytes),
        mime: 'image/png',
        fileName: `zheting-${String(input.id).replace(/[^a-zA-Z0-9_-]/g, '') || 'song'}.png`,
        title: input.title || '分享歌曲',
        text,
        url,
      },
    },
  })
  return true
}

export async function shareSong(input: SongShareInput): Promise<SongShareResult> {
  const url = songUrl(input.id, input.url)
  const title = input.title || '折听歌曲'
  const text = input.artist ? `${title} - ${input.artist}` : title
  const poster = await createSongSharePoster(input)

  if (await shareWithAndroid(poster, input, url, text)) return 'native-image'

  const file = new File([poster], `zheting-${String(input.id)}.png`, { type: 'image/png' })
  const canShare = typeof navigator.share === 'function'
  if (canShare) {
    const imagePayload = { title, text, url, files: [file] }
    const canShareImage = typeof navigator.canShare !== 'function' || navigator.canShare(imagePayload)
    if (canShareImage) {
      await navigator.share(imagePayload)
      return 'web-image'
    }
    await navigator.share({ title, text, url })
    return 'web-link'
  }

  await navigator.clipboard?.writeText(url)
  return 'clipboard'
}
