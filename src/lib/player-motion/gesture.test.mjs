import assert from 'node:assert/strict'
import { createPlayerSurfaceController } from './controller.ts'
import { playerSurfaceGesture } from './gesture.ts'

class Events {
  handlers = new Map()
  focus() {}
  addEventListener(name, handler) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set())
    this.handlers.get(name).add(handler)
  }
  removeEventListener(name, handler) {
    this.handlers.get(name)?.delete(handler)
    if (!this.handlers.get(name)?.size) this.handlers.delete(name)
  }
  emit(type, extra = {}) {
    const event = { type, isPrimary: true, button: 0, pointerId: 1, clientX: 100, clientY: 700, timeStamp: 0,
      preventDefault() { this.prevented = true }, stopImmediatePropagation() { this.stopped = true }, ...extra }
    for (const handler of this.handlers.get(type) ?? []) handler(event)
    return event
  }
}
globalThis.window = new Events()
const node = new Events()
const runs = []
const controller = createPlayerSurfaceController({
  reducedMotion: () => false, viewportHeight: () => 800,
  animate(_value, target, options) { runs.push({ target, complete: options.onComplete }); return { stop() {} } },
})
let track = 0
let blocked = false
const options = { controller, opening: true, blocked: () => blocked, changeTrack: direction => { track += direction } }
const action = playerSurfaceGesture(node, options)
node.emit('pointerdown')
window.emit('pointermove', { clientY: 600, timeStamp: 60 })
assert.equal(controller.phase, 'dragging')
assert.equal(controller.sheetProgress.get(), 100 / 360)
window.emit('pointermove', { pointerId: 2, clientY: 100, timeStamp: 110 })
assert.equal(controller.sheetProgress.get(), 100 / 360, 'another finger cannot move the primary gesture')
window.emit('pointerup', { clientY: 600, timeStamp: 80 })
assert.equal(runs.at(-1).target, 1, 'release before a sheet mounts still starts the correct spring')
assert.equal(window.handlers.size, 0)
assert.ok(node.emit('click', { detail: 1 }).stopped, 'release click cannot immediately trigger a second open')
assert.ok(!node.emit('click', { detail: 0 }).prevented, 'keyboard activation remains available')
runs.at(-1).complete()
action.update({ ...options, opening: false })
node.emit('pointerdown')
window.emit('pointermove', { clientY: 840, timeStamp: 100 })
assert.ok(controller.sheetProgress.get() < 1)
window.emit('pointercancel')
assert.equal(runs.at(-1).target, 1)
runs.at(-1).complete()

node.emit('pointerdown')
window.emit('pointermove', { clientX: 20, clientY: 702, timeStamp: 100 })
window.emit('pointermove', { clientX: 20, clientY: 900, timeStamp: 110 })
assert.equal(controller.phase, 'open', 'horizontal direction lock prevents closing after a diagonal change')
window.emit('pointerup', { clientX: 20, clientY: 900, timeStamp: 120 })
assert.equal(track, 1)

for (const reason of ['blur', 'resize', 'lostpointercapture']) {
  node.emit('pointerdown')
  window.emit('pointermove', { clientY: 800, timeStamp: 100 })
  if (reason === 'lostpointercapture') node.emit(reason)
  else window.emit(reason)
  assert.equal(runs.at(-1).target, 1, `${reason} restores the original target`)
  assert.equal(window.handlers.size, 0)
  runs.at(-1).complete()
}
blocked = true
node.emit('pointerdown')
assert.equal(window.handlers.size, 0, 'an open panel blocks the player gesture')
blocked = false
node.emit('pointerdown', { isPrimary: false })
assert.equal(window.handlers.size, 0)
node.emit('pointerdown')
window.emit('pointermove', { clientY: 800, timeStamp: 100 })
action.destroy()
assert.equal(window.handlers.size, 0)
assert.equal(node.handlers.size, 0)
controller.destroy()
console.log('player surface gesture: mount handoff, axis lock, multi-touch, cancellation, click suppression and cleanup passed')
