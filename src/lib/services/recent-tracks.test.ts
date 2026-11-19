import assert from 'node:assert/strict'
import { normalizeLocalHistorySong } from '../utils/normalize.ts'

Object.assign(globalThis, { $state: (value: unknown) => value })
const { mergeRecentTracks } = await import('./home.ts')

const local = [
  normalizeLocalHistorySong({ id: 4, name: '刚刚在哲听播放', playedAt: 1_800_000_003_000 }),
  normalizeLocalHistorySong({ id: 1, name: '更早的本机记录', playedAt: 1_800_000_000_000 }),
  normalizeLocalHistorySong({ id: 'local:2', name: '本地文件', playedAt: 1_800_000_001_000, source: 'local', localId: 'local:2' }),
]
const cloud = {
  code: 200,
  data: { list: [
    { playTime: 1_800_000_002_000, data: { id: '1', name: '同一首的较新云端记录' } },
    { playTime: 1_800_000_000_500, data: { id: 2, name: '云端歌曲' } },
    { playTime: 1_800_000_000_400, data: {} },
  ] },
}
const merged = mergeRecentTracks(local, cloud)
assert.deepEqual(merged.map(track => track.id), [4, '1', 'local:2', 2])
assert.equal(merged[1]?.name, '同一首的较新云端记录')
assert.equal(merged[2]?.localId, 'local:2')
assert.deepEqual(mergeRecentTracks(local, { ...cloud, code: 502 }).map(track => track.id), [4, 'local:2', 1])
console.log('Recent tracks: chronological local and cloud history, deduplication and cloud failure fallback passed')
