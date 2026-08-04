/**
 * API timeout and caller cancellation self-check.
 * Run: node src/lib/api/client-timeout.test.js
 */

import assert from 'node:assert/strict'
import { fetchWithTimeout } from './client.js'

const originalFetch = globalThis.fetch

try {
  globalThis.fetch = (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })

  await assert.rejects(
    fetchWithTimeout('https://example.invalid', {}, 10),
    error => error?.message === 'API request timeout',
    'internal timeout should use the timeout error message',
  )

  const controller = new AbortController()
  const request = fetchWithTimeout('https://example.invalid', {}, 1000, controller.signal)
  controller.abort()
  await assert.rejects(
    request,
    error => error?.name === 'AbortError',
    'caller cancellation should remain distinguishable from timeout',
  )

  console.log('API timeout self-check: 2 assertions passed')
} finally {
  globalThis.fetch = originalFetch
}