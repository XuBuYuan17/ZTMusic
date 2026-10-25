/**
 * 歌单页访问状态暂存自检。
 * 跑法：node --experimental-strip-types src/lib/pages/playlist-view-state.test.ts
 * 退出码：0 = 过，1 = 挂。
 */
import assert from 'node:assert/strict'
import {
  clearPlaylistViewStates,
  playlistViewKey,
  recallPlaylistView,
  rememberPlaylistView,
} from './playlist-view-state.ts'

// ── key 由「类型 + id」组成，避免歌单/专辑同号串味 ──
assert.equal(playlistViewKey('playlist', 123), 'playlist:123')
assert.equal(playlistViewKey('album', 123), 'album:123')
assert.notEqual(playlistViewKey('playlist', 123), playlistViewKey('album', 123))
assert.equal(playlistViewKey('playlist', null), '', '没有资源时不产生 key')
assert.equal(playlistViewKey('playlist', ''), '', '空 id 不产生 key')

// ── 同一资源重新挂载后能取回（布局切换场景） ──
rememberPlaylistView('playlist:1', { search: '夏', sort: 'artist', dir: 'asc' })
assert.deepEqual(recallPlaylistView('playlist:1'), { search: '夏', sort: 'artist', dir: 'asc' })

// ── 新资源不继承上一个资源的筛选 ──
assert.equal(recallPlaylistView('playlist:2'), undefined, 'new resource must start from defaults')
assert.equal(recallPlaylistView('album:1'), undefined, 'same id, different kind must not inherit')

// ── 覆盖写入 ──
rememberPlaylistView('playlist:1', { search: '', sort: 'added', dir: 'desc' })
assert.deepEqual(recallPlaylistView('playlist:1'), { search: '', sort: 'added', dir: 'desc' })

// ── 容量上限：超过 8 个资源后淘汰最早的，当前 key 永不被淘汰 ──
clearPlaylistViewStates()
for (let i = 1; i <= 8; i++) rememberPlaylistView(`playlist:${i}`, { search: `q${i}`, sort: 'title', dir: 'asc' })
assert.equal(recallPlaylistView('playlist:1')?.search, 'q1', 'within limit nothing is evicted')
rememberPlaylistView('playlist:9', { search: 'q9', sort: 'title', dir: 'asc' })
assert.equal(recallPlaylistView('playlist:1'), undefined, 'oldest entry is evicted past the limit')
assert.equal(recallPlaylistView('playlist:9')?.search, 'q9')

// ── 空 key 写入被忽略 ──
clearPlaylistViewStates()
rememberPlaylistView('', { search: 'x', sort: 'title', dir: 'asc' })
assert.equal(recallPlaylistView(''), undefined)

console.log('playlist view state: per-resource isolation, remount restore and eviction passed')
