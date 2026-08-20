export function selectMediaBackend(tauriRuntime, platform = '') {
  if (!tauriRuntime) return 'web'
  if (/Android/i.test(platform)) return 'web'
  return /Linux|Win/i.test(platform) ? 'native' : 'web'
}
