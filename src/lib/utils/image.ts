export function normalizeImageUrl(url: unknown): string {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  // 只允许 http/https 进 <img src>，防止 data:/javascript: 等被注入到 UI（信任边界）
  if (!/^https?:\/\//i.test(trimmed)) return ''
  return trimmed
    .replace(/^http:\/\/([^/?#]+\.music\.126\.net)([/?#]|$)/i, 'https://$1$2')
    .replace(/^https:\/\/p\d+\.music\.126\.net([/?#]|$)/i, 'https://p1.music.126.net$1')
}

function withParam(url: unknown, param: string): string {
  const normalized = normalizeImageUrl(url)
  if (!normalized) return ''
  try {
    const parsed = new URL(normalized)
    parsed.searchParams.set('param', param)
    return parsed.toString()
  } catch {
    const [base, hash = ''] = normalized.split('#')
    const joiner = base!.includes('?') ? '&' : '?'
    return `${base}${joiner}param=${param}${hash ? `#${hash}` : ''}`
  }
}

export function coverUrl(url: unknown, size: number = 200): string {
  return withParam(url, `${size}y${size}`)
}

export function coverRectUrl(url: unknown, width: number = 800, height: number = 400): string {
  return withParam(url, `${width}y${height}`)
}

type LoadedCover = { url: string; size: number }
const loadedCovers = new Map<string, LoadedCover>()
const pendingCovers = new Map<string, Promise<string | null>>()
const MAX_LOADED_COVERS = 256

function coverKey(url: unknown): string {
  const normalized = normalizeImageUrl(url)
  if (!normalized) return ''
  try {
    const parsed = new URL(normalized)
    parsed.searchParams.delete('param')
    parsed.hash = ''
    return parsed.toString()
  } catch { return normalized.replace(/([?&])param=[^&#]*&?/i, '$1').replace(/[?&]$/, '') }
}

export function rememberLoadedCover(source: unknown, loadedUrl: string, size: number): void {
  const key = coverKey(source)
  if (!key || !normalizeImageUrl(loadedUrl) || !Number.isFinite(size) || size <= 0) return
  const previous = loadedCovers.get(key)
  if (previous && previous.size > size) return
  loadedCovers.delete(key)
  loadedCovers.set(key, { url: loadedUrl, size })
  if (loadedCovers.size > MAX_LOADED_COVERS) loadedCovers.delete(loadedCovers.keys().next().value!)
}

export function cachedCover(source: unknown): LoadedCover | null {
  const key = coverKey(source)
  const entry = key ? loadedCovers.get(key) : null
  if (!entry || !key) return null
  loadedCovers.delete(key)
  loadedCovers.set(key, entry)
  return entry
}

export function preloadCover(source: unknown, size: number): Promise<string | null> {
  const target = coverUrl(source, size)
  if (!target || typeof Image === 'undefined') return Promise.resolve(null)
  const existing = pendingCovers.get(target)
  if (existing) return existing
  const pending = new Promise<string | null>((resolve) => {
    const image = new Image()
    image.referrerPolicy = 'no-referrer'
    image.onload = () => { rememberLoadedCover(source, target, size); resolve(target) }
    image.onerror = () => resolve(null)
    image.src = target
  }).finally(() => pendingCovers.delete(target))
  pendingCovers.set(target, pending)
  return pending
}

export function progressiveCover(node: HTMLImageElement, options: { source: unknown; size: number }) {
  let source: unknown = ''
  let displayedSize = 0
  let generation = 0
  const remember = () => rememberLoadedCover(source, node.currentSrc || node.src, displayedSize)
  node.addEventListener('load', remember)

  function display(url: string, size: number) {
    displayedSize = size
    node.src = url
    if (node.complete && node.naturalWidth > 0) queueMicrotask(remember)
  }

  function apply(next: typeof options) {
    const current = ++generation
    source = next.source
    node.dataset.coverSource = normalizeImageUrl(source)
    const size = Math.max(1, Math.round(next.size))
    const target = coverUrl(source, size)
    const cached = cachedCover(source)
    if (!target) { node.removeAttribute('src'); return }
    if (!cached) { display(target, size); return }
    display(cached.url, cached.size)
    if (cached.size >= size || cached.url === target) return
    void preloadCover(source, size).then((url) => {
      if (!url) return
      if (current !== generation) return
      display(url, size)
    })
  }

  apply(options)
  return {
    update: apply,
    destroy() { generation++; node.removeEventListener('load', remember); delete node.dataset.coverSource },
  }
}
