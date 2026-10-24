import assert from 'node:assert/strict'
import { settingsBackGesture } from './settings-back-gesture.ts'

class Events {
  handlers = new Map()
  captured = null
  addEventListener(name, handler) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set())
    this.handlers.get(name).add(handler)
  }
  removeEventListener(name, handler) {
    this.handlers.get(name)?.delete(handler)
    if (!this.handlers.get(name)?.size) this.handlers.delete(name)
  }
  getBoundingClientRect() { return { left: 0 } }
  setPointerCapture(id) { this.captured = id }
  hasPointerCapture(id) { return this.captured === id }
  releasePointerCapture() { this.captured = null }
  emit(type, extra = {}) {
    const event = { type, pointerId: 1, isPrimary: true, button: 0, clientX: 8, clientY: 100,
      target: { closest: () => null }, detail: 1,
      preventDefault() { this.prevented = true }, stopImmediatePropagation() { this.stopped = true }, ...extra }
    for (const handler of this.handlers.get(type) ?? []) handler(event)
    return event
  }
}
let mobile = true, panel = false, enabled = true, returns = 0
globalThis.document = { documentElement: { classList: { contains: name => name === 'mobile-runtime' ? mobile : panel } } }
globalThis.window = new Events()
const node = new Events()
const action = settingsBackGesture(node, { enabled: () => enabled, back: () => returns++ })

node.emit('pointerdown')
assert.ok(node.emit('pointermove', { clientX: 90 }).prevented)
node.emit('lostpointercapture', { target: {} })
assert.equal(node.captured, 1, 'implicit touch capture moving from a child to the scroller must not cancel back')
node.emit('pointerup', { clientX: 100 })
node.emit('pointerup', { clientX: 100 })
assert.equal(returns, 1, 'one edge swipe returns once')
assert.equal(node.captured, null)
assert.equal(window.handlers.size, 0)
assert.ok(!node.emit('click', { detail: 0 }).prevented, 'keyboard activation survives a swipe')
assert.ok(node.emit('click').stopped, 'the release click cannot open another settings category')
node.emit('pointerdown')
node.emit('pointermove', { clientX: 90 })
node.emit('pointercancel')
node.emit('pointerdown', { target: { closest: () => ({}) } })
assert.ok(!node.emit('click').prevented, 'a fresh button press must clear unused release-click suppression')

for (const extra of [{ clientX: 80 }, { isPrimary: false }, { button: 2 }, { target: { closest: () => ({}) } }]) {
  node.emit('pointerdown', extra)
  node.emit('pointerup', { clientX: 150 })
}
assert.equal(returns, 1, 'non-edge gestures and interactive controls cannot trigger back')
node.emit('pointerdown')
assert.ok(!node.emit('pointermove', { clientX: 12, clientY: 200 }).prevented)
node.emit('pointerup', { clientX: 150, clientY: 200 })
assert.equal(returns, 1, 'vertical scrolling keeps ownership even if the finger later moves sideways')
node.emit('pointerdown')
node.emit('pointermove', { clientX: 42 })
node.emit('pointerup', { clientX: 45 })
assert.equal(returns, 1, 'a short swipe stays on the settings child')

for (const reason of ['pointercancel', 'lostpointercapture', 'mobile-view-change', 'blur', 'resize']) {
  node.emit('pointerdown')
  node.emit('pointermove', { clientX: 100 })
  if (reason === 'blur' || reason === 'resize') window.emit(reason)
  else node.emit(reason, reason === 'lostpointercapture' ? { target: node } : {})
  node.emit('pointerup', { clientX: 150 })
}
assert.equal(returns, 1, 'cancellation and layout/navigation changes never commit a return')

node.emit('pointerdown')
node.emit('pointermove', { pointerId: 2, clientX: 150 })
node.emit('pointercancel')
assert.equal(returns, 1, 'another pointer cannot take over')
for (const kind of ['panel', 'desktop', 'root']) {
  panel = kind === 'panel'; mobile = kind !== 'desktop'; enabled = kind !== 'root'
  node.emit('pointerdown')
  node.emit('pointerup', { clientX: 150 })
}
assert.equal(returns, 1, 'panels, desktop layout and the category index disable swipe back')
mobile = enabled = true; panel = false
node.emit('pointerdown')
node.emit('pointermove', { clientX: 100 })
panel = true
node.emit('pointerup', { clientX: 150 })
assert.equal(returns, 1, 'a panel opened mid-gesture cancels the page return')
panel = false
node.emit('pointerdown')
action.destroy()
assert.equal(node.handlers.size, 0)
assert.equal(window.handlers.size, 0)
console.log('settings swipe back: edge lock, controls, panels, cancellation, click suppression and cleanup passed')
