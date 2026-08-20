import assert from 'node:assert/strict'
import { formatListeningDuration, summarizeLocalListening } from './listening-stats.js'

const now = new Date('2026-08-19T12:00:00+08:00').getTime()
const stats = summarizeLocalListening([
  {
    id: 1,
    artists: [{ name: '甲' }],
    duration: 180_000,
    playedAt: now,
    playCount: 3,
  },
  {
    id: 2,
    artists: [{ name: '乙' }, { name: '甲' }],
    duration: 240_000,
    playedAt: now - 8 * 24 * 60 * 60 * 1000,
  },
], now)

assert.equal(stats.trackCount, 2)
assert.equal(stats.playCount, 4)
assert.equal(stats.totalDuration, 780_000)
assert.equal(stats.durationLabel, '13 分钟')
assert.equal(stats.activeDays, 2)
assert.equal(stats.recentTrackCount, 1)
assert.equal(stats.topArtist, '甲')
assert.equal(formatListeningDuration(3_900_000), '1 小时 5 分钟')
assert.deepEqual(summarizeLocalListening(null), {
  trackCount: 0,
  playCount: 0,
  totalDuration: 0,
  durationLabel: '0 分钟',
  activeDays: 0,
  recentTrackCount: 0,
  topArtist: '暂无记录',
})

console.log('local listening stats: 9 assertions passed')
