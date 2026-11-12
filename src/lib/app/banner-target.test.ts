import assert from 'node:assert/strict'
import { bannerDestination } from './banner-target.ts'

assert.deepEqual(bannerDestination({ targetType: 1000, targetId: 42 }), { kind: 'playlist', id: 42 })
assert.deepEqual(bannerDestination({ targetType: 10, targetId: 43 }), { kind: 'album', id: 43 })
assert.deepEqual(bannerDestination({ targetType: 1, targetId: 44 }), { kind: 'song', id: 44 })
assert.deepEqual(bannerDestination({ url: 'https://music.163.com/#/playlist?id=123' }), { kind: 'playlist', id: 123 })
assert.deepEqual(bannerDestination({ url: 'https://music.163.com/album?foo=1&id=123&x=2' }), { kind: 'album', id: 123 })
assert.deepEqual(bannerDestination({ targetType: 3000, url: 'https://y.music.163.com/g/yida/act/example' }), { kind: 'url', url: 'https://y.music.163.com/g/yida/act/example' })
assert.equal(bannerDestination({ url: 'javascript:alert(1)' }), null)
assert.equal(bannerDestination({ url: 'https://user:password@example.com/' }), null)
assert.equal(bannerDestination({ url: 'orpheus://playlist/123' }), null)
assert.equal(bannerDestination({ targetType: 1000, targetId: -1 }), null)
console.log('Banner destinations: internal targets, activity URLs and invalid links passed')
