import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { compileModule } from 'svelte/compiler'
import ts from 'typescript'
import { createMobileSwipe, mobileDrag, mobileSheet } from './mobile-interaction.ts'

const swipe = createMobileSwipe(true)
swipe.start(100, 100)
swipe.move(40, 104)
assert.equal(swipe.end(), null, 'short drag returns without changing tracks')
swipe.start(100, 100)
swipe.move(20, 103)
assert.equal(swipe.end(), 'next')
assert.equal(swipe.end(), null, 'one action per gesture')
swipe.start(100, 100)
swipe.move(180, 103)
assert.equal(swipe.end(), 'previous')
swipe.start(100, 100)
swipe.move(105, 120)
swipe.move(250, 205)
assert.equal(swipe.end(), 'dismiss', 'axis stays locked after a direction change')
swipe.start(100, 100)
swipe.move(100, 240)
swipe.cancel()
assert.equal(swipe.end(), null, 'cancel must never dismiss')
const sheet = createMobileSwipe()
sheet.start(100, 100)
sheet.move(0, 105)
assert.equal(sheet.end(), null, 'panel handles cannot change tracks')
sheet.start(100, 100)
sheet.move(100, 0)
assert.equal(sheet.end(), null, 'upward drag must not dismiss')

const listeners = new Map()
const style = { removeProperty(name) { delete this[name] } }
let captured = false
const node = { style, parentElement: null, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key), setPointerCapture() { captured = true }, hasPointerCapture: () => captured, releasePointerCapture() { captured = false } }
globalThis.document = { documentElement: { classList: { contains: () => true } } }
globalThis.window = { matchMedia: () => ({ matches: true }) }

// mobileSheet：只有「移动端 + 非 reduced-motion」才给时长，否则退化成瞬切（duration 0）
const media = globalThis.window.matchMedia
globalThis.window.matchMedia = () => ({ matches: false })
const sheetMotion = mobileSheet(node)
assert.equal(sheetMotion.duration, 480, '入场默认 480ms')
assert.equal(sheetMotion.css(0), 'translate: 0 -100dvh', '起点完全在屏幕上方外')
assert.equal(sheetMotion.css(1), 'translate: 0 0dvh', '终点落回原位')
assert.equal(mobileSheet(node, { duration: 360 }).duration, 360, '出场时长可覆盖')
globalThis.document.documentElement.classList.contains = () => false
assert.equal(mobileSheet(node).duration, 0, '桌面端不播下落动画')
globalThis.document.documentElement.classList.contains = () => true
globalThis.window.matchMedia = () => ({ matches: true })
assert.equal(mobileSheet(node).duration, 0, 'reduced-motion 下退化为瞬切')
globalThis.window.matchMedia = media

let actions = 0
let blocked = false
const action = mobileDrag(node, { close: () => actions++, blocked: () => blocked })
const event = (y, type = 'pointermove') => ({ pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: y, type, target: { closest: () => null } })
listeners.get('pointerdown')(event(100))
listeners.get('pointermove')(event(230))
listeners.get('pointercancel')(event(230, 'pointercancel'))
assert.equal(actions, 0)
assert.equal(captured, false)
listeners.get('pointerdown')(event(100))
listeners.get('pointerup')(event(230, 'pointerup'))
listeners.get('pointerup')(event(230, 'pointerup'))
assert.equal(actions, 1)
let suppressed = false
listeners.get('click')({ preventDefault() {}, stopImmediatePropagation() { suppressed = true } })
assert.equal(suppressed, true, 'drag-generated click is suppressed')
blocked = true
listeners.get('pointerdown')(event(100))
listeners.get('pointerup')(event(250, 'pointerup'))
assert.equal(actions, 1)
action.destroy()
assert.equal(listeners.size, 0)

// Lost capture and interactive children cannot dispatch a track or dismiss action.
blocked = false
const rootStyle = { removeProperty(name) { delete this[name] } }
const root = { style: rootStyle }
let previous = 0
let next = 0
let closeOffset = ''
const coverAction = mobileDrag(node, { target: () => root, close: () => { closeOffset = rootStyle.translate }, previous: () => previous++, next: () => next++ })
listeners.get('pointerdown')(event(100))
listeners.get('pointermove')({ ...event(103), clientX: 180 })
assert.equal(style.translate, '32px 0px', 'horizontal movement belongs to the cover')
assert.equal(rootStyle.translate, undefined, 'horizontal movement does not shift the fullscreen player')
listeners.get('lostpointercapture')(event(103, 'lostpointercapture'))
listeners.get('pointerup')({ ...event(103, 'pointerup'), clientX: 180 })
assert.equal(previous, 0, 'lost capture cancels the pending track switch')
assert.equal(style.translate, undefined)
listeners.get('pointerdown')({ ...event(100), target: { closest: () => ({ tagName: 'BUTTON' }) } })
listeners.get('pointerup')(event(250, 'pointerup'))
assert.equal(closeOffset, '', 'buttons do not start a drag')
listeners.get('pointerdown')(event(100))
listeners.get('pointerup')({ ...event(102, 'pointerup'), clientX: 36 })
assert.equal(next, 1, 'exact horizontal threshold triggers once')
listeners.get('pointerup')({ ...event(102, 'pointerup'), clientX: 20 })
assert.equal(next, 1)
listeners.get('pointerdown')(event(100))
listeners.get('pointerup')(event(200, 'pointerup'))
assert.equal(closeOffset, '0px 100px', 'dismiss animation starts from the current drag position')
coverAction.destroy()
assert.equal(rootStyle.translate, undefined)
assert.equal(listeners.size, 0)

// Compile the real router, replacing only network/player dependencies.
const source = new URL('../stores/router.svelte.ts', import.meta.url)
let js = ts.transpileModule(await readFile(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText
js = js.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '')
js = `const ncm = {}, player = {}, auth = {}, extractColor = () => '#141414';
const createLruCache = () => ({ get: () => null, set() {}, clear() {} });
const loadPlaylistDetail = async (_, id) => ({ detail: { id, tracks: [] }, heroColor: '#141414' });
const loadAlbumDetail = loadPlaylistDetail;
const loadPlaylistMore = async () => {};
const loadArtistDetail = async id => ({ artist: { id }, songs: [], albums: [] });\n` + js
const cache = new URL('../../../node_modules/.cache/mobile-navigation-test/', import.meta.url)
await mkdir(cache, { recursive: true })
const moduleFile = new URL('router.mjs', cache)
await writeFile(moduleFile, compileModule(js, { filename: source.pathname, generate: 'client' }).js.code)
const { router } = await import(moduleFile.href)
router.handleNav('home')
router.handleNav('settings', undefined, true)
router.handleNav('search', undefined, true)
await router.goPlaylist(123)
assert.deepEqual(router.routeStack.map(r => r.view), ['home', 'settings', 'search'])
router.goBack()
assert.equal(router.activeView, 'search')
router.goBack()
assert.equal(router.activeView, 'settings')
router.goBack()
assert.equal(router.activeView, 'home')
router.handleNav('library')
router.handleNav('dailyHistory', undefined, true)
assert.equal(router.routeStack.length, 1, 'history page pushes once')
router.goBack()
assert.equal(router.activeView, 'library')
router.handleNav('search', undefined, true)
router.handleNav('search', undefined, true)
assert.equal(router.routeStack.length, 1, 'same destination does not push itself')
router.handleNav('explore')
assert.equal(router.routeStack.length, 0, 'tab navigation resets secondary history')
router.handleNav('settings')
assert.equal(router.routeStack.length, 0, 'desktop default keeps existing navigation behavior')
console.log('mobile interaction: navigation, axis lock, thresholds, cancellation, click suppression and cleanup passed')
