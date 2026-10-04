import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { createMobileNavigationMotion, mobileNavigationKind, mobilePageFrames, mobileMotion } from './mobile-navigation-motion.ts'

assert.equal(mobilePageFrames('tab', true)[0].transform, 'none', 'tabs fade without moving the page')
assert.equal(mobileNavigationKind('forward', false), 'push')
assert.equal(mobileNavigationKind('back', false), 'pop')
assert.equal(mobileNavigationKind('forward', true), 'tab')
assert.equal(mobilePageFrames('push', true)[0].transform, 'translate3d(64px,0,0)')
assert.equal(mobilePageFrames('pop', false)[1].transform, 'translate3d(64px,0,0)')
assert.equal(mobilePageFrames('pop', true)[0].transform, 'translate3d(-20px,0,0)')
assert.equal(mobilePageFrames('push', true, true)[0].transform, 'none')
assert.equal(mobilePageFrames('push', true, true, true)[0].transform, 'translate3d(0,28px,0)')
assert.equal(mobilePageFrames('push', false, true, true)[1].transform, 'translate3d(0,-8px,0)')
assert.equal(mobilePageFrames('pop', false, false, true)[1].transform, 'translate3d(0,32px,0)')

const pending: Array<{ resolve: () => void; cancelled: boolean; duration: number }> = []
const node = { animate(_frames: Keyframe[], options: KeyframeAnimationOptions) {
  const entry = { resolve: () => {}, cancelled: false, duration: Number(options.duration) }
  const finished = new Promise<void>(resolve => { entry.resolve = resolve })
  pending.push(entry)
  return { finished, cancel() { entry.cancelled = true; entry.resolve() } }
}, querySelectorAll() { return [] } } as unknown as HTMLElement
const motion = createMobileNavigationMotion()
let stale = 0
let completed = 0
motion.play(node, node, 'push', false, false, false, () => { stale++ })
assert.equal(pending[0]!.duration, mobileMotion.page)
motion.play(node, null, 'tab', false, false, false, () => { completed++ })
await setImmediate()
assert.equal(stale, 0, 'interrupted navigation cannot hide the newer outgoing page')
assert.ok(pending.slice(0, 2).every(entry => entry.cancelled))
assert.equal(pending[2]!.duration, mobileMotion.tab)
pending[2]!.resolve()
await setImmediate()
assert.equal(completed, 1)
motion.play(node, null, 'pop', false, false, true, () => { completed++ })
assert.equal(pending.length, 3, 'reduced motion creates no animations')
assert.equal(completed, 2)
let surfaceCompleted = 0
motion.play(node, null, 'push', true, true, false, () => { surfaceCompleted++ })
assert.equal(pending[3]!.duration, mobileMotion.expand, 'cover detail uses the synchronized surface duration')
pending[3]!.resolve()
await setImmediate()
assert.equal(surfaceCompleted, 1)
motion.cancel()
console.log('Mobile navigation: direction, timings, shared cover, interruption and reduced motion passed')
