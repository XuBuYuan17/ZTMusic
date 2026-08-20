import { MusicProviderRegistry } from './provider.js'
import { createNeteaseProvider } from './providers/netease.js'

export const musicProviders = new MusicProviderRegistry()
musicProviders.register(createNeteaseProvider())

export function registerMusicProvider(provider, options) {
  return musicProviders.register(provider, options)
}

export function setActiveMusicProvider(id) {
  musicProviders.setActive(id)
}

export function listMusicProviders() {
  return musicProviders.list()
}

export const musicService = Object.freeze({
  search(query, options) {
    return musicProviders.call('search', query, options)
  },
  getHotSearch() {
    return musicProviders.call('getHotSearch')
  },
  getTopSongs(limit) {
    return musicProviders.call('getTopSongs', limit)
  },
  getLyrics(id) {
    return musicProviders.call('getLyrics', id)
  },
  getStream(id, options) {
    return musicProviders.call('getStream', id, options)
  },
  getMatchedStream(id) {
    return musicProviders.call('getMatchedStream', id)
  },
  getLegacyStream(id, bitrate) {
    return musicProviders.call('getLegacyStream', id, bitrate)
  },
  getTracks(ids) {
    return musicProviders.call('getTracks', ids)
  },
  getPlaylist(id) {
    return musicProviders.call('getPlaylist', id)
  },
  getAlbum(id) {
    return musicProviders.call('getAlbum', id)
  },
  getArtist(id) {
    return musicProviders.call('getArtist', id)
  },
})
