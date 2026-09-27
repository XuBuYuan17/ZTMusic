import assert from 'node:assert/strict'
import { filterAndSortPlaylistTracks } from './playlist-sort.ts'

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

console.log('playlist-sort: 6 checks passed')
