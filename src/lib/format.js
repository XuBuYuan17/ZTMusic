export function formatDuration(ms) {
  if (!ms || isNaN(ms)) return '0:00'
  const t = Math.floor(ms / 1000)
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatPlayCount(n) {
  if (!n) return ''
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万'
  return n.toString()
}
