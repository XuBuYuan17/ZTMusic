import assert from 'node:assert/strict'
import { MotionGlobalConfig, processFrame } from 'motion'
import { createPlayerSurfaceController } from './controller.ts'
import { coverFrame, surfaceFrame } from './geometry.ts'

let reduce = false
let clock = 0
const runs: Array<{ target: number; velocity: number; stopped: boolean; complete: () => void }> = []
const controller = createPlayerSurfaceController({
  now: () => clock,
  reducedMotion: () => reduce,
  viewportHeight: () => 800,
  animate(_value, target, options) {
    const run = { target, velocity: options.velocity, stopped: false, complete: options.onComplete }
    runs.push(run)
    return { stop() { run.stopped = true; _value.set(_value.get() + .02) } }
  },
})
const states: string[] = []
const unsubscribe = controller.subscribe(({ phase }) => states.push(phase))
controller.open()
assert.equal(controller.phase, 'animating')
controller.sheetProgress.set(.7)
controller.close()
assert.equal(controller.sheetProgress.get(), .7, 'reversing never resets to the open endpoint')
assert.equal(runs[0]!.stopped, true)
runs[0]!.complete()
assert.equal(controller.phase, 'animating', 'a stale completion cannot unmount a reversing sheet')
controller.close()
assert.equal(runs.length, 2, 'duplicate close requests do not restart the spring')
controller.open()
assert.equal(controller.sheetProgress.get(), .7, 'reopening a closing sheet starts in place')
runs[2]!.complete()
assert.equal(controller.phase, 'open')

controller.beginDrag(700, 0)
controller.dragTo(880, 100)
assert.equal(controller.sheetProgress.get(), .5, 'closing drag maps displacement directly to progress')
controller.cancelDrag()
assert.equal(runs.at(-1)!.target, 1, 'cancellation returns to the target before this drag')
runs.at(-1)!.complete()
controller.beginDrag(700, 200)
controller.dragTo(790, 250)
controller.release(250)
assert.equal(runs.at(-1)!.target, 0, 'a fast downward flick closes even above halfway')
assert.ok(runs.at(-1)!.velocity < 0, 'downward velocity is negative progress per second')
runs.at(-1)!.complete()
assert.equal(controller.phase, 'closed')

controller.beginDrag(700, 300)
controller.dragTo(610, 350)
controller.release(350)
assert.equal(runs.at(-1)!.target, 1, 'upward velocity is not negated twice')
assert.ok(runs.at(-1)!.velocity > 0)
controller.beginDrag(610, 351)
assert.equal(controller.sheetProgress.get(), .25, 'a new pointer can take over a moving spring')
controller.cancelDrag()
assert.equal(runs.at(-1)!.target, 1, 'interrupted opening remains the cancellation target')
runs.at(-1)!.complete()
controller.beginDrag(700, 400)
controller.dragTo(900, 450)
controller.release(1000)
assert.equal(runs.at(-1)!.target, 0, 'old velocity samples expire after a stationary hold')
runs.at(-1)!.complete()

reduce = true
controller.open()
assert.equal(controller.phase, 'open')
assert.equal(controller.sheetProgress.get(), 1)
controller.close()
assert.equal(controller.phase, 'closed')
controller.beginDrag(700, 1100)
controller.dragTo(400, 1200)
assert.equal(controller.sheetProgress.get(), 0, 'reduced motion avoids a large morph while dragging')
controller.release(1200)
assert.equal(controller.phase, 'open', 'reduced motion still respects the drag destination')
controller.close()
reduce = false
controller.open()
controller.sheetProgress.set(.4)
const beforeRefresh = runs.at(-1)!
controller.refresh()
assert.ok(beforeRefresh.stopped)
assert.equal(controller.sheetProgress.get(), .4, 'visibility recovery keeps the current progress')
reduce = true
controller.refresh()
assert.equal(controller.phase, 'open', 'changing reduced motion completes the current target')
assert.equal(controller.sheetProgress.get(), 1)
reduce = false
controller.beginDrag(700, 1300)
controller.dragTo(800, 1350)
const beforeResize = runs.length
controller.refresh()
assert.equal(runs.length, beforeResize + 1, 'resize cancellation starts only one recovery spring')
assert.equal(runs.at(-1)!.velocity, 0)
unsubscribe()
controller.destroy()
const count = states.length
for (const run of runs) run.complete()
controller.open()
controller.beginDrag(0)
assert.equal(states.length, count, 'unmounted controllers ignore all pending callbacks')

const source = { left: 16, top: 700, width: 44, height: 44 }
const target = { left: 24, top: 120, width: 320, height: 320 }
for (const p of [-.1, 0, .25, .5, .7, 1, 1.1]) {
  const cover = coverFrame(p, source, target)
  assert.ok(Number.isFinite(cover.scale))
  assert.equal(cover.side, target.width * cover.scale, 'one uniform scale preserves cover aspect ratio')
  const visual = surfaceFrame(p, { ...source, width: 358, height: 64 }, { width: 390, height: 844 })
  assert.ok(visual.contentOpacity >= 0 && visual.contentOpacity <= 1)
  assert.equal(visual.navTransform, `translateY(${Math.max(0, Math.min(1, p)) * 100}%)`)
}
assert.equal(coverFrame(0, source, target).left, source.left)
assert.equal(coverFrame(1, source, target).side, target.width)
assert.equal(coverFrame(.5, source, { ...target, width: 0 }).scale, 1)

// Exercise the real Motion spring as well as the deterministic interruption driver.
MotionGlobalConfig.useManualTiming = true
processFrame(0)
const live = createPlayerSurfaceController({ reducedMotion: () => false })
live.open()
for (clock = 16; clock <= 160; clock += 16) processFrame(clock)
assert.ok(live.sheetProgress.get() > 0 && live.sheetProgress.get() < 1)
const interrupted = live.sheetProgress.get()
live.close()
assert.equal(live.sheetProgress.get(), interrupted)
for (; clock <= 3000; clock += 16) processFrame(clock)
await new Promise<void>(resolve => setImmediate(resolve))
assert.equal(live.phase, 'closed', 'the real spring completes and publishes the unmount state')
assert.equal(live.sheetProgress.get(), 0)
live.destroy()
MotionGlobalConfig.useManualTiming = false

console.log('player surface controller: continuity, velocity, cancellation, lifecycle, geometry and real Motion spring passed')
