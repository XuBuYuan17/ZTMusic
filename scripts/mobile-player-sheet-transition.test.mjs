import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [app, mini, sheet, mobile] = await Promise.all([
  read('src/App.svelte'),
  read('src/lib/components/MobileMiniPlayer.svelte'),
  read('src/lib/components/LyricsPageV2.svelte'),
  read('src/lib/components/MobileApp.svelte'),
])

// The branded startup overlay is gone; normal player interactions must no longer carry
// startup-only gating or metadata.
assert.doesNotMatch(app, /StartupSplash|startupActive|startupShellReady|startupPending/, 'app shell must not depend on branded splash state')
assert.doesNotMatch(mini, /startupPending|data-startup-cover/, 'mini player must not carry splash handoff state')
assert.doesNotMatch(sheet, /startupPending|playerFocus/, 'fullscreen player must use its normal enter/focus lifecycle only')
assert.match(sheet, /use:enter use:dialogFocus=\{close\}/, 'player sheet enter motion and focus lifecycle mount together')
assert.ok(mobile.includes('use:playerSurfaceGesture={{ controller: playerController, opening: true'), 'floating artwork keeps the drag-to-open gesture')
assert.ok(app.includes('playerController={mobileSurface}'), 'floating artwork and the full player share the same controller')

// Protect the visual contract with the real renderer, without locking its animation API.
const { createPlayerSurfaceController } = await import('../src/lib/player-motion/controller.ts')
const { renderPlayerSurface } = await import('../src/lib/player-motion/renderer.ts')
const { MotionGlobalConfig, processFrame } = await import('motion')
MotionGlobalConfig.useManualTiming = true
class Styles {
  values = new Map()
  getPropertyValue(name) { return this.values.get(name)?.value || '' }
  getPropertyPriority(name) { return this.values.get(name)?.priority || '' }
  setProperty(name, value, priority = '') { this.values.set(name, { value, priority }) }
  removeProperty(name) { this.values.delete(name) }
}
class Node extends EventTarget {
  style = new Styles()
  className = ''
  classList = { add() {}, remove() {} }
  children = []
  nodes = new Map()
  constructor(rect = { left: 24, top: 120, width: 320, height: 320 }) { super(); this.rect = rect }
  getBoundingClientRect() { return this.rect }
  querySelector(selector) { return this.nodes.get(selector) || null }
  querySelectorAll(selector) { return selector.startsWith('.am-track-info') ? [this.nodes.get('.content')].filter(Boolean) : [] }
  cloneNode() { return new Node(this.rect) }
  setAttribute() {}
  removeAttribute() {}
  append(node) { this.children.push(node) }
  remove() { this.removed = true }
}
const classes = new Set()
const html = { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } }
const media = new EventTarget()
globalThis.window = Object.assign(new EventTarget(), { matchMedia: () => media })
globalThis.document = Object.assign(new EventTarget(), { documentElement: html, hidden: false })
globalThis.innerWidth = 390
globalThis.innerHeight = 844
globalThis.getComputedStyle = () => ({ opacity: '.8', transform: 'none', borderRadius: '12px', padding: '8px' })
const root = new Node(), player = new Node(), container = new Node(), nav = new Node(), artwork = new Node()
const backdrop = new Node(), background = new Node(), content = new Node()
const miniNode = new Node({ left: 16, top: 700, width: 358, height: 64 })
miniNode.nodes.set('.mini-player-artwork', new Node({ left: 24, top: 710, width: 44, height: 44 }))
root.nodes = new Map([['.ly-container', container], ['.apple-music-player', player], ['.am-flying-cover', artwork], ['.m-player-backdrop', backdrop], ['.am-bg', background], ['.content', content]])
document.querySelector = selector => selector === '.mobile-mini-player' ? miniNode : selector === '.mobile-tab-bar' ? nav : null
const runs = []
const surface = createPlayerSurfaceController({ reducedMotion: () => false, animate(_value, target, options) {
  runs.push({ target, complete: options.onComplete }); return { stop() {} }
} })
let suspended = 0
player.addEventListener('mobile-player-suspend', () => suspended++)
const renderer = renderPlayerSurface(root, surface)
surface.open()
assert.equal(suspended, 1)
assert.equal(artwork.style.getPropertyValue('visibility'), 'hidden')
assert.equal(root.children.length, 2, 'shared artwork and mini text have independent visual layers')
assert.equal(nav.style.getPropertyValue('transform'), 'translateY(0%)')
surface.sheetProgress.set(.5)
processFrame(16)
assert.equal(nav.style.getPropertyValue('transform'), 'translateY(50%)')
assert.equal(backdrop.style.getPropertyValue('opacity'), '0.5')
assert.equal(content.style.getPropertyValue('opacity'), '0.4')
assert.equal(container.style.getPropertyValue('clip-path'), 'inset(350px 8px 40px 8px round 0px)')
const shared = root.children[1]
assert.equal(shared.style.transform, 'translate(24px, 415px) scale(0.56875)')
const midpoint = shared.style.transform
surface.close()
assert.equal(shared.style.transform, midpoint, 'reversal keeps exactly the current shared-cover geometry')
assert.equal(root.children.length, 2, 'reversal reuses the visual layers')
runs[0].complete()
assert.equal(surface.phase, 'animating', 'stale callbacks cannot end the active closing transition')
surface.open()
runs.at(-1).complete()
assert.equal(artwork.style.getPropertyValue('visibility'), '')
assert.ok(root.children.every(node => node.removed), 'endpoint handoff removes shared visual layers')
assert.equal(nav.style.getPropertyValue('transform'), '')
assert.ok(classes.has('mobile-player-expanded'))
surface.close()
runs.at(-1).complete()
assert.ok(!classes.has('mobile-player-expanded'))
renderer.destroy()
surface.destroy()

// No source artwork: the shell still follows the progress, without invalid cover math.
root.children = []
root.nodes.delete('.am-flying-cover')
const fallback = createPlayerSurfaceController({ reducedMotion: () => false, animate() { return { stop() {} } } })
const fallbackRenderer = renderPlayerSurface(root, fallback)
fallback.open()
assert.equal(root.children.length, 1)
fallback.sheetProgress.set(.7)
processFrame(32)
assert.equal(nav.style.getPropertyValue('transform'), 'translateY(70%)')
fallbackRenderer.destroy()
fallback.destroy()
assert.equal(nav.style.getPropertyValue('transform'), '', 'unmount restores the navigation style')
assert.equal(container.style.getPropertyValue('clip-path'), '')

root.children = []
root.nodes.set('.am-flying-cover', artwork)
nav.rect = { left: 4, top: 760, width: 382, height: 60 }
const integrated = new Node({ left: 150, top: 770, width: 84, height: 48 })
integrated.nodes.set('.mini-player-artwork', new Node({ left: 154, top: 776, width: 36, height: 36 }))
nav.contains = node => node === integrated
nav.getBoundingClientRect = () => ({ ...nav.rect, top: nav.rect.top + (classes.has('mobile-player-expanded') && !nav.style.getPropertyValue('transform') ? 84 : 0) })
integrated.getBoundingClientRect = () => ({ ...integrated.rect, top: integrated.rect.top + (classes.has('mobile-player-expanded') && !nav.style.getPropertyValue('transform') ? 84 : 0) })
const integratedCover = integrated.nodes.get('.mini-player-artwork')
integratedCover.getBoundingClientRect = () => ({ ...integratedCover.rect, top: integratedCover.rect.top + (classes.has('mobile-player-expanded') && !nav.style.getPropertyValue('transform') ? 84 : 0) })
globalThis.getComputedStyle = () => ({ opacity: '.8', transform: 'none', borderRadius: '999px', borderTopLeftRadius: '999px', padding: '8px' })
document.querySelector = selector => selector === '.mobile-integrated-player' ? integrated : selector === '.mobile-tab-bar' ? nav : null
const integratedRuns = []
const integratedSurface = createPlayerSurfaceController({ reducedMotion: () => false, animate(_value, target, options) { integratedRuns.push({ target, complete: options.onComplete }); return { stop() {} } } })
const integratedRenderer = renderPlayerSurface(root, integratedSurface)
integratedSurface.open()
assert.equal(root.children.length, 1, 'the floating bar animates as one layer; only the shared artwork is cloned')
assert.equal(container.style.getPropertyValue('clip-path'), 'inset(760px 4px 24px 4px round 30px)', 'player opens from the whole rounded floating bar')
assert.equal(root.children[0].style.left, '0', 'the shared layer is the player artwork, not a copy of the dock bar')
assert.equal(integratedCover.style.getPropertyValue('visibility'), 'hidden', 'the moving artwork does not duplicate the dock cover')
await new Promise(resolve => setImmediate(resolve))
assert.equal(container.style.getPropertyValue('clip-path'), 'inset(760px 4px 24px 4px round 30px)', 'remeasure ignores the nav hidden by the expanded-player class')
integratedSurface.sheetProgress.set(.5)
processFrame(48)
assert.equal(nav.style.getPropertyValue('transform'), 'translateY(42px)', 'floating bar travels completely below the viewport')
assert.equal(container.style.getPropertyValue('clip-path'), 'inset(380px 2px 12px 2px round 15px)')
assert.equal(root.children[0].style.transform, 'translate(89px, 448px) scale(0.55625)', 'cover moves from its own position, not the whole bar')
const integratedMidpoint = root.children[0].style.transform
integratedSurface.close()
assert.equal(root.children[0].style.transform, integratedMidpoint, 'a quick reversal retains the floating-cover position')
integratedSurface.open()
integratedRuns.at(-1).complete()
assert.equal(integratedCover.style.getPropertyValue('visibility'), '', 'opening restores the original artwork')
integratedSurface.close()
await new Promise(resolve => setImmediate(resolve))
integratedSurface.sheetProgress.set(.5)
processFrame(64)
assert.equal(nav.style.getPropertyValue('transform'), 'translateY(42px)', 'closing measures the visible dock position even while it is hidden')
integratedRuns.at(-1).complete()
assert.equal(integratedCover.style.getPropertyValue('visibility'), '', 'closing restores the original artwork')
integratedRenderer.destroy()
integratedSurface.destroy()
MotionGlobalConfig.useManualTiming = false
console.log('mobile player sheet: continuous geometry, shared cover, navigation, reversal, ownership and cleanup passed')
