export type MediaBackend = 'web' | 'native'

export function selectMediaBackend(tauriRuntime: boolean, platform: string = ''): MediaBackend {
  if (!tauriRuntime) return 'web'
  return /Linux|Win/i.test(platform) ? 'native' : 'web'
}
