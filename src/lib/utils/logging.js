export function debugLog(scope, type, payload = {}) {
  const enabled =
    (typeof import.meta !== 'undefined' && import.meta.env?.DEV) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('debug_playback') === 'true')
  if (!enabled || typeof console === 'undefined') return
  console.debug(`[${scope}:${type}]`, payload)
}

export function swallowError(context, err) {
  if (err) console.warn(`[${context}] (swallowed)`, err?.message || String(err))
}
