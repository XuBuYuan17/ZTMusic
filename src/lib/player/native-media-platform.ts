export type MediaBackend = 'web' | 'native' | 'android'

export function selectMediaBackend(tauriRuntime: boolean, platform: string = ''): MediaBackend {
  if (tauriRuntime && /Android/i.test(platform)) return 'android'
  if (!tauriRuntime || /iPhone|iPad|iPod/i.test(platform)) return 'web'
  return /Linux|Win/i.test(platform) ? 'native' : 'web'
}
