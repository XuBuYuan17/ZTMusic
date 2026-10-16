import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { createContext, runInContext } from 'node:vm'
import type { Song, SongId } from '../types/music.ts'
import type { PlaylistDetailRecord, PlaylistDetailResult } from './details.ts'
import { createLruCache } from '../utils/lru-cache.ts'
import { compactQueue } from '../player/queue.ts'
import { LIMITS } from '../utils/constants.ts'

const storage = new Map<string, string>()
globalThis.localStorage = globalThis.sessionStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, String(value)) },
  removeItem: (key: string) => { storage.delete(key) },
} as unknown as Storage

const { musicProviders } = await import('../music/service.ts')
const { loadPlaylistMore, loadPlaylistDetail, playlistLoadCursor } = await import('./details.ts')
const songsFor = (ids: SongId[]): Song[] => ids.map(id => ({
  id, sourceId: id, providerId: 'details-test', name: `Song ${id}`, artists: [],
  ar: [], al: {}, dt: 0, durationMs: 0, picUrl: '', coverUrl: '',
}))
let getTracks = async (ids: SongId[]) => songsFor(ids)
let playlist: PlaylistDetailRecord | null = null
musicProviders.register({
  id: 'details-test', name: 'Details test', search: () => [],
  getTracks: (ids: SongId[]) => getTracks(ids), getPlaylist: async () => playlist,
})
musicProviders.setActive('details-test')

function detail(count: number, cursor = 0): PlaylistDetailRecord {
  return { id: 1, tracks: songsFor(Array.from({ length: cursor }, (_, i) => i + 1)) as unknown as Record<string, unknown>[],
    trackIds: Array.from({ length: count }, (_, i) => ({ id: i + 1 })), trackLoadCursor: cursor, tracksPartial: cursor < count }
}

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

let passed = 0
async function check(name: string, run: () => void | Promise<void>) {
  try { await run(); passed++ }
  catch (error) { console.error(`FAIL ${name}:`, error); process.exitCode = 1 }
}

await check('successful missing tracks advance the request cursor', async () => {
  const data = detail(3, 1)
  getTracks = async () => []
  await loadPlaylistMore(data)
  assert.equal(data.trackLoadCursor, 3)
  assert.equal(data.tracksPartial, false)
  assert.deepEqual(data.tracks.map(track => track.id), [1])
})

await check('complete network failure retains rows and the retry cursor', async () => {
  const data = detail(3, 1)
  const error = new Error('offline')
  getTracks = async () => { throw error }
  await assert.rejects(loadPlaylistMore(data), value => value === error)
  assert.equal(data.trackLoadCursor, 1)
  assert.equal(data.tracksPartial, true)
  assert.deepEqual(data.tracks.map(track => track.id), [1])
  getTracks = async ids => songsFor(ids)
  await loadPlaylistMore(data)
  assert.deepEqual(data.tracks.map(track => track.id), [1, 2, 3])
  assert.equal(data.tracksPartial, false)
})

await check('a failed first group preserves later successful rows in playlist order', async () => {
  const data = detail(100)
  getTracks = async ids => {
    if (ids[0] === 1) throw new Error('first batch offline')
    return songsFor(ids.slice().reverse())
  }
  await assert.rejects(loadPlaylistMore(data), /first batch offline/)
  assert.equal(data.trackLoadCursor, 0)
  assert.equal(data.tracksPartial, true)
  assert.deepEqual(data.tracks.map(track => track.id), Array.from({ length: 50 }, (_, i) => i + 51))
  getTracks = async ids => songsFor(ids)
  await loadPlaylistMore(data)
  assert.equal(data.tracks.length, 100)
  assert.equal(new Set(data.tracks.map(track => track.id)).size, 100)
  assert.equal(data.trackLoadCursor, 100)
})

await check('a failed later group retries from that group without losing earlier progress', async () => {
  const data = detail(100)
  getTracks = async ids => {
    if (ids[0] === 51) throw new Error('later batch offline')
    return songsFor(ids)
  }
  await assert.rejects(loadPlaylistMore(data), /later batch offline/)
  assert.equal(data.trackLoadCursor, 50)
  const requests: SongId[][] = []
  getTracks = async ids => { requests.push(ids); return songsFor(ids) }
  await loadPlaylistMore(data)
  assert.equal(requests[0]?.[0], 51)
  assert.equal(data.trackLoadCursor, 100)
})

await check('initial detail failure exposes its successful partial data and retry cursor', async () => {
  playlist = detail(80)
  getTracks = async ids => {
    if (ids[0] === 51) throw new Error('initial batch offline')
    return songsFor(ids)
  }
  let progress: PlaylistDetailRecord | null = null
  await assert.rejects(loadPlaylistDetail(async () => null, 1, result => { progress = result.detail }), /initial batch offline/)
  assert.equal((progress as PlaylistDetailRecord | null)?.trackLoadCursor, 50)
  assert.equal((progress as PlaylistDetailRecord | null)?.tracks.length, 50)
})

await check('initial failure removes only temporary placeholder rows and remains retryable', async () => {
  playlist = detail(101)
  getTracks = async () => { throw new Error('initial offline') }
  await assert.rejects(loadPlaylistDetail(async () => null, 1), /initial offline/)
  assert.equal(playlist.tracks.length, 0)
  assert.equal(playlist.trackLoadCursor, 0)
  assert.equal(playlist.tracksPartial, true)
  getTracks = async ids => songsFor(ids)
  await loadPlaylistMore(playlist)
  assert.equal(playlist.tracks.length, 100)
  assert.equal(playlist.trackLoadCursor, 100)
})

const routerSource = await readFile(new URL('../stores/router.svelte.ts', import.meta.url), 'utf8')
const routerScript = stripTypeScriptTypes(routerSource.replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replace(/^export /gm, ''))
function routerHarness() {
  const played: SongId[][] = []
  const player = {
    queue: [] as Array<{ id: SongId }>, queueRevision: 0, playbackRevision: 0, queueIndex: 0,
    playQueue(tracks: Array<{ id: SongId }>) {
      this.queue = compactQueue(tracks); this.queueRevision++; this.playbackRevision++
      played.push(this.queue.map(track => track.id))
    },
    appendQueue(tracks: Array<{ id: SongId }>) {
      const before = this.queue.length
      this.queue = compactQueue([...this.queue, ...tracks])
      const added = this.queue.length - before
      if (added) this.queueRevision++
      return added
    },
  }
  const context: Record<string, unknown> = {
    $state: (value: unknown) => value, createLruCache, getPlaylistLoadCursor: playlistLoadCursor,
    loadPlaylistMore, loadPlaylistDetail, extractColor: async () => null,
    loadArtistDetail: async (id: SongId) => ({ artist: { id, followed: false }, songs: [], albums: [] }),
    player, LIMITS,
    ncm: { artistSub: async () => {} }, auth: {}, discoveryPlaylists: [], isMobileDevice: () => false,
    console, setTimeout, clearTimeout,
  }
  createContext(context)
  runInContext(routerScript + '\nglobalThis.router = router', context)
  const router = context.router as typeof import('../stores/router.svelte.ts').router
  const usePlaylist = (data: PlaylistDetailRecord, view = 'playlist') => {
    context.data = data; context.view = view
    runInContext("_detailRequestId++; _playlistDetail = data; _activeView = view; _selectedId = Number(data.id); _playlistLoadingMore = false; _playlistDetailError = ''", context)
  }
  return { context, router, played, player, usePlaylist }
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve))

await check('failed artist follow cannot roll back a newly opened artist or null detail', async () => {
  for (const destination of [2, null]) {
    const { context, router } = routerHarness()
    const pending = deferred<void>()
    context.ncm = { artistSub: () => pending.promise }
    await router.goArtist(1)
    const follow = router.toggleArtistFollow()
    if (destination) await router.goArtist(destination)
    else router.handleNav('home')
    pending.reject(new Error('follow offline'))
    await follow
    assert.equal(router.artistDetail?.id ?? null, destination)
    if (destination) assert.equal(router.artistDetail?.followed, false)
    const cached = runInContext("detailCache.get('artist:1')", context)
    assert.equal(cached.artist.id, 1)
    assert.equal(cached.artist.followed, false)
  }
})

await check('late earlier follow failure cannot undo a newer follow operation', async () => {
  const { context, router } = routerHarness()
  const first = deferred<void>(), second = deferred<void>()
  let calls = 0
  context.ncm = { artistSub: () => ++calls === 1 ? first.promise : second.promise }
  await router.goArtist(1)
  const a = router.toggleArtistFollow(), b = router.toggleArtistFollow()
  second.resolve(); await b
  first.reject(new Error('late failure')); await a
  assert.equal(router.artistDetail?.followed, false)
  assert.equal(runInContext("detailCache.get('artist:1').artist.followed", context), false)
})

await check('different artists keep independent follow requests and cache results', async () => {
  const { context, router } = routerHarness()
  const a = deferred<void>(), b = deferred<void>()
  context.ncm = { artistSub: (id: SongId) => id === 1 ? a.promise : b.promise }
  await router.goArtist(1)
  const followA = router.toggleArtistFollow()
  await router.goArtist(2)
  const followB = router.toggleArtistFollow()
  a.resolve(); await followA
  assert.equal(router.artistDetail?.id, 2)
  assert.equal(router.artistDetail?.followed, true)
  assert.equal(runInContext("detailCache.get('artist:1').artist.followed", context), true)
  b.resolve(); await followB
  assert.equal(runInContext("detailCache.get('artist:2').artist.followed", context), true)
  assert.equal(runInContext('artistFollowRequests.size', context), 0)
})

await check('play all stops after navigation and never paginates or plays the new playlist', async () => {
  const { context, router, played, usePlaylist } = routerHarness()
  const pending = deferred<PlaylistDetailResult>()
  const requested: SongId[] = []
  context.loadPlaylistMore = (data: PlaylistDetailRecord) => { requested.push(data.id); return pending.promise }
  const old = detail(4, 1)
  usePlaylist(old)
  router.playAll(old.tracks as never)
  assert.deepEqual(played, [[1]], 'the already loaded song starts before the next page resolves')
  const next = { ...detail(4, 1), id: 2 }
  usePlaylist(next)
  pending.resolve({ detail: old, heroColor: '' })
  await flush()
  assert.deepEqual(requested, [1])
  assert.deepEqual(played, [[1]])
  assert.equal(router.playlistDetail?.id, 2)
})

await check('play all also stops on direct artist navigation that does not change the detail request id', async () => {
  const { context, router, played, usePlaylist } = routerHarness()
  const pending = deferred<PlaylistDetailResult>()
  context.loadPlaylistMore = () => pending.promise
  const old = detail(4, 1)
  usePlaylist(old); router.playAll(old.tracks as never)
  await router.goArtist(2)
  pending.resolve({ detail: old, heroColor: '' })
  await flush()
  assert.deepEqual(played, [[1]])
  assert.equal(router.activeView, 'artist')
})

await check('play all adopts the final detail object after waiting for the progressive initial request', async () => {
  const { context, router, played, player } = routerHarness()
  const pending = deferred<PlaylistDetailResult>()
  context.loadPlaylistDetail = (_extract: unknown, _id: SongId, onProgress: (result: PlaylistDetailResult) => void) => {
    onProgress({ detail: detail(4, 1), heroColor: '' })
    return pending.promise
  }
  const opening = router.goPlaylist(1)
  router.playAll(router.playlistDetail!.tracks)
  assert.deepEqual(played, [[1]], 'playback starts before the initial detail request completes')
  pending.resolve({ detail: detail(4, 4), heroColor: '' })
  await opening; await flush()
  assert.deepEqual(played, [[1]])
  assert.deepEqual(player.queue.map(track => track.id), [1, 2, 3, 4])
  assert.equal(router.playlistLoadingMore, false)
})

await check('play all exits on the first network failure instead of retrying automatically', async () => {
  const { router, played, usePlaylist } = routerHarness()
  const data = detail(4, 1)
  let calls = 0
  getTracks = async () => { calls++; throw new Error('all offline') }
  usePlaylist(data); router.playAll(data.tracks as never)
  await flush()
  assert.equal(calls, 1)
  assert.deepEqual(played, [[1]])
  assert.equal(router.playlistDetailError, 'all offline')
  assert.equal(router.playlistLoadingMore, false)
  assert.equal(router.playlistDetail?.trackLoadCursor, 1)
})

await check('large play all starts immediately and stops background requests at queue capacity', async () => {
  const { router, played, player, usePlaylist } = routerHarness()
  const data = detail(1200, 100)
  const requests: SongId[][] = []
  getTracks = async ids => { requests.push(ids); return songsFor(ids) }
  usePlaylist(data)
  router.playAll()
  assert.equal(played.length, 1)
  assert.equal(played[0]?.length, 100)
  await flush()
  assert.equal(player.queue.length, 500)
  assert.deepEqual(player.queue.map(track => track.id), Array.from({ length: 500 }, (_, i) => i + 1))
  assert.equal(data.trackLoadCursor, 500)
  assert.equal(requests.length, 8)
  assert.equal(played.length, 1, 'background append never restarts playback')
  assert.equal(router.playlistLoadingMore, false)
})

await check('a changed queue cancels background append without replacing the user queue', async () => {
  const { context, router, player, usePlaylist } = routerHarness()
  const pending = deferred<PlaylistDetailResult>()
  let calls = 0
  context.loadPlaylistMore = () => { calls++; return pending.promise }
  const data = detail(5, 1)
  usePlaylist(data); router.playAll(data.tracks as never)
  player.queue = [{ id: 99 }]; player.queueRevision++
  data.tracks = detail(5, 4).tracks; data.trackLoadCursor = 4
  pending.resolve({ detail: data, heroColor: '' }); await flush()
  assert.deepEqual(player.queue.map(track => track.id), [99])
  assert.equal(calls, 1)
  assert.equal(router.playlistLoadingMore, false)
})

await check('replaying the same queued song cancels background append through playback revision', async () => {
  const { context, router, player, usePlaylist } = routerHarness()
  const pending = deferred<PlaylistDetailResult>()
  context.loadPlaylistMore = () => pending.promise
  const data = detail(4, 1)
  usePlaylist(data); router.playAll(data.tracks as never)
  player.playbackRevision++
  data.tracks = detail(4, 4).tracks; data.trackLoadCursor = 4
  pending.resolve({ detail: data, heroColor: '' }); await flush()
  assert.deepEqual(player.queue.map(track => track.id), [1])
})

await check('repeated play all shares an in-flight page but appends only to the newest playback', async () => {
  const { context, router, played, player, usePlaylist } = routerHarness()
  const pending = deferred<PlaylistDetailResult>()
  let calls = 0
  context.loadPlaylistMore = () => { calls++; return pending.promise }
  const data = detail(4, 1)
  usePlaylist(data); router.playAll(data.tracks as never); router.playAll(data.tracks as never)
  assert.equal(calls, 1)
  data.tracks = detail(4, 4).tracks; data.trackLoadCursor = 4
  pending.resolve({ detail: data, heroColor: '' }); await flush()
  assert.deepEqual(played, [[1], [1]])
  assert.deepEqual(player.queue.map(track => track.id), [1, 2, 3, 4])
  assert.equal(router.playlistLoadingMore, false)
})

await check('manual pagination and play all share the same page request', async () => {
  const { context, router, player, usePlaylist } = routerHarness()
  const pending = deferred<PlaylistDetailResult>()
  let calls = 0
  context.loadPlaylistMore = () => { calls++; return pending.promise }
  const data = detail(4, 1)
  usePlaylist(data)
  const loading = router.loadMorePlaylist()
  router.playAll(data.tracks as never)
  assert.equal(calls, 1)
  data.tracks = detail(4, 4).tracks; data.trackLoadCursor = 4
  pending.resolve({ detail: data, heroColor: '' }); await loading; await flush()
  assert.deepEqual(player.queue.map(track => track.id), [1, 2, 3, 4])
})

await check('switching to a filtered subset cancels the old fill and releases its loading flag', async () => {
  const { context, router, player, usePlaylist } = routerHarness()
  const pending = deferred<PlaylistDetailResult>()
  context.loadPlaylistMore = () => pending.promise
  const data = detail(5, 2)
  usePlaylist(data); router.playAll(data.tracks as never)
  router.playAll(data.tracks.slice(0, 1) as never)
  data.tracks = detail(5, 5).tracks; data.trackLoadCursor = 5
  pending.resolve({ detail: data, heroColor: '' }); await flush()
  assert.deepEqual(player.queue.map(track => track.id), [1])
  assert.equal(router.playlistLoadingMore, false)
})

await check('empty filtered results do not start playback or fetch more songs', () => {
  const { router, played, usePlaylist } = routerHarness()
  usePlaylist(detail(4, 1)); router.playAll([])
  assert.deepEqual(played, [])
})

await check('router keeps initial partial songs after a request failure', async () => {
  const { router } = routerHarness()
  playlist = detail(80)
  getTracks = async ids => {
    if (ids[0] === 51) throw new Error('retry initial')
    return songsFor(ids)
  }
  await router.goPlaylist(1)
  assert.equal(router.playlistDetail?.tracks.length, 50)
  assert.equal(router.playlistDetail?.trackLoadCursor, 50)
  assert.equal(router.playlistDetailError, 'retry initial')
  getTracks = async ids => songsFor(ids)
  await router.loadMorePlaylist()
  assert.equal(router.playlistDetail?.tracks.length, 80)
  assert.equal(router.playlistDetailError, '')
  assert.equal(router.playlistHasMore, false)
})

await check('router pagination displays failure, keeps rows, and clears it after manual retry', async () => {
  const { router, usePlaylist } = routerHarness()
  const data = detail(3, 1)
  usePlaylist(data)
  getTracks = async () => { throw new Error('retry page') }
  await router.loadMorePlaylist()
  assert.equal(router.playlistDetailError, 'retry page')
  assert.equal(router.playlistDetail?.tracks.length, 1)
  assert.equal(router.playlistLoadingMore, false)
  getTracks = async ids => songsFor(ids)
  await router.loadMorePlaylist()
  assert.equal(router.playlistDetailError, '')
  assert.equal(router.playlistDetail?.tracks.length, 3)
})

await check('partial successful pagination rows remain cached when returning to the playlist', async () => {
  const { router, usePlaylist } = routerHarness()
  const data = detail(100)
  usePlaylist(data)
  getTracks = async ids => {
    if (ids[0] === 51) throw new Error('second half offline')
    return songsFor(ids)
  }
  await router.loadMorePlaylist()
  assert.equal(router.playlistDetail?.tracks.length, 50)
  router.handleNav('home')
  await router.goPlaylist(1)
  assert.equal(router.playlistDetail?.tracks.length, 50)
  assert.equal(router.playlistDetail?.trackLoadCursor, 50)
  assert.equal(router.playlistHasMore, true)
})

await check('filtered play all keeps playing only the visible subset', () => {
  const { router, played, usePlaylist } = routerHarness()
  const data = detail(4, 2)
  usePlaylist(data)
  router.playAll(data.tracks.slice(0, 1) as never)
  assert.deepEqual(played, [[1]])
})

await check('page observer pauses on failure and resumes after the error is cleared', async () => {
  const page = await readFile(new URL('../pages/PlaylistPage.svelte', import.meta.url), 'utf8')
  const action = page.slice(page.indexOf('  function loadMoreSentinel('), page.indexOf('  let totalTrackCount'))
  let callback!: (entries: Array<{ isIntersecting: boolean }>) => void
  let calls = 0, disconnected = false, error = '', loading = false
  const context = createContext({
    onLoadMore: () => calls++, IntersectionObserver: class {
      constructor(onIntersect: typeof callback) { callback = onIntersect }
      observe() {}
      disconnect() { disconnected = true }
    },
  })
  const sentinel = runInContext(stripTypeScriptTypes(action) + '\nloadMoreSentinel', context)
  const mounted = sentinel({}, { hasMore: () => true, loadingMore: () => loading, error: () => error })
  callback([{ isIntersecting: true }]); assert.equal(calls, 1)
  error = 'offline'
  callback([{ isIntersecting: true }]); assert.equal(calls, 1)
  error = ''; loading = true
  callback([{ isIntersecting: true }]); assert.equal(calls, 1)
  loading = false
  callback([{ isIntersecting: true }]); assert.equal(calls, 2)
  mounted.destroy(); assert.equal(disconnected, true)
})

console.log(`details async regressions: ${passed} passed${process.exitCode ? ', failed' : ', 0 failed'}`)
