import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { compileModule } from 'svelte/compiler'
import ts from 'typescript'
import { createMobileSwipe, mobileDrag, mobileSheet, mobileLongPress } from './mobile-interaction.ts'

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
assert.equal(sheetMotion.duration, 280, '入场默认 280ms')
assert.equal(sheetMotion.css(0), 'translate: 0 100%', '起点在面板下方')
assert.equal(sheetMotion.css(1), 'translate: 0 0%', '终点回到原位')
node.dataset = { sheetDismissed: 'true' }
assert.equal(mobileSheet(node).duration, 0, '拖动完成关闭不重复退出')
delete node.dataset.sheetDismissed
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

// Long press owns only the card gesture; scrolling and independent controls cancel it.
const originalGlobals = { window: globalThis.window, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
const pressTimers = new Map()
let clock = 0
let timerId = 0
function advancePress(ms) {
  const end = clock + ms
  for (;;) {
    const next = [...pressTimers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
    if (!next) break
    clock = next[1].at
    pressTimers.delete(next[0])
    next[1].fn()
  }
  clock = end
}
function eventSurface() {
  const handlers = new Map()
  return {
    handlers,
    addEventListener(type, fn, capture = false) { handlers.set(`${type}:${!!capture}`, fn) },
    removeEventListener(type, fn, capture = false) {
      const key = `${type}:${!!capture}`
      assert.equal(handlers.get(key), fn, `remove the registered ${type} listener`)
      handlers.delete(key)
    },
    emit(type, event = {}) { for (const [key, fn] of handlers) if (key.startsWith(`${type}:`)) fn(event) },
  }
}
const pressWindow = eventSurface()
const pressCard = eventSurface()
const pressEvent = (extra = {}) => ({ pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: 100, target: { closest: () => null }, ...extra })
let mobile = true
let canManage = true
let opens = 0
let longPressAction
try {
  globalThis.window = pressWindow
  globalThis.setTimeout = (fn, ms) => {
    const id = ++timerId
    pressTimers.set(id, { at: clock + ms, fn })
    return id
  }
  globalThis.clearTimeout = id => pressTimers.delete(id)
  longPressAction = mobileLongPress(pressCard, { enabled: () => mobile && canManage, open: () => opens++ })

  pressCard.emit('pointerdown', pressEvent())
  advancePress(499)
  assert.equal(opens, 0, '499ms does not open the actions')
  advancePress(1)
  assert.equal(opens, 1, '500ms opens the actions')
  advancePress(1000)
  assert.equal(opens, 1, 'a held gesture opens only once')
  pressWindow.emit('pointerup', pressEvent())
  let prevented = false
  let stopped = false
  const pressClick = detail => ({ detail, preventDefault() { prevented = true }, stopImmediatePropagation() { stopped = true } })
  pressCard.emit('click', pressClick(0))
  assert.equal(prevented, false, 'keyboard-generated click remains available after long press')
  pressCard.emit('click', pressClick(1))
  assert.equal(prevented && stopped, true, 'release click cannot open the playlist after long press')
  prevented = stopped = false
  pressCard.emit('click', pressClick(1))
  assert.equal(prevented || stopped, false, 'only the gesture release click is suppressed')

  pressCard.emit('pointerdown', pressEvent())
  advancePress(200)
  pressWindow.emit('pointerup', pressEvent())
  advancePress(500)
  assert.equal(opens, 1, 'short clicks do not open the actions')
  pressCard.emit('click', pressClick(1))
  assert.equal(prevented || stopped, false, 'short click remains an ordinary card click')

  pressCard.emit('pointerdown', pressEvent())
  pressWindow.emit('pointermove', pressEvent({ pointerId: 2, clientX: 140 }))
  assert.equal(pressTimers.size, 1, 'another pointer does not cancel the primary gesture')
  pressWindow.emit('pointermove', pressEvent({ clientX: 110 }))
  advancePress(500)
  assert.equal(opens, 1, 'movement at the 10px threshold cancels long press')
  assert.equal(pressTimers.size, 0, 'movement clears the timer')
  pressCard.emit('click', pressClick(1))
  assert.equal(prevented && stopped, true, 'a moved gesture cannot open the playlist')
  prevented = stopped = false

  for (const type of ['pointercancel', 'scroll', 'blur']) {
    pressCard.emit('pointerdown', pressEvent())
    advancePress(200)
    pressWindow.emit(type, pressEvent())
    advancePress(500)
    assert.equal(opens, 1, `${type} cancels a pending long press`)
    assert.equal(pressTimers.size, 0, `${type} clears the timer`)
  }

  pressCard.emit('pointerdown', pressEvent({ target: { closest: () => ({ tagName: 'BUTTON' }) } }))
  advancePress(500)
  assert.equal(opens, 1, 'independent card buttons do not start long press')
  assert.equal(pressTimers.size, 0)
  for (const extra of [{ isPrimary: false }, { button: 2 }]) {
    pressCard.emit('pointerdown', pressEvent(extra))
    assert.equal(pressTimers.size, 0, 'only the primary left-button gesture starts a timer')
  }

  canManage = false
  pressCard.emit('pointerdown', pressEvent())
  assert.equal(pressTimers.size, 0, 'disabled card does not start long press')
  canManage = true
  mobile = false
  pressCard.emit('pointerdown', pressEvent())
  assert.equal(pressTimers.size, 0, 'the desktop enabled callback does not start long press')
  mobile = true
  pressCard.emit('pointerdown', pressEvent())
  canManage = false
  advancePress(500)
  assert.equal(opens, 1, 'permission changes before the threshold cancel opening')
  pressWindow.emit('pointerup', pressEvent())
  canManage = true

  pressCard.emit('pointerdown', pressEvent())
  assert.equal(pressTimers.size, 1)
  longPressAction.destroy()
  longPressAction = undefined
  assert.equal(pressTimers.size, 0, 'destroy clears the pending timer')
  assert.equal(pressCard.handlers.size, 0, 'destroy removes card listeners')
  assert.equal(pressWindow.handlers.size, 0, 'destroy removes global listeners')
  advancePress(500)
  assert.equal(opens, 1, 'destroyed actions cannot open later')
} finally {
  longPressAction?.destroy()
  Object.assign(globalThis, originalGlobals)
}

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
console.log('mobile interaction: navigation, axis lock, long press, thresholds, cancellation, click suppression and cleanup passed')
