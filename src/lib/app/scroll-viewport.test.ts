import assert from 'node:assert/strict'
import { trackScrollTop, restoreScrollTop } from './scroll-viewport.ts'

const frames = new Map<number, FrameRequestCallback>()
let nextFrame = 0
globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame }
globalThis.cancelAnimationFrame = frame => { frames.delete(frame) }
function paint(): void {
  const pending = [...frames.values()]
  frames.clear()
  for (const callback of pending) callback(0)
}

class Scroller extends EventTarget {
  scrollTop = 0
}
const element = new Scroller()
const viewport = { element: () => element as unknown as HTMLElement, top: () => 0, entered() {} }
const stop = trackScrollTop('recent-test', viewport)
element.scrollTop = 240
element.dispatchEvent(new Event('scroll'))
paint()
stop()
element.scrollTop = 0
restoreScrollTop('recent-test', viewport)
assert.equal(element.scrollTop, 240)
paint()
assert.equal(element.scrollTop, 240, 'next-frame restore uses the captured viewport without getContext')

element.scrollTop = 0
const cancelRestore = restoreScrollTop('recent-test', viewport)
element.scrollTop = 80
cancelRestore()
paint()
assert.equal(element.scrollTop, 80, 'leaving the page cancels the delayed restore')

const managed = { ...viewport, restoresScroll: true }
const stopManaged = trackScrollTop('recent-test', managed)
element.scrollTop = 900
element.dispatchEvent(new Event('scroll'))
paint()
restoreScrollTop('recent-test', managed)
assert.equal(element.scrollTop, 900, 'page helpers never override the mobile shell')
stopManaged()
element.scrollTop = 0
restoreScrollTop('recent-test', viewport)
paint()
assert.equal(element.scrollTop, 240, 'hidden mobile pages cannot overwrite desktop scroll records')

const stopBeforePaint = trackScrollTop('daily-test', viewport)
element.scrollTop = 600
element.dispatchEvent(new Event('scroll'))
stopBeforePaint()
paint()
element.scrollTop = 0
restoreScrollTop('daily-test', viewport)
assert.equal(element.scrollTop, 0, 'teardown cancels a pending scroll recording')
trackScrollTop('missing', null)()
restoreScrollTop('missing', null)()
assert.equal(frames.size, 0)
console.log('scroll viewport: captured context, restoration ownership and frame cleanup passed')
