import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { createMobileNavigationMotion, finishPlaylistDismiss, mobileNavigationKind, mobilePageFrames, mobileMotion, playlistDismissProgress } from './mobile-navigation-motion.ts'

assert.equal(mobileNavigationKind('forward', false), 'push')
assert.equal(mobileNavigationKind('back', false), 'pop')
assert.equal(mobileNavigationKind('forward', true), 'tab')
assert.equal(playlistDismissProgress(100, 400), .25)
assert.equal(playlistDismissProgress(-20, 400), 0)
assert.equal(playlistDismissProgress(500, 400), 1)
assert.equal(playlistDismissProgress(100, 0), 0)
assert.equal(finishPlaylistDismiss(.24, .2, 96), false, 'short slow pulls spring back')
assert.equal(finishPlaylistDismiss(.25, .2, 100), true, 'quarter travel completes dismissal')
assert.equal(finishPlaylistDismiss(.1, .6, 70), true, 'a deliberate downward flick completes')
assert.equal(finishPlaylistDismiss(.1, .6, 20), false, 'tiny flicks do not dismiss')
assert.equal(finishPlaylistDismiss(.8, .8, 500, true), false, 'pointer cancellation always springs back')
assert.equal(mobilePageFrames('tab', true)[0].transform, 'translate3d(14px,0,0)', 'tab pages use a small directional entrance')
assert.equal(mobilePageFrames('push', true)[0].transform, 'translate3d(24px,0,0)')
assert.equal(mobilePageFrames('pop', false)[1].transform, 'translate3d(24px,0,0)')
assert.equal(mobilePageFrames('pop', true)[0].transform, 'translate3d(-24px,0,0)')
assert.equal(mobilePageFrames('push', true, true)[0].transform, 'none')
assert.equal(mobilePageFrames('push', true, true, true)[0].clipPath, 'inset(8% 8% 72% 8% round 22px)')
assert.equal(mobilePageFrames('push', true, true, true)[0].opacity, 1, 'detail reveal stays fully opaque')
assert.equal(mobilePageFrames('push', true, true, true, 'inset(10px 20px 30px 40px round 16px)')[0].clipPath, 'inset(10px 20px 30px 40px round 16px)')
assert.equal(mobilePageFrames('push', false, true, true)[1].transform, 'none', 'source page remains still below the detail reveal')

const sourceClip = 'inset(40px 180px 460px 20px round 16px)'
const returnIncoming = mobilePageFrames('pop', true, false, true, sourceClip)
const returnOutgoing = mobilePageFrames('pop', false, false, true, sourceClip)
assert.equal(returnIncoming[0].transform, 'none', 'restored source page stays still during shared-element return')
assert.equal(returnIncoming.at(-1)?.clipPath, 'inset(0 0 0 0 round 0px)', 'source page remains fully visible below the closing detail')
assert.equal(returnOutgoing.at(-1)?.clipPath, sourceClip, 'detail surface closes into the exact source cover rectangle')
assert.equal(returnOutgoing.at(-1)?.opacity, 1, 'detail stays opaque until it lands on the real source cover')
assert.equal(returnOutgoing.at(-1)?.transform, 'none', 'shared return uses clipping rather than distorting the page')

const missingSourceReturn = mobilePageFrames('pop', false, false, true)
assert.equal(missingSourceReturn.at(-1)?.opacity, 0, 'missing source geometry falls back to a safe page dismissal')
assert.ok(mobileMotion.dismiss < mobileMotion.expand, 'return is slightly faster than the initial reveal')
assert.ok(mobileMotion.dismiss >= 320, 'shared return remains long enough to read as a continuous close')

const pending: Array<{ resolve: () => void; cancelled: boolean; duration: number; easing: string; frames: Keyframe[] }> = []
const node = { animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
  const entry = { resolve: () => {}, cancelled: false, duration: Number(options.duration), easing: String(options.easing || ''), frames }
  const finished = new Promise<void>(resolve => { entry.resolve = resolve })
  pending.push(entry)
  return { finished, cancel() { entry.cancelled = true; entry.resolve() } }
}, querySelectorAll() { return [] }, getBoundingClientRect() { return { left: 20, top: 80, right: 320, bottom: 680, width: 300, height: 600 } } } as unknown as HTMLElement
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

let markerRemoved = false
const source = {
  isConnected: true,
  parentElement: {},
  getBoundingClientRect() { return { left: 40, top: 120, right: 140, bottom: 220, width: 100, height: 100 } },
  removeAttribute(name: string) { if (name === 'data-shared-cover-return') markerRemoved = true },
} as unknown as HTMLImageElement
Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => source } })
Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: () => ({ borderRadius: '16px' }) })

let dismissCompleted = 0
motion.play(node, node, 'pop', false, true, false, () => { dismissCompleted++ })
assert.equal(pending[4]!.duration, mobileMotion.dismiss, 'destination page uses the shared return duration')
assert.equal(pending[5]!.duration, mobileMotion.dismiss, 'detail page uses the same shared return duration')
assert.equal(pending[4]!.easing, mobileMotion.shared)
assert.equal(pending[5]!.easing, mobileMotion.shared)
assert.equal(pending[4]!.frames.at(-1)?.clipPath, 'inset(0 0 0 0 round 0px)', 'destination remains a stable full page')
assert.equal(pending[5]!.frames.at(-1)?.clipPath, sourceClip, 'runtime geometry closes detail into the live source card')
pending[4]!.resolve()
pending[5]!.resolve()
await setImmediate()
assert.equal(dismissCompleted, 1)
assert.equal(markerRemoved, true, 'return marker is cleared only after the detail lands on the card')
assert.equal(pending.length, 6, 'playlist back uses the two page layers without a separate floating-cover phase')

motion.cancel()
console.log('Mobile navigation: reversible playlist surface, swipe dismissal thresholds, interruption and reduced motion passed')
