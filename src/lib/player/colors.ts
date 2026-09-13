const MAX_COLOR_CACHE_ENTRIES = 80
const cache = new Map<string, string>()
// 合并同 URL 的并发取色（partial/完整详情会先后请求同一封面）；失败即移除，保留重试机会
const pending = new Map<string, Promise<string | null>>()

function rememberColor(imgUrl: string, color: string): void {
  cache.delete(imgUrl)
  cache.set(imgUrl, color)
  if (cache.size > MAX_COLOR_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value as string)
  }
}

export function extractColor(imgUrl: string): Promise<string | null> {
  const cached = cache.get(imgUrl)
  if (cached !== undefined) return Promise.resolve(cached)
  const inFlight = pending.get(imgUrl)
  if (inFlight) return inFlight

  const promise = new Promise<string | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = imgUrl

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 50
        canvas.height = 50
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0, 50, 50)

        const data = ctx.getImageData(0, 0, 50, 50).data
        let r = 0, g = 0, b = 0, count = 0

        for (let i = 0; i < data.length; i += 16) {
          r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; count++
        }

        r = Math.round(r / count)
        g = Math.round(g / count)
        b = Math.round(b / count)

        const color = `rgb(${r},${g},${b})`
        rememberColor(imgUrl, color)
        resolve(color)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
  }).then((color) => {
    pending.delete(imgUrl)
    return color
  })

  pending.set(imgUrl, promise)
  return promise
}
