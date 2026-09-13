/**
 * API timeout and caller cancellation self-check.
 * Run: node src/lib/api/client-timeout.test.ts
 */

import assert from 'node:assert/strict'
import { fetchWithTimeout } from './client.ts'

const originalFetch = globalThis.fetch

function isAbortLike(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError'
}

try {
  globalThis.fetch = (_url: unknown, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })

  await assert.rejects(
    fetchWithTimeout('https://example.invalid', {}, 10),
    (error: unknown) => !!error && typeof error === 'object' && (error as { message?: unknown }).message === 'API request timeout',
    'internal timeout should use the timeout error message',
  )

  const controller = new AbortController()
  const request = fetchWithTimeout('https://example.invalid', {}, 1000, controller.signal)
  controller.abort()
  await assert.rejects(
    request,
    isAbortLike,
    'caller cancellation should remain distinguishable from timeout',
  )

  console.log('API timeout self-check: 2 assertions passed')
} finally {
  globalThis.fetch = originalFetch
}
