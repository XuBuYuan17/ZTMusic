import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { createMobileNavigationMotion, mobileNavigationKind, mobilePageFrames, mobileMotion } from './mobile-navigation-motion.ts'

assert.equal(mobileNavigationKind('forward', false), 'push')
assert.equal(mobileNavigationKind('back', false), 'pop')
assert.equal(mobileNavigationKind('forward', true), 'tab')
assert.equal(mobilePageFrames('tab', true)[0].transform, 'translate3d(14px,0,0)', 'tab pages use a small directional entrance')
assert.equal(mobilePageFrames('push', true)[0].transform, 'translate3d(24px,0,0)')
assert.equal(mobilePageFrames('pop', false)[1].transform, 'translate3d(24px,0,0)')
assert.equal(mobilePageFrames('pop', true)[0].transform, 'translate3d(-24px,0,0)')
assert.equal(mobilePageFrames('push', true, true)[0].transform, 'none')
assert.equal(mobilePageFrames('push', true, true, true)[0].clipPath, 'inset(8% 8% 72% 8% round 22px)')
assert.equal(mobilePageFrames('push', true, true, true)[0].opacity, 1, 'detail reveal stays fully opaque')
assert.equal(mobilePageFrames('push', true, true, true, 'inset(10px 20px 30px 40px round 16px)')[0].clipPath, 'inset(10px 20px 30px 40px round 16px)')
assert.equal(mobilePageFrames('push', false, true, true)[1].transform, 'none', 'source page remains still below the detail surface')
assert.equal(mobilePageFrames('pop', true, false, true)[0].transform, 'none', 'destination page remains still during detail dismissal')

const dismissFrames = mobilePageFrames('pop', false, false, true)
assert.equal(dismissFrames.at(-1)?.clipPath, 'inset(0 0 0 0 round 0px)', 'return must never squash the full detail page back into the source card')
assert.equal(dismissFrames.at(-1)?.opacity, 0, 'detail content clears before the shared cover lands')
assert.equal(dismissFrames.at(-1)?.transform, 'translate3d(0,10px,0) scale(.992)', 'detail dismissal uses only a subtle depth/downward cue')
assert.equal(dismissFrames[1]?.offset, .72, 'detail content should visually finish before the cover flight completes')
assert.ok(mobileMotion.dismiss < mobileMotion.expand, 'return should feel faster than the initial reveal')

const pending: Array<{ resolve: () => void; cancelled: boolean; duration: number }> = []
const node = { animate(_frames: Keyframe[], options: KeyframeAnimationOptions) {
  const entry = { resolve: () => {}, cancelled: false, duration: Number(options.duration) }
  const finished = new Promise<void>(resolve => { entry.resolve = resolve })
  pending.push(entry)
  return { finished, cancel() { entry.cancelled = true; entry.resolve() } }
}, querySelectorAll() { return [] }, getBoundingClientRect() { return { width: 300, height: 600 } } } as unknown as HTMLElement
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
assert.equal(pending[3]!.duration, mobileMotion.expand, 'cover detail reveal uses the synchronized surface duration')
pending[3]!.resolve()
await setImmediate()
assert.equal(surfaceCompleted, 1)

let dismissCompleted = 0
motion.play(node, node, 'pop', false, true, false, () => { dismissCompleted++ })
assert.equal(pending[4]!.duration, mobileMotion.dismiss, 'destination hold uses the short return duration')
assert.equal(pending[5]!.duration, mobileMotion.dismiss, 'detail dismissal uses the short return duration')
pending[4]!.resolve()
pending[5]!.resolve()
await setImmediate()
assert.equal(dismissCompleted, 1)

motion.cancel()
console.log('Mobile navigation: natural playlist return, direction, timings, interruption and reduced motion passed')
