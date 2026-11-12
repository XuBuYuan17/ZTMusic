export type BannerDestination = { [K in 'song' | 'album' | 'playlist']: { kind: K; id: number } }['song' | 'album' | 'playlist'] | { kind: 'url'; url: string }

export function bannerDestination(banner: { targetId?: number; targetType?: number; url?: string }): BannerDestination | null {
  const id = banner.targetId
  if (Number.isSafeInteger(id) && id! > 0) {
    if (banner.targetType === 1) return { kind: 'song', id: id! }
    if (banner.targetType === 10) return { kind: 'album', id: id! }
    if (banner.targetType === 1000) return { kind: 'playlist', id: id! }
  }
  try {
    const url = new URL(banner.url || '')
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null
    if (['music.163.com', 'www.music.163.com'].includes(url.hostname)) {
      const path = url.hash.startsWith('#/') ? url.hash.slice(1) : url.pathname + url.search
      const match = /^\/(playlist|album|song)\?(?:[^#]*&)?id=(\d+)(?:&|$)/.exec(path)
      if (match) {
        const target = Number(match[2])
        if (Number.isSafeInteger(target) && target > 0) return { kind: match[1] as 'song' | 'album' | 'playlist', id: target } as BannerDestination
      }
    }
    return { kind: 'url', url: url.href }
  } catch { return null }
}
