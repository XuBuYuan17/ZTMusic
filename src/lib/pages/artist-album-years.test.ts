import assert from 'node:assert/strict'
import { groupArtistAlbumsByYear } from './artist-album-years.ts'

const albums = [
  { id: 1, publishTime: 'invalid' },
  { id: 2, publishTime: '2024-06-24' },
  { id: 3, publishTime: Date.UTC(2026, 5, 24) },
  { id: 4, publishTime: String(Date.UTC(2026, 6, 24)) },
  { id: 5, publishTime: 0 },
  { id: 6, publishTime: null },
]

const groups = groupArtistAlbumsByYear(albums)
assert.deepEqual(groups.map(({ year, albums }) => [year, albums.map(album => album.id)]), [
  [2026, [3, 4]],
  [2024, [2]],
  [null, [1, 5, 6]],
])
assert.deepEqual(groupArtistAlbumsByYear([]), [])
console.log('artist albums: years descending, source order within each year, missing dates last')
