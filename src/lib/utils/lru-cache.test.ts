import { createLruCache } from './lru-cache.ts'

let passed = 0
let failed = 0

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual === expected) passed++
  else {
    console.error(`FAIL: ${message} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  }
}

let clock = 0
const cache = createLruCache<number>({ maxEntries: 2, ttlMs: 100, now: () => clock })
cache.set('a', 1)
cache.set('b', 2)
assertEqual(cache.get('a'), 1, 'returns a cached value')

cache.set('c', 3)
assertEqual(cache.get('b'), null, 'evicts the least recently used value')
assertEqual(cache.get('a'), 1, 'keeps a recently accessed value')

clock = 101
assertEqual(cache.get('a'), null, 'expires values after the TTL')
assertEqual(cache.get('c'), null, 'applies TTL to every cached value')

console.log(`\nlru-cache: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
