/**
 * 快捷入口构建器自检：两端共用同一份定义，数量/文案/目标不能跑偏。
 * 跑法：node --experimental-strip-types src/lib/components/profile-quick-entries.test.ts
 */
import assert from 'node:assert/strict'
import { buildProfileQuickEntries } from './profile-quick-entries.ts'

const calls: string[] = []
const entries = buildProfileQuickEntries({
  likedCount: 128,
  statsText: '42 次 · 3 小时 20 分钟',
  statsError: false,
  recentCount: 8,
  onOpenFavorites: () => calls.push('favorites'),
  onOpenStats: () => calls.push('stats'),
  onOpenRecent: () => calls.push('recent'),
  onOpenDaily: () => calls.push('daily'),
})

// ── 数量与顺序固定 ──
assert.equal(entries.length, 4, 'four quick entries')
assert.deepEqual(entries.map(e => e.id), ['favorites', 'stats', 'recent', 'daily'])
assert.deepEqual(entries.map(e => e.title), ['喜欢的音乐', '本地听歌统计', '最近播放', '历史日推'])
assert.deepEqual(entries.map(e => e.label), ['FAVORITES', 'ON THIS DEVICE', 'CONTINUE', 'DAILY'])

// ── 文案 ──
const values = entries.map(e => e.value)
assert.deepEqual(values, ['128 首', '42 次 · 3 小时 20 分钟', '8 首记录', '回看每天为你推送的歌'])

// ── 目标：每个入口都指向自己的回调 ──
for (const entry of entries) entry.onSelect()
assert.deepEqual(calls, ['favorites', 'stats', 'recent', 'daily'])

// ── 统计缺失 / 失败时的兜底文案 ──
const empty = buildProfileQuickEntries({
  likedCount: 0, statsText: '', statsError: false, recentCount: 0,
  onOpenFavorites() {}, onOpenStats() {}, onOpenRecent() {}, onOpenDaily() {},
})
const emptyValues = empty.map(e => e.value)
assert.equal(emptyValues[1], '开始记录你的聆听', 'no local stats yet')
assert.equal(emptyValues[0], '0 首')

const failed = buildProfileQuickEntries({
  likedCount: 1, statsText: 'ignored', statsError: true, recentCount: 1,
  onOpenFavorites() {}, onOpenStats() {}, onOpenRecent() {}, onOpenDaily() {},
})
assert.equal(failed.map(e => e.value)[1], '统计暂不可用 · 点击重试', 'stats error wins over the text')

console.log('profile quick entries: count, copy and targets passed')
