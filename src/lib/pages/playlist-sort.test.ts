import assert from 'node:assert/strict'
import {
  filterAndSortPlaylistTracks,
  playlistAriaSort,
  playlistSortDirectionLabel,
  playlistSortLabel,
} from './playlist-sort.ts'

const tracks = [
  { name: 'Bravo', ar: [{ name: 'Charlie' }], dt: 200, addTime: 20, playlistIndex: 0 },
  { name: 'alpha', ar: [{ name: 'Delta' }], dt: 100, addTime: 10, playlistIndex: 1 },
  { name: 'Charlie', ar: [{ name: 'Alpha' }], dt: 300, playlistIndex: 2 },
]

assert.deepEqual(filterAndSortPlaylistTracks(tracks, '', 'title', 'asc').map(track => track.name), ['alpha', 'Bravo', 'Charlie'])
assert.deepEqual(filterAndSortPlaylistTracks(tracks, '', 'artist', 'asc').map(track => track.name), ['Charlie', 'Bravo', 'alpha'])
assert.deepEqual(filterAndSortPlaylistTracks(tracks, '', 'duration', 'desc').map(track => track.name), ['Charlie', 'Bravo', 'alpha'])
assert.deepEqual(filterAndSortPlaylistTracks(tracks, '', 'added', 'asc').map(track => track.name), ['alpha', 'Bravo', 'Charlie'])
assert.deepEqual(filterAndSortPlaylistTracks(tracks, '', 'added', 'desc').map(track => track.name), ['Bravo', 'alpha', 'Charlie'])
assert.deepEqual(filterAndSortPlaylistTracks(tracks, 'DELTA', 'title', 'asc').map(track => track.name), ['alpha'])

// 工具栏与表头共用的标签函数
assert.equal(playlistSortLabel('added'), '加入时间')
assert.equal(playlistSortLabel('duration'), '时长')
assert.equal(playlistSortDirectionLabel('added', 'desc'), '最新优先')
assert.equal(playlistSortDirectionLabel('added', 'asc'), '最早优先')
assert.equal(playlistSortDirectionLabel('title', 'asc'), 'A 到 Z')
assert.equal(playlistAriaSort('title', 'desc', 'title'), 'descending')
assert.equal(playlistAriaSort('title', 'desc', 'artist'), 'none')

console.log('playlist-sort: 13 checks passed')
