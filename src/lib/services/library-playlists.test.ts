import assert from 'node:assert/strict'
import { loadLibraryPlaylists } from './library-playlists.ts'

const all = Array.from({ length: 230 }, (_, i) => ({ id: i + 1 }))
const calls: number[] = []
const loaded = await loadLibraryPlaylists(async (_uid, options) => {
  calls.push(options.offset)
  assert.equal(options.limit, 100)
  assert.equal(options.cache, false)
  return { code: 200, playlist: all.slice(options.offset, options.offset + options.limit), more: options.offset + options.limit < all.length }
}, 9)
assert.deepEqual(calls, [0, 100, 200])
assert.deepEqual(loaded, all, 'all pages are retained')

const duplicate = await loadLibraryPlaylists(async (_uid, { offset }) => offset === 0
  ? { playlist: [{ id: 1 }, { id: 2 }], more: true }
  : { playlist: [{ id: 2 }, { id: 3 }], more: false }, 9)
assert.deepEqual(duplicate, [{ id: 1 }, { id: 2 }, { id: 3 }], 'overlapping pages are deduplicated')
await assert.rejects(() => loadLibraryPlaylists(async () => ({ playlist: [{ id: 1 }], more: true }), 9), /没有继续推进/)
await assert.rejects(() => loadLibraryPlaylists(async (_uid, { offset }) => offset === 0
  ? { playlist: [{ id: 1 }], more: true }
  : Promise.reject(new Error('offline')), 9), /offline/, 'a failed later page does not return partial data')
await assert.rejects(() => loadLibraryPlaylists(async () => ({ code: 500, message: 'failed' }), 9), /failed/)
await assert.rejects(() => loadLibraryPlaylists(async () => ({ code: 200 }), 9), /列表缺失/)
let current = true
let count = 0
await assert.rejects(() => loadLibraryPlaylists(async () => { count++; current = false; return { playlist: [], more: false } }, 9, () => current), /已取消/)
assert.equal(count, 1, 'a stale account cannot trigger another page')
let boundedCalls = 0
await assert.rejects(() => loadLibraryPlaylists(async (_uid, { offset }) => {
  boundedCalls++
  return { playlist: [{ id: offset + 1 }], more: true }
}, 9), /超出当前加载上限/)
assert.equal(boundedCalls, 100, 'an endlessly paginating server cannot cause unbounded requests')
console.log('library playlists: pagination, deduplication, errors and account cancellation passed')
