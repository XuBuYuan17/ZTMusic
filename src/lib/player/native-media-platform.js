export function selectMediaBackend(tauriRuntime, platform = '') {
  if (!tauriRuntime) return 'web'
  return /Linux|Win/i.test(platform) ? 'native' : 'web'
}
