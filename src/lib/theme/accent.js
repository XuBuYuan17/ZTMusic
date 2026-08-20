export const ACCENT_THEME_OPTIONS = [
  { value: 'red', label: '哲听红', preview: '#ff453a' },
  { value: 'berry', label: '莓果', preview: '#e54887' },
  { value: 'violet', label: '紫罗兰', preview: '#9b6cff' },
  { value: 'blue', label: '海蓝', preview: '#3185ff' },
  { value: 'teal', label: '青绿', preview: '#18a999' },
  { value: 'orange', label: '暖橙', preview: '#f28522' },
  { value: 'cover', label: '跟随封面', preview: 'linear-gradient(135deg,#ff453a,#9b6cff,#3185ff)' },
]

const PRESETS = {
  red: { r: 230, g: 0, b: 18 },
  berry: { r: 204, g: 38, b: 105 },
  violet: { r: 119, g: 67, b: 214 },
  blue: { r: 0, g: 105, b: 218 },
  teal: { r: 0, g: 132, b: 117 },
  orange: { r: 207, g: 92, b: 0 },
}

const extractionCache = new Map()

export function normalizeAccentTheme(value) {
  return ACCENT_THEME_OPTIONS.some(option => option.value === value) ? value : 'red'
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0
  if (delta) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }
  if (h < 0) h += 360
  const l = (max + min) / 2
  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0
  return { h, s, l }
}

function hslToRgb({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] = hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
      : hp < 3 ? [0, c, x]
        : hp < 4 ? [0, x, c]
          : hp < 5 ? [x, 0, c]
            : [c, 0, x]
  const m = l - c / 2
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}

export function adaptAccentColor(color, theme = 'dark') {
  const hsl = rgbToHsl(color)
  return hslToRgb({
    h: hsl.h,
    s: Math.min(0.9, Math.max(0.58, hsl.s)),
    l: theme === 'dark'
      ? Math.min(0.66, Math.max(0.58, hsl.l))
      : Math.min(0.5, Math.max(0.42, hsl.l)),
  })
}

export function pickAccentColor(imageData) {
  const bins = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }))
  for (let i = 0; i < imageData.length; i += 16) {
    const color = { r: imageData[i], g: imageData[i + 1], b: imageData[i + 2] }
    const alpha = imageData[i + 3] / 255
    if (alpha < 0.7) continue
    const { h, s, l } = rgbToHsl(color)
    if (s < 0.18 || l < 0.08 || l > 0.92) continue
    const weight = alpha * (0.35 + s) * (1 - Math.abs(l - 0.52))
    const bin = bins[Math.min(23, Math.floor(h / 15))]
    bin.weight += weight
    bin.r += color.r * weight
    bin.g += color.g * weight
    bin.b += color.b * weight
  }
  const best = bins.reduce((winner, bin) => bin.weight > winner.weight ? bin : winner, bins[0])
  if (!best.weight) return null
  return {
    r: Math.round(best.r / best.weight),
    g: Math.round(best.g / best.weight),
    b: Math.round(best.b / best.weight),
  }
}

export function buildAccentProperties(color, theme = 'dark') {
  const main = adaptAccentColor(color, theme)
  const hsl = rgbToHsl(main)
  const hover = hslToRgb({ ...hsl, l: Math.min(0.76, Math.max(0.34, hsl.l + (theme === 'dark' ? 0.08 : -0.07))) })
  const edge = hslToRgb({ h: hsl.h + 28, s: Math.min(0.92, hsl.s + 0.04), l: Math.min(0.7, hsl.l + 0.07) })
  const css = ({ r, g, b }) => `rgb(${r} ${g} ${b})`
  const alpha = (value) => `rgb(${main.r} ${main.g} ${main.b} / ${value})`
  return {
    '--accent': css(main),
    '--accent-hover': css(hover),
    '--accent-bg': alpha(theme === 'dark' ? '0.14' : '0.1'),
    '--accent-bg-hover': alpha(theme === 'dark' ? '0.22' : '0.17'),
    '--accent-gradient': `linear-gradient(135deg, ${css(hover)} 0%, ${css(main)} 56%, ${css(edge)} 100%)`,
  }
}

export function getAccentProperties(name, theme = 'dark', coverColor = null) {
  const normalized = normalizeAccentTheme(name)
  return buildAccentProperties(normalized === 'cover' && coverColor ? coverColor : PRESETS[normalized] || PRESETS.red, theme)
}

export function applyAccentProperties(element, properties) {
  for (const [name, value] of Object.entries(properties)) element.style.setProperty(name, value)
}

export async function extractCoverAccent(url) {
  if (!url || typeof Image === 'undefined' || typeof document === 'undefined') return null
  if (extractionCache.has(url)) return extractionCache.get(url)
  const promise = new Promise((resolve) => {
    const image = new Image()
    const timeout = setTimeout(() => resolve(null), 6000)
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      clearTimeout(timeout)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 40
        canvas.height = 40
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0, 40, 40)
        resolve(pickAccentColor(context.getImageData(0, 0, 40, 40).data))
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => {
      clearTimeout(timeout)
      resolve(null)
    }
    image.src = url
  })
  extractionCache.set(url, promise)
  return promise
}
