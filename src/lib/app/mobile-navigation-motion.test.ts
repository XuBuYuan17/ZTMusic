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
assert.equal(mobilePageFrames('push', false, true, true)[1].transform, 'none', 'source page remains still below the detail reveal')

const returnIncoming = mobilePageFrames('pop', true, false, true)
const returnOutgoing = mobilePageFrames('pop', false, false, true)
assert.equal(returnIncoming[0].transform, 'translate3d(-10px,0,0) scale(.985)', 'source page participates from the first back-navigation frame')
assert.equal(returnIncoming.at(-1)?.transform, 'none', 'source page settles at its real position')
assert.equal(returnOutgoing.at(-1)?.clipPath, 'inset(0 0 0 0 round 0px)', 'return never squashes the full detail page back into the source card')
assert.equal(returnOutgoing.at(-1)?.opacity, 0, 'detail page clears by the end of the layered back transition')
assert.equal(returnOutgoing.at(-1)?.transform, 'translate3d(44px,0,0) scale(.992)', 'detail page exits right instead of falling into a floating cover clone')
assert.equal(returnOutgoing[1]?.offset, .48, 'back transition accelerates early and finishes decisively')
assert.ok(mobileMotion.dismiss < mobileMotion.expand, 'return should be faster than the initial reveal')
assert.equal(mobileMotion.dismiss, 260, 'playlist dismissal should stay short and responsive')

const pending: Array<{ resolve: () => void; cancelled: boolean; duration: number; easing: string }> = []
const node = { animate(_frames: Keyframe[], options: KeyframeAnimationOptions) {
  const entry = { resolve: () => {}, cancelled: false, duration: Number(options.duration), easing: String(options.easing || '') }
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
assert.equal(pending[4]!.duration, mobileMotion.dismiss, 'destination page uses the short return duration')
assert.equal(pending[5]!.duration, mobileMotion.dismiss, 'detail page uses the same short return duration')
assert.equal(pending[4]!.easing, mobileMotion.exit)
assert.equal(pending[5]!.easing, mobileMotion.exit)
pending[4]!.resolve()
pending[5]!.resolve()
await setImmediate()
assert.equal(dismissCompleted, 1)
assert.equal(pending.length, 6, 'playlist back uses only two page animations; no third floating-cover animation is created')

motion.cancel()
console.log('Mobile navigation: layered playlist back transition, direction, timings, interruption and reduced motion passed')