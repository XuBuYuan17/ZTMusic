import assert from 'node:assert/strict'
import { cachedCover, coverUrl, normalizeImageUrl, rememberLoadedCover } from './image.ts'

const source = 'http://p1.music.126.net/example.jpg?token=1'
const normalized = normalizeImageUrl(source)
const small = coverUrl(source, 120)
const medium = coverUrl(source, 400)
const large = coverUrl(source, 640)

assert.ok(normalized.startsWith('https://'))
assert.ok(normalized.startsWith('https://p1.music.126.net/'), 'equivalent NetEase image CDN hosts use one stable URL')
rememberLoadedCover(source, medium, 400)
assert.deepEqual(cachedCover(source), { url: medium, size: 400 })
assert.deepEqual(cachedCover(small), { url: medium, size: 400 }, 'different param sizes share one cover identity')
rememberLoadedCover(source, small, 120)
assert.deepEqual(cachedCover(source), { url: medium, size: 400 }, 'a smaller load cannot downgrade the cached cover')
rememberLoadedCover(source, large, 640)
assert.deepEqual(cachedCover(source), { url: large, size: 640 }, 'a decoded larger cover upgrades the reusable source')

console.log('progressive cover cache: normalized identity, reuse and upgrades passed')
