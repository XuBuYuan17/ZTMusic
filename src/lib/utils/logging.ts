export function debugLog(scope: string, type: string, payload: unknown = {}): void {
  const enabled =
    (typeof import.meta !== 'undefined' && import.meta.env?.DEV) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('debug_playback') === 'true')
  if (!enabled || typeof console === 'undefined') return
  console.debug(`[${scope}:${type}]`, payload)
}

/** 从任意抛出值取 message 字段，取不到就字符串化 */
export function describeError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return String(err)
}

export function swallowError(context: string, err: unknown): void {
  if (err) console.warn(`[${context}] (swallowed)`, describeError(err))
}
