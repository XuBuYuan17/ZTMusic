import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { createMobileNavigationMotion } from './mobile-navigation-motion.ts'

const callbacks = new Map()
const animations = []
const style = { removeProperty(name) { if (name === 'transform') this.transform = ''; if (name === 'will-change') this.willChange = ''; if (name === 'clip-path') this.clipPath = '' } }
const scroller = { scrollTop: 0 }
const rect = { left: 0, top: 40, right: 375, bottom: 800, width: 375, height: 760 }
const page = {
  dataset: { routeKey: 'playlist:42:1' }, style,
  querySelector: selector => selector === '.playlist-detail-page' ? {} : null,
  getBoundingClientRect: () => rect,
  closest: () => scroller,
  addEventListener: (name, fn) => callbacks.set(name, fn),
  removeEventListener: name => callbacks.delete(name),
  setPointerCapture() {}, hasPointerCapture: () => false,
  animate(frames) {
    let finish, reject
    const finished = new Promise((resolve, fail) => { finish = resolve; reject = fail })
    const animation = { frames, finished, finish, cancel() { reject(new Error('cancelled')) } }
    animations.push(animation)
    return animation
  },
}
globalThis.window = { innerWidth: 375, innerHeight: 800 }
globalThis.document = { querySelector: () => null }
globalThis.getComputedStyle = () => ({ borderRadius: '16px' })
const motion = createMobileNavigationMotion()
const source = { left: 20, top: 120, right: 120, bottom: 220, width: 100, height: 100 }
motion.play(page, null, 'push', true, true, false, () => {}, { origin: { rect: source }, hero: null, heroRect: null, heroRadius: '0px' })
animations[0].finish()
await setImmediate()
const pointer = (type, y, time) => ({ type, pointerId: 1, button: 0, isPrimary: true, clientX: 40, clientY: y, timeStamp: time, target: { closest: () => null }, preventDefault() {}, stopPropagation() {} })
callbacks.get('pointerdown')(pointer('pointerdown', 100, 0))
callbacks.get('pointermove')(pointer('pointermove', 160, 200))
assert.equal(style.transform, 'translate3d(0,60px,0)', 'sheet follows the finger')
callbacks.get('pointercancel')(pointer('pointercancel', 160, 220))
assert.equal(animations[1].frames[1].transform, 'translate3d(0,0,0)', 'cancel springs back')
animations[1].finish()
await setImmediate()
assert.equal(style.transform, '', 'cancel restores the normal layout')
callbacks.get('pointerdown')(pointer('pointerdown', 100, 300))
callbacks.get('pointermove')(pointer('pointermove', 300, 600))
callbacks.get('pointerup')(pointer('pointerup', 300, 620))
assert.equal(animations[2].frames[1].transform, 'translate3d(0,760px,0)', 'completed drag exits below the viewport')
motion.cancel()

const overlays = []
scroller.getBoundingClientRect = () => rect
page.parentElement = { insertBefore(overlay) { overlays.push(overlay) } }
globalThis.document.createElement = () => ({
  style: {}, removed: false, setAttribute() {},
  animate(frames) { return page.animate(frames) },
  remove() { this.removed = true },
})
motion.play(page, null, 'push', false, true, false, () => {})
assert.equal(overlays.length, 1, 'opening creates a background dimmer')
assert.equal(animations[3].frames[0].opacity, 0)
assert.equal(animations[3].frames[1].opacity, .22)
motion.cancel()
await setImmediate()
assert.equal(overlays[0].removed, true, 'interrupting removes the background dimmer')
motion.play(page, null, 'push', false, true, false, () => {})
animations[5].finish()
animations[6].finish()
await setImmediate()
assert.equal(overlays[1].removed, true, 'completing removes the background dimmer')
motion.cancel()
console.log('playlist sheet: follow, cancellation, recovery and completed drag passed')
