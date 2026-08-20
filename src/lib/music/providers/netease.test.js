import assert from 'node:assert/strict'
import { createNeteaseProvider } from './netease.js'

const calls = []
const provider = createNeteaseProvider({
  async cloudsearch(query, limit, offset) {
    calls.push(['songs', query, limit, offset])
    return { result: { songs: [{ id: 1, name: 'Song', ar: [{ id: 2, name: 'Artist' }], al: { id: 3, name: 'Album', picUrl: 'cover' }, dt: 1234 }] } }
  },
  async searchArtists() {
    return { result: { artists: [{ id: 2, name: 'Artist', img1v1Url: 'artist', musicSize: 8, albumSize: 4 }] } }
  },
  async searchPlaylists() {
    return { result: { playlists: [{ id: 4, name: 'List', coverImgUrl: 'list', trackCount: 9, creator: { nickname: 'User' } }] } }
  },
  async searchHot() {
    return { result: { hots: [{ first: 'Hot' }] } }
  },
  async topSongs() {
    return { data: [{ id: 5, name: 'Top', artists: [], album: { picUrl: 'top' }, duration: 88 }] }
  },
  async lyric() {
    return { lrc: { lyric: '[00:01.00]Line' }, tlyric: { lyric: '[00:01.00]译文' } }
  },
  async songUrl(_id, level, unblock) {
    return { data: [{ url: `http://stream/${level}/${unblock}`, freeTrialInfo: unblock ? { start: 0 } : null }] }
  },
  async songUrlMatch() {
    return { data: [{ url: 'http://match' }] }
  },
  async songUrlOld() {
    return { data: [{ url: 'http://legacy' }] }
  },
  async songDetail() {
    return { songs: [{ id: 6, name: 'Detail', ar: [], al: { picUrl: 'detail' } }] }
  },
  async playlistDetail() {
    return { playlist: { id: 7, name: 'Playlist', coverImgUrl: 'playlist', tracks: [{ id: 6, name: 'Detail' }], trackIds: [{ id: 6 }] } }
  },
  async album() {
    return { album: { id: 8, name: 'Album', picUrl: 'album' }, songs: [{ id: 6, name: 'Detail' }] }
  },
  async artistDetail() {
    return { data: { artist: { id: 9, name: 'Artist', cover: 'artist-cover' } } }
  },
  async artistSongs() {
    return { songs: [{ id: 6, name: 'Detail' }] }
  },
  async artistAlbums() {
    return { hotAlbums: [{ id: 8, name: 'Album', picUrl: 'album' }] }
  },
})

const result = await provider.search(' query ', { songLimit: 5, artistLimit: 6, playlistLimit: 7, offset: 2 })
assert.deepEqual(calls[0], ['songs', 'query', 5, 2])
assert.equal(result.songs[0].providerId, 'netease')
assert.equal(result.songs[0].artists[0].name, 'Artist')
assert.equal(result.songs[0].album.coverUrl, 'cover')
assert.equal(result.songs[0].durationMs, 1234)
assert.equal(result.artists[0].imageUrl, 'artist')
assert.equal(result.playlists[0].creatorName, 'User')
assert.deepEqual(await provider.getHotSearch(), [{ keyword: 'Hot', score: 0 }])
assert.equal((await provider.getTopSongs(1))[0].coverUrl, 'top')
assert.deepEqual(await provider.search('  '), { songs: [], artists: [], playlists: [] })
assert.deepEqual(await provider.getLyrics(1), [{ time: 1, text: 'Line', translation: '译文' }])
assert.equal((await provider.getStream(1, { level: 'lossless', unblock: true })).isTrial, true)
assert.equal((await provider.getMatchedStream(1)).source, 'match')
assert.equal((await provider.getLegacyStream(1)).cacheable, false)
assert.equal((await provider.getTracks([6]))[0].coverUrl, 'detail')
assert.equal((await provider.getPlaylist(7)).tracks[0].providerId, 'netease')
assert.equal((await provider.getAlbum(8)).album.coverUrl, 'album')
const artistDetail = await provider.getArtist(9)
assert.equal(artistDetail.artist.imageUrl, 'artist-cover')
assert.equal(artistDetail.songs[0].providerId, 'netease')
assert.equal(artistDetail.albums[0].coverUrl, 'album')

console.log('netease provider adapter: 20 assertions passed')
