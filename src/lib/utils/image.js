export function coverUrl(url, size = 200) {
  if (!url) return ''
  const joiner = url.includes('?') ? '&' : '?'
  return `${url}${joiner}param=${size}y${size}`
}

export function coverRectUrl(url, width = 800, height = 400) {
  if (!url) return ''
  const joiner = url.includes('?') ? '&' : '?'
  return `${url}${joiner}param=${width}y${height}`
}
