import assert from 'node:assert/strict'
import { openExternal } from './open-external.ts'

const calls: unknown[][] = []
Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: (...args: unknown[]) => { calls.push(args) } } })
await openExternal('https://example.com/releases')
assert.deepEqual(calls, [['https://example.com/releases', '_blank', 'noopener,noreferrer']])
await assert.rejects(openExternal('javascript:alert(1)'))
await assert.rejects(openExternal('https://user:password@example.com/'))
assert.equal(calls.length, 1, 'invalid URLs are not opened')
console.log('External links: browser opening and unsafe URL rejection passed')
