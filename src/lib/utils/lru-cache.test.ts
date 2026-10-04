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
assertEqual(cache.age('a'), 0, 'new cached values have zero age')

clock = 35
assertEqual(cache.age('a'), 35, 'reports cache freshness without consuming the entry')
assertEqual(cache.get('a'), 1, 'age lookup keeps the cached value readable')

cache.set('c', 3)
assertEqual(cache.get('b'), null, 'evicts the least recently used value')
assertEqual(cache.get('a'), 1, 'keeps a recently accessed value')

clock = 101
assertEqual(cache.get('a'), null, 'expires values after the TTL')
assertEqual(cache.age('c'), null, 'age lookup also removes expired values')

console.log(`\nlru-cache: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
