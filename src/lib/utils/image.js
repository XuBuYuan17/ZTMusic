export function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  // 只允许 http/https 进 <img src>，防止 data:/javascript: 等被注入到 UI（信任边界）
  if (!/^https?:\/\//i.test(trimmed)) return ''
  return trimmed.replace(/^http:\/\/([^/?#]+\.music\.126\.net)([/?#]|$)/i, 'https://$1$2')
}

function withParam(url, param) {
  const normalized = normalizeImageUrl(url)
  if (!normalized) return ''
  try {
    const parsed = new URL(normalized)
    parsed.searchParams.set('param', param)
    return parsed.toString()
  } catch {
    const [base, hash = ''] = normalized.split('#')
    const joiner = base.includes('?') ? '&' : '?'
    return `${base}${joiner}param=${param}${hash ? `#${hash}` : ''}`
  }
}

export function coverUrl(url, size = 200) {
  return withParam(url, `${size}y${size}`)
}

export function coverRectUrl(url, width = 800, height = 400) {
  return withParam(url, `${width}y${height}`)
}
