import assert from 'node:assert/strict'
import {
  ANDROID_STATE_RECONCILE_ACTIVE_MS,
  ANDROID_STATE_RECONCILE_IDLE_MS,
  androidPosition,
  androidStateReconcileInterval,
  parseAndroidState,
  type AndroidPlaybackState,
} from './android-state.ts'

const state: AndroidPlaybackState = { anchorPosition: 45000, anchorTimestamp: 1000, playbackSpeed: 1, duration: 240000, playing: true, loading: false, ended: false, index: -1, volume: .8, mode: 'list', error: '', tracks: [] }
assert.equal(androidPosition(state, 6000), 50)
assert.equal(androidPosition({ ...state, playing: false }, 6000), 45, 'pause never extrapolates')
assert.equal(androidPosition({ ...state, playbackSpeed: 2 }, 6000), 55)
assert.equal(androidPosition(state, 500), 45, 'clock reversal cannot move progress backwards')
assert.equal(androidPosition(state, 9999999), 240, 'progress clamps to duration')
assert.equal(androidPosition({ ...state, anchorPosition: 100000 }, 1000), 100, 'a seek immediately replaces the position anchor')
assert.equal(parseAndroidState(state), state)
assert.throws(() => parseAndroidState({ ...state, anchorPosition: NaN }))
assert.throws(() => parseAndroidState({ ...state, playbackSpeed: Infinity }))
assert.throws(() => parseAndroidState({ ...state, tracks: null }))
assert.throws(() => parseAndroidState({ ...state, playing: 'true' }))
assert.throws(() => parseAndroidState({ ...state, volume: 2 }))
assert.throws(() => parseAndroidState({ ...state, index: 0 }))
assert.throws(() => parseAndroidState({ ...state, revision: NaN }))

assert.equal(
  androidStateReconcileInterval({ loading: true }, 10_000, 0),
  ANDROID_STATE_RECONCILE_ACTIVE_MS,
  'a buffering/loading snapshot must be reconciled quickly in case a READY event was missed',
)
assert.equal(
  androidStateReconcileInterval({ loading: false }, 10_000, 12_000),
  ANDROID_STATE_RECONCILE_ACTIVE_MS,
  'the post-command settle window must use the fast reconcile cadence',
)
assert.equal(
  androidStateReconcileInterval({ loading: false }, 10_000, 9_000),
  ANDROID_STATE_RECONCILE_IDLE_MS,
  'stable playback only needs a low-frequency safety reconcile',
)

console.log('Android playback state: native anchor, pause, seek, speed, bounds, malformed snapshots and reconcile cadence passed')
