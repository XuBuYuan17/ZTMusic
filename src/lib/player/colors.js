const MAX_COLOR_CACHE_ENTRIES = 80
let cache = new Map()

function rememberColor(imgUrl, color) {
  cache.delete(imgUrl)
  cache.set(imgUrl, color)
  if (cache.size > MAX_COLOR_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value)
  }
}

export function extractColor(imgUrl) {
  if (cache.has(imgUrl)) return cache.get(imgUrl)

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = imgUrl

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 50
        canvas.height = 50
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, 50, 50)

        const data = ctx.getImageData(0, 0, 50, 50).data
        let r = 0, g = 0, b = 0, count = 0

        for (let i = 0; i < data.length; i += 16) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++
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
  })
}
