export type MediaBackend = 'web' | 'native'

export function selectMediaBackend(tauriRuntime: boolean, platform: string = ''): MediaBackend {
  if (!tauriRuntime || /Android|iPhone|iPad|iPod/i.test(platform)) return 'web'
  return /Linux|Win/i.test(platform) ? 'native' : 'web'
}
