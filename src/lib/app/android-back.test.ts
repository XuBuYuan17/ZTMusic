import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { subscribeAndroidBack } from './android-back.ts'

let callback: (() => void) | undefined
let resolveListener!: (value: { unregister: () => Promise<void> }) => void
let closed = 0
let removed = 0
const listener = { unregister: async () => { removed++ } }
const stop = subscribeAndroidBack(() => { closed++ }, async handler => {
  callback = handler
  return new Promise(resolve => { resolveListener = resolve })
})
callback!()
assert.equal(closed, 1)
stop()
callback!()
assert.equal(closed, 1, 'disposed subscriptions must not close a newer screen')
resolveListener(listener)
await setImmediate()
assert.equal(removed, 1, 'late registration must immediately unregister')
stop()
assert.equal(removed, 1)

const stopReady = subscribeAndroidBack(() => {}, async () => listener)
await setImmediate()
stopReady()
stopReady()
assert.equal(removed, 2, 'an active subscription unregisters exactly once')
console.log('Android back: dispatch, late registration, disposal and duplicate cleanup passed')
