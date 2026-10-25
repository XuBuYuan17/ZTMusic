/**
 * 本周常听纯逻辑自检。
 * 跑法：node --experimental-strip-types src/lib/components/weekly-listen.test.ts
 */
import assert from 'node:assert/strict'
import {
  weeklyListenCanExpand,
  weeklyListenRows,
  weeklyListenState,
} from './weekly-listen.ts'

const tracks = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: `歌 ${i + 1}`,
  playCount: (12 - i) * 7,
  ar: [{ name: `歌手 ${i + 1}` }],
}))

// ── 排名与数据顺序一致 ──
const rows = weeklyListenRows(tracks)
assert.equal(rows.length, 8, 'preview shows the limit')
assert.deepEqual(rows.map(r => r.rank), [1, 2, 3, 4, 5, 6, 7, 8])
assert.deepEqual(rows.map(r => r.title), tracks.slice(0, 8).map(t => t.name), 'rank follows data order')
assert.deepEqual(rows.map(r => r.index), [0, 1, 2, 3, 4, 5, 6, 7], 'index is the position in the full list')
assert.equal(rows[0]?.subtitle, '84 次播放', 'play count is formatted')

// ── 展开后能看到完整数据，下标与名次仍对齐 ──
const expanded = weeklyListenRows(tracks, { expanded: true })
assert.equal(expanded.length, 12, 'expanded shows everything')
assert.deepEqual(expanded.map(r => r.rank), Array.from({ length: 12 }, (_, i) => i + 1))
assert.deepEqual(expanded.map(r => r.index), Array.from({ length: 12 }, (_, i) => i))
assert.equal(weeklyListenCanExpand(12), true)
assert.equal(weeklyListenCanExpand(8), false, 'no expand control when everything is visible')

// ── 请求失败 ≠ 没有听歌 ──
assert.equal(weeklyListenState({ failed: true, loading: false, count: 0 }), 'failed')
assert.equal(weeklyListenState({ failed: false, loading: false, count: 0 }), 'empty')
assert.notEqual(
  weeklyListenState({ failed: true, loading: false, count: 0 }),
  weeklyListenState({ failed: false, loading: false, count: 0 }),
  'failure must not look like an empty week',
)
assert.equal(weeklyListenState({ failed: true, loading: true, count: 0 }), 'failed', 'failure wins over loading')
assert.equal(weeklyListenState({ failed: false, loading: true, count: 0 }), 'loading')
assert.equal(weeklyListenState({ failed: false, loading: false, count: 3 }), 'ready')

// ── 空数据行不会崩 ──
assert.deepEqual(weeklyListenRows([]), [])
assert.equal(weeklyListenRows([{ id: 1 }])[0]?.subtitle, '0 次播放')

console.log('weekly listen: rank order, expand slice and failure state passed')
