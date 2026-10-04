import assert from 'node:assert/strict'
import { miniLyricMotion, createMobilePlayerMotion, sheetCoverTransform, mobilePlayerTiming, playerDragProgress, finishPlayerDrag } from './mobile-player-motion.ts'
import { rememberCardOrigin, hasCoverOrigin, flyCover } from './desktop-motion.ts'

assert.equal(playerDragProgress(700, 525, 700), .25)
assert.equal(playerDragProgress(700, 750, 700), 0)
assert.equal(playerDragProgress(700, -100, 700), 1)
assert.equal(playerDragProgress(700, 525, 0), 0)
assert.equal(finishPlayerDrag(.1, 0, 70), false, 'short slow pulls return to mini')
assert.equal(finishPlayerDrag(.3, 0, 210), true)
assert.equal(finishPlayerDrag(.1, -.8, 70), true, 'a deliberate upward flick completes')
assert.equal(finishPlayerDrag(.1, -.8, 20), false, 'tiny movements do not open')
assert.equal(finishPlayerDrag(.8, -.8, 500, true), false, 'pointer cancellation always returns')

let reduce = false
globalThis.window = { matchMedia: () => ({ matches: reduce }) }
const calls = []
const element = (rect) => ({
  style: { cssText: '' }, isConnected: true, rect,
  getBoundingClientRect() { return this.rect },
  getAnimations() { return [] },
  animate(frames, options) {
    let finish
    const animation = { finished: new Promise(resolve => { finish = resolve }), cancel() { this.cancelled = true } }
    calls.push({ node: this, frames, options, animation, finish })
    return animation
  },
})
const lyric = miniLyricMotion(element(), { text: '第一行', lyric: true, song: 1 })
lyric.update({ text: '第一行', lyric: true, song: 1 })
assert.equal(calls.length, 0, 'playback ticks do not replay the same line')
lyric.update({ text: '第二行', lyric: true, song: 1 })
assert.equal(calls.length, 1)
lyric.update({ text: '正在下载 20%', lyric: false, song: 1 })
assert.equal(calls[0].animation.cancelled, true, 'status change cancels an unfinished lyric animation')
lyric.update({ text: '正在下载 21%', lyric: false, song: 1 })
lyric.update({ text: '新歌曲', lyric: true, song: 2 })
assert.equal(calls.length, 1, 'download updates and track changes stay still')
reduce = true
lyric.update({ text: '新歌曲第二行', lyric: true, song: 2 })
assert.equal(calls.length, 1, 'reduced motion skips lyric animation')
reduce = false
lyric.update({ text: '新歌曲第三行', lyric: true, song: 2 })
lyric.destroy()
assert.equal(calls.at(-1).animation.cancelled, true)

const large = { left: 24, top: 150, width: 300, height: 300 }
const small = { left: 24, top: 64, width: 48, height: 48 }
const mini = { left: 20, top: 708, width: 44, height: 44 }
assert.equal(sheetCoverTransform(large, mini, 700), 'translate(-4px, -142px) scale(0.14666666666666667, 0.14666666666666667)', 'opening compensates for the moving sheet so artwork starts at the mini player')
assert.equal(sheetCoverTransform({ ...large, top: 270 }, mini, 580), sheetCoverTransform(large, mini, 700), 'a dragged sheet still closes to the same artwork position')
assert.equal(sheetCoverTransform({ ...large, width: 0 }, mini), 'none', 'unmeasurable artwork never generates an infinite transform')
const cover = element(large), title = element({ left: 24, top: 470, width: 300, height: 56 }), lyrics = element()
let mode = false
const root = { isConnected: true, classList: { contains: () => mode }, querySelector: selector => selector.includes('cover') ? cover : selector.includes('info') ? title : lyrics }
globalThis.getComputedStyle = () => ({ borderRadius: '12px' })
const controller = createMobilePlayerMotion()
const change = () => { mode = !mode; cover.rect = mode ? small : large }
calls.length = 0
await controller.change(root, change)
assert.equal(mode, true)
assert.match(calls[0].frames[0].transform, /translate\(0px,86px\) scale\(6.25\)/, 'cover starts at its previous size and position')
assert.doesNotMatch(calls[0].frames[0].transform, /scale\([^)]*,/, 'player/lyrics morph never stretches artwork on separate axes')
assert.equal(calls.length, 3, 'cover, title and lyrics animate together')
assert.equal(calls[0].options.duration, mobilePlayerTiming.enterDuration, 'cover snaps into lyrics mode without a half-second drift')
assert.equal(calls[1].options.duration, mobilePlayerTiming.enterDuration, 'title follows the cover timing')
assert.equal(calls[2].options.duration, mobilePlayerTiming.contentDuration, 'lyrics content takes over faster than the cover morph')
assert.equal(calls[2].options.delay, mobilePlayerTiming.contentDelay, 'lyrics takeover follows the initial cover response')
assert.equal(calls[0].options.easing, mobilePlayerTiming.easing)
assert.equal(calls[2].options.easing, mobilePlayerTiming.contentEasing)
assert.equal(cover.style.transition, 'none', 'CSS layout transitions are frozen while FLIP owns the cover motion')
const pending = [...calls]
await controller.change(root, change)
assert.equal(mode, false)
assert.ok(pending.every(call => call.animation.cancelled), 'reversal cancels old animations')
assert.equal(calls.at(-3).options.duration, mobilePlayerTiming.exitDuration, 'returning to artwork gets a slightly softer expansion')
const count = calls.length
reduce = true
await controller.change(root, change)
assert.equal(mode, true, 'reduced motion still changes the mode')
assert.equal(calls.length, count)
reduce = false
const interrupted = controller.change(root, change)
controller.destroy()
await interrupted
assert.equal(calls.length, count, 'unmount cancels a pending layout measurement')
const first = controller.change(root, change)
const second = controller.change(root, change)
await Promise.all([first, second])
assert.equal(mode, false)
assert.equal(calls.length, count + 4, 'two changes in one frame only animate the final mode, including controls and footer')
controller.destroy()

let frame, removed = false
const sourceImage = { complete: true, naturalWidth: 100, src: 'cover.jpg', dataset: {}, getBoundingClientRect: () => small }
const event = { target: { closest: selector => selector.startsWith('.library') ? null : { querySelector: () => sourceImage } } }
const target = element(large)
const clone = { ...element(), setAttribute() {}, remove() { removed = true } }
globalThis.document = { documentElement: { classList: { contains: () => true } }, querySelector: () => null, createElement: () => clone, body: { append() {} } }
globalThis.requestAnimationFrame = callback => { frame = callback; return 1 }
globalThis.cancelAnimationFrame = () => { frame = null }
globalThis.HTMLImageElement = class {}
rememberCardOrigin(event)
assert.equal(hasCoverOrigin(), true, 'mobile clicks remember the card cover')
assert.equal(sourceImage.dataset.sharedCoverReturn, 'true', 'shared cover keeps a return marker for reverse navigation')
const flight = flyCover(target)
frame()
assert.equal(hasCoverOrigin(), false, 'the flight consumes its card origin')
assert.equal(target.style.opacity, '0')
assert.match(calls.at(-1).frames[0].transform, /scale\(0.16, 0.16\)/)
flight.destroy()
assert.equal(target.style.opacity, '')
assert.equal(removed, true, 'navigation cleans up the floating cover')
reduce = true
rememberCardOrigin(event)
assert.equal(hasCoverOrigin(), false, 'reduced motion does not record cover origins')
console.log('mobile player motion: lyric/status, interruption, layout, responsive morph timing, uniform artwork scaling, reduced motion and shared cover passed')
