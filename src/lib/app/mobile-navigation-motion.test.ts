import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { createMobileNavigationMotion, mobileNavigationKind, mobilePageFrames, mobileMotion } from './mobile-navigation-motion.ts'

assert.equal(mobileNavigationKind('forward', false), 'push')
assert.equal(mobileNavigationKind('back', false), 'pop')
assert.equal(mobileNavigationKind('forward', true), 'tab')
assert.equal(mobilePageFrames('push', true)[0].transform, 'translate3d(32px,0,0)')
assert.equal(mobilePageFrames('pop', false)[1].transform, 'translate3d(32px,0,0)')
assert.equal(mobilePageFrames('pop', true)[0].transform, 'translate3d(-12px,0,0)')
assert.equal(mobilePageFrames('push', true, true)[0].transform, 'none')

const pending: Array<{ resolve: () => void; cancelled: boolean; duration: number }> = []
const node = { animate(_frames: Keyframe[], options: KeyframeAnimationOptions) {
  const entry = { resolve: () => {}, cancelled: false, duration: Number(options.duration) }
  const finished = new Promise<void>(resolve => { entry.resolve = resolve })
  pending.push(entry)
  return { finished, cancel() { entry.cancelled = true; entry.resolve() } }
} } as unknown as HTMLElement
const motion = createMobileNavigationMotion()
let stale = 0
let completed = 0
motion.play(node, node, 'push', false, false, () => { stale++ })
assert.equal(pending[0]!.duration, mobileMotion.page)
motion.play(node, null, 'tab', false, false, () => { completed++ })
await setImmediate()
assert.equal(stale, 0, 'interrupted navigation cannot hide the newer outgoing page')
assert.ok(pending.slice(0, 2).every(entry => entry.cancelled))
assert.equal(pending[2]!.duration, mobileMotion.tab)
pending[2]!.resolve()
await setImmediate()
assert.equal(completed, 1)
motion.play(node, null, 'pop', false, true, () => { completed++ })
assert.equal(pending.length, 3, 'reduced motion creates no animations')
assert.equal(completed, 2)
motion.cancel()
console.log('Mobile navigation: direction, timings, shared cover, interruption and reduced motion passed')
