import assert from 'node:assert/strict'
import { miniLyricMotion, createMobilePlayerMotion } from './mobile-player-motion.ts'
import { rememberCardOrigin, hasCoverOrigin, flyCover } from './desktop-motion.ts'

let reduce = false
globalThis.window = { matchMedia: () => ({ matches: reduce }) }
const calls = []
const element = (rect) => ({
  style: {}, isConnected: true, rect,
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
const cover = element(large), title = element({ left: 24, top: 470, width: 300, height: 56 }), lyrics = element()
let mode = false
const root = { isConnected: true, classList: { contains: () => mode }, querySelector: selector => selector.includes('cover') ? cover : selector.includes('info') ? title : lyrics }
globalThis.getComputedStyle = () => ({ borderRadius: '12px' })
const controller = createMobilePlayerMotion()
const change = () => { mode = !mode; cover.rect = mode ? small : large }
calls.length = 0
await controller.change(root, change)
assert.equal(mode, true)
assert.match(calls[0].frames[0].transform, /translate\(0px,86px\) scale\(6.25,6.25\)/, 'cover starts at its previous size and position')
assert.equal(calls.length, 3, 'cover, title and lyrics animate together')
const pending = [...calls]
await controller.change(root, change)
assert.equal(mode, false)
assert.ok(pending.every(call => call.animation.cancelled), 'reversal cancels old animations')
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
assert.equal(calls.length, count + 2, 'two changes in one frame only animate the final mode')
controller.destroy()

let frame, removed = false
const sourceImage = { complete: true, naturalWidth: 100, src: 'cover.jpg', getBoundingClientRect: () => small }
const event = { target: { closest: selector => selector.startsWith('.library') ? null : { querySelector: () => sourceImage } } }
const target = element(large)
const clone = { ...element(), setAttribute() {}, remove() { removed = true } }
globalThis.document = { documentElement: { classList: { contains: () => true } }, createElement: () => clone, body: { append() {} } }
globalThis.requestAnimationFrame = callback => { frame = callback; return 1 }
globalThis.cancelAnimationFrame = () => { frame = null }
globalThis.HTMLImageElement = class {}
rememberCardOrigin(event)
assert.equal(hasCoverOrigin(), true, 'mobile clicks remember the card cover')
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
console.log('mobile player motion: lyric/status, interruption, layout, reduced motion and shared cover passed')
