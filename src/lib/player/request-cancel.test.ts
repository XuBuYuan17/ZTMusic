import assert from 'node:assert/strict'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} })
const { getPlayableUrls } = await import('./url-resolver.ts')
const originalFetch = globalThis.fetch

try {
  for (const phase of ['headers', 'body']) {
    const controller = new AbortController()
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    let transportSignal: AbortSignal | null = null
    let calls = 0
    globalThis.fetch = (async (_url, options) => {
      calls++
      transportSignal = options?.signal as AbortSignal
      if (phase === 'body') return {
        ok: true, status: 200,
        json: () => { started(); return new Promise(() => {}) },
      } as Response
      started()
      return new Promise<Response>((_resolve, reject) => {
        transportSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    }) as typeof fetch
    const resolution = getPlayableUrls(1, 'lossless', new Map(), 1, {}, controller.signal, true)
    await ready
    controller.abort()
    const result = await resolution
    assert.deepEqual(result.urls, [], `${phase} cancellation must discard the source`)
    assert.equal((transportSignal as AbortSignal | null)?.aborted, true, `${phase} cancellation must reach the actual fetch`)
    assert.equal(calls, 1, 'cancellation must not start the next quality or retry')
  }
} finally {
  globalThis.fetch = originalFetch
}

console.log('Playback request cancellation: resolver → provider → API → fetch headers and body passed')
