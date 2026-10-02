import assert from 'node:assert/strict'
import { mobileFeedback } from './mobile-feedback.ts'

function surface() {
  const handlers = new Map()
  return {
    handlers,
    addEventListener(name, handler) { handlers.set(name, handler) },
    removeEventListener(name) { handlers.delete(name) },
    emit(name, event = {}) { handlers.get(name)?.(event) },
  }
}
const root = surface()
globalThis.window = surface()
const attrs = new Map()
let disabled = false, row = false
const target = {
  closest(selector) { return selector.startsWith('button') ? this : null },
  matches(selector) { return selector.includes(':disabled') ? disabled : row },
  setAttribute(name, value) { attrs.set(name, value) },
  removeAttribute(name) { attrs.delete(name) },
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 48 } },
}
const action = mobileFeedback(root)
const down = (extra = {}) => root.emit('pointerdown', { target, button: 0, isPrimary: true, pointerId: 1, clientX: 20, clientY: 20, ...extra })
down()
assert.equal(attrs.get('data-mobile-pressed'), 'control')
window.emit('pointerup', { pointerId: 2 })
assert.ok(attrs.has('data-mobile-pressed'), 'other pointers cannot release a held control')
window.emit('pointermove', { pointerId: 1, clientX: 20, clientY: 31 })
assert.equal(attrs.size, 0, 'starting a scroll cancels feedback')
down()
window.emit('pointercancel', { pointerId: 1 })
assert.equal(attrs.size, 0, 'browser cancellation clears the held state')
down({ clientX: 98 })
window.emit('pointermove', { pointerId: 1, clientX: 102, clientY: 20 })
assert.equal(attrs.size, 0, 'leaving a control cancels feedback even below movement slop')
row = true
down()
assert.equal(attrs.get('data-mobile-pressed'), 'row', 'list rows use feedback without scaling')
root.emit('scroll')
assert.equal(attrs.size, 0)
disabled = true
down()
assert.equal(attrs.size, 0, 'disabled controls do not respond')
disabled = false
root.emit('keydown', { target, key: 'Enter', repeat: false })
assert.equal(attrs.get('data-mobile-pressed'), 'row')
window.emit('keyup')
assert.equal(attrs.size, 0)
down()
action.destroy()
assert.equal(attrs.size, 0)
assert.equal(root.handlers.size + window.handlers.size, 0, 'unmount cleans up document and window listeners')
console.log('mobile feedback: pointer ownership, scrolling, cancellation, bounds, rows, disabled, keyboard and cleanup passed')
