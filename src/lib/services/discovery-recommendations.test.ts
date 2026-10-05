import assert from 'node:assert/strict'
import { compactTrack } from '../player/queue.ts'
import { recommendationTracks, loadDailyRecommendations, loadHeartMode, loadRoaming } from './discovery-recommendations.ts'
import { createRecommendationQueue } from '../player/recommendation-queue.ts'
import type { RecommendationSnapshot } from '../player/recommendation-queue.ts'

const track = (id: number) => compactTrack({ id, name: `Song ${id}`, artists: [{ id: 7, name: 'Artist' }], album: { id: 8, name: 'Album' } })!
const song = track(1)
assert.equal(recommendationTracks({ data: [{ songInfo: song }, song, { id: -1, name: 'bad' }, { id: 'local:1', name: 'bad' }, { id: 2, name: '' }] }).length, 1)
assert.equal(recommendationTracks({ songs: [song] })[0]!.ar[0]!.name, 'Artist')
assert.throws(() => recommendationTracks({ code: 301, data: [song] }), /登录/)

const calls: unknown[][] = []
const api = {
  recommendSongs: async (...args: unknown[]) => { calls.push(args); return { code: 200, data: { dailySongs: [song, track(2)] } } },
  personalFm: async () => ({ code: 200, data: [song, track(2), track(3)] }),
  userPlaylist: async () => ({ code: 200, playlist: [
    { id: 99, specialType: 5, creator: { userId: 88 } },
    { id: 10, specialType: 5, creator: { userId: 17 }, coverImgUrl: 'https://example.com/liked.jpg' },
  ] }),
  playlistTracks: async (id: unknown) => { assert.equal(id, 10); return { songs: [song, track(2)] } },
  intelligenceList: async (...args: unknown[]) => { calls.push(args); return { code: 200, data: [{ songInfo: track(3) }] } },
}
assert.equal((await loadDailyRecommendations(api)).length, 2)
assert.deepEqual(calls[0], [100, { cache: false, refresh: true }])
assert.equal((await loadRoaming(api)).length, 3)
const heart = await loadHeartMode(api, 17, 2)
assert.equal(heart.coverImgUrl, 'https://example.com/liked.jpg', 'heart card uses the account liked-playlist cover')
assert.deepEqual(calls.at(-1), [2, 10, 2])
await heart.next(3)
assert.deepEqual(calls.at(-1), [3, 10, 2])
await loadHeartMode(api, 17, 500)
assert.deepEqual(calls.at(-1), [1, 10, 1], 'non-liked current song cannot become the seed')
await assert.rejects(() => loadHeartMode({ ...api, playlistTracks: async () => ({ songs: [] }) }, 17), /喜欢/)
await assert.rejects(() => loadRoaming({ ...api, personalFm: async () => ({ code: 500, message: 'unavailable' }) }), /unavailable/)

let state: RecommendationSnapshot = { account: {}, revision: 1, queue: [track(1), track(2), track(3)], index: 0, id: 1, mode: 'list' }
let status: [boolean, boolean, string] = [false, false, '']
let pending: ((tracks: ReturnType<typeof track>[]) => void) | undefined
let requests = 0
const next = () => { requests++; return new Promise<ReturnType<typeof track>[]>(resolve => { pending = resolve }) }
const controller = createRecommendationQueue({
  snapshot: () => state,
  replace: (queue, index) => { state = { ...state, queue, index, revision: state.revision + 1 } },
  state: (...args) => { status = args },
})
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
controller.start(next)
assert.equal(requests, 1)
await controller.update()
assert.equal(requests, 1, 'one refill in flight')
state = { ...state, queue: state.queue.map(song => ({ ...song })), index: 1, id: 2 }
pending!([track(3), track(4), track(4), track(5), track(6)])
await settle()
assert.deepEqual(state.queue.map(song => song.id), [1, 2, 3, 4, 5, 6])
assert.equal(state.index, 1)
assert.equal(state.id, 2)
assert.deepEqual(status, [true, false, ''])
await controller.update()
assert.equal(requests, 1, 'enough future songs do not request again')
state = { ...state, index: 4, id: 5 }
const refill = controller.update()
state = { ...state, revision: state.revision + 1, queue: [track(50)], index: 0, id: 50 }
pending!([track(7)])
await refill
assert.deepEqual(state.queue.map(song => song.id), [50], 'late refill cannot overwrite ordinary playback')
assert.equal(status[0], false)

controller.start(next)
state = { ...state, account: {} }
pending!([track(8)])
await settle()
assert.deepEqual(state.queue.map(song => song.id), [50], 'late account response is discarded')

controller.start(next)
pending!([track(50)])
await settle()
assert.equal(status[0], false)
assert.match(status[2], /没有新的/)
controller.start(next)
state = { ...state, mode: 'shuffle' }
await controller.update()
pending!([track(9)])
await settle()
assert.equal(status[0], false)

state = { account: {}, revision: 10, queue: Array.from({ length: 205 }, (_, i) => track(i + 1)), index: 203, id: 204, mode: 'list' }
controller.start(next)
pending!([track(206), track(207), track(208)])
await settle()
assert.equal(state.queue[state.index]!.id, 204)
assert.equal(state.index, 20)
assert.equal(state.queue.length, 25)
assert.equal(state.queue.at(-1)!.id, 208)
controller.stop()
console.log('Discovery recommendations: response validation, heart seed, dedupe, native snapshots, queue/account races and bounded continuous refills passed')
