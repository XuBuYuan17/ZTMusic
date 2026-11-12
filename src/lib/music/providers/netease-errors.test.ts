import assert from 'node:assert/strict'
import { createNeteaseProvider, type NeteaseApi } from './netease.ts'

const api: NeteaseApi = {
  cloudsearch: async () => ({ result: { songs: [] } }),
  searchArtists: async () => ({ result: { artists: [] } }),
  searchPlaylists: async () => ({ result: { playlists: [] } }),
  searchHot: async () => ({ result: { hots: [] } }),
  topSongs: async () => ({ data: [] }),
  lyric: async () => ({ lrc: { lyric: '' } }),
  songUrl: async () => ({ data: [] }),
  songUrlMatch: async () => ({ data: [] }),
  songUrlOld: async () => ({ data: [] }),
  songDetail: async () => ({ code: 200, songs: [] }),
  playlistDetail: async () => ({ code: 200, playlist: null }),
  album: async () => ({ code: 200, album: {}, songs: [] }),
  artistDetail: async () => ({ code: 200, data: { artist: {} } }),
  artistSongs: async () => ({ code: 200, songs: [] }),
  artistAlbums: async () => ({ code: 200, hotAlbums: [] }),
}
const provider = createNeteaseProvider(api)

for (const code of [502, 301, -1]) {
  api.songDetail = async () => ({ code, message: 'Synthetic response failure' })
  await assert.rejects(provider.getTracks([1]), /Synthetic response failure/, `business error ${code} must not become an empty successful page`)
}
api.songDetail = async () => ({ code: 200, songs: [] })
assert.deepEqual(await provider.getTracks([1]), [], 'successful missing songs remain a valid empty result')
api.songDetail = async () => ({ code: 200 })
await assert.rejects(provider.getTracks([1]), /songs/, 'malformed successful detail responses must be retryable failures')
api.playlistDetail = async () => ({ code: 502, message: 'Playlist service unavailable' })
await assert.rejects(provider.getPlaylist(1), /Playlist service unavailable/)
api.lyric = async () => ({ code: -1, message: 'Response was not JSON' })
await assert.rejects(provider.getLyrics(1), /Response was not JSON/)
api.lyric = async () => ({ lrc: { lyric: '[00:01.00]Fallback' } })
api.lyricNew = async () => { throw new Error('New lyrics unavailable') }
assert.deepEqual(await provider.getLyrics(1), [{ time: 1, text: 'Fallback', translation: '' }], 'new endpoint failures fall back to ordinary lyrics')
api.lyricNew = async () => ({ lrc: { lyric: '[00:01.00]Hello world\n[00:03.00]Mismatch' }, tlyric: { lyric: '[00:01.00]译文' }, yrc: { lyric: '[1020,1000](1020,500,0)Hello (1520,500,0)world\n[3000,500](3000,500,0)Different' } })
const timed = await provider.getLyrics(1)
assert.deepEqual(timed[0], { time: 1, text: 'Hello world', translation: '译文', words: [{ time: 1.02, duration: .5, text: 'Hello ' }, { time: 1.52, duration: .5, text: 'world' }] })
assert.equal(timed[1]?.words, undefined, 'mismatched text does not receive timing from another line')
api.lyricNew = async () => ({ yrc: { lyric: '[1000,1000](1000,500,0)Only (1500,500,0)words' } })
assert.equal((await provider.getLyrics(1))[0]?.words?.length, 2, 'word-only lyrics remain usable')

const signal = new AbortController().signal
api.songUrl = async (_id, _level, _unblock, actualSignal) => {
  assert.equal(actualSignal, signal)
  return { code: 200, data: [] }
}
api.songUrlMatch = async (_id, actualSignal) => {
  assert.equal(actualSignal, signal)
  return { code: 200, data: [] }
}
api.songUrlOld = async (_id, _bitrate, actualSignal) => {
  assert.equal(actualSignal, signal)
  return { code: 200, data: [] }
}
await provider.getStream(1, { signal })
await provider.getMatchedStream(1, signal)
await provider.getLegacyStream(1, 320000, signal)

console.log('Netease response boundary: error envelopes, invalid songs and successful empty results passed')
