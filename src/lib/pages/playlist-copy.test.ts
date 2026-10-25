/**
 * 歌单边界文案自检。
 * 跑法：node --experimental-strip-types src/lib/pages/playlist-copy.test.ts
 * 退出码：0 = 过，1 = 挂。
 */
import assert from 'node:assert/strict'
import { playlistCountLabel, playlistEmptyText } from './playlist-copy.ts'

// ── 空歌单与「没有匹配」必须是两种状态 ──
assert.equal(playlistEmptyText({ loadedCount: 0, hasMore: false }), '这个歌单还没有歌曲', 'empty playlist')
assert.equal(playlistEmptyText({ loadedCount: 0, hasMore: true }), '这个歌单还没有歌曲', 'empty playlist wins over partial')
assert.equal(playlistEmptyText({ loadedCount: 40, hasMore: false }), '没有匹配的歌曲', 'fully loaded, no match')
assert.notEqual(
  playlistEmptyText({ loadedCount: 0, hasMore: false }),
  playlistEmptyText({ loadedCount: 40, hasMore: false }),
  'empty and filtered states must not share the same text',
)

// ── 未加载完时不能描述成全量 ──
const partial = playlistEmptyText({ loadedCount: 40, hasMore: true })
assert.ok(partial.includes('已加载的 40 首'), 'partial no-match text names the loaded range')
assert.ok(partial.includes('加载更多'), 'partial no-match text tells the user more can be loaded')
assert.ok(!partial.includes('没有匹配的歌曲'), 'partial results must not read like a full search')

// ── 计数语义 ──
assert.equal(playlistCountLabel({ visibleCount: 5, loadedCount: 40, hasMore: false }), '匹配 5 首，已加载 40 首')
assert.equal(playlistCountLabel({ visibleCount: 5, loadedCount: 40, hasMore: true }), '匹配 5 首，已加载 40 首，还有未加载的歌曲')
assert.ok(playlistCountLabel({ visibleCount: 0, loadedCount: 0, hasMore: false }).includes('已加载 0 首'))

console.log('playlist copy: empty vs filtered vs partial wording passed')
