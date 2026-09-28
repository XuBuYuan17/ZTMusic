import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { compileModule } from 'svelte/compiler'
import ts from 'typescript'

// 编译真实 rune store，用可控帧时钟检查拖拽与中断，不启动播放器或网络。
const source = new URL('../stores/player-morph.svelte.ts', import.meta.url)
const javascript = ts.transpileModule(await readFile(source, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
}).outputText.replace(/from '([^']+)'/g, (_, path) => `from '${new URL(path, source).href}'`)
const compiled = compileModule(javascript, { filename: source.pathname, generate: 'client' }).js.code
const cache = new URL('../../../node_modules/.cache/player-morph-test/', import.meta.url)
await mkdir(cache, { recursive: true })
const moduleFile = new URL('store.mjs', cache)
await writeFile(moduleFile, compiled)

let now = 0
let nextId = 0
let reduce = false
let barX = 300
const frames = new Map()
const element = (rect) => ({ getBoundingClientRect: rect, focus() {} })
const cover = element(() => ({ top: 700, left: barX, right: barX + 48, bottom: 748, width: 48, height: 48 }))
const title = element(() => ({ top: 710, left: barX + 60, right: barX + 200, bottom: 730, width: 140, height: 20 }))
const bar = { ...element(() => ({ top: 690, left: barX, right: barX + 600, bottom: 754, width: 600, height: 64 })), querySelector: selector => selector.includes('artwork') ? cover : title }
globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, matchMedia: () => ({ matches: reduce }) }
globalThis.document = { querySelector: selector => selector === '.player-bar' ? bar : title, addEventListener() {} }
globalThis.getComputedStyle = () => ({ borderRadius: '12px', fontSize: '14px', lineHeight: '20px', fontWeight: '500' })
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true })
globalThis.requestAnimationFrame = fn => { frames.set(++nextId, fn); return nextId }
globalThis.cancelAnimationFrame = id => frames.delete(id)
const { playerMorph: morph } = await import(moduleFile.href)
function frame() {
  now += 16
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach(fn => fn(now))
}
function settle() {
  for (let i = 0; i < 200 && frames.size; i++) frame()
  assert.equal(frames.size, 0, 'animation settles without a stuck frame')
}

morph.beginDrag(700)
now += 16
morph.dragTo(691)
assert.ok(Math.abs(morph.p - 9 / 360) < 1e-8, 'opening retains lock-axis displacement')
morph.cancelDrag()
settle()
assert.equal(morph.phase, 'closed')
morph.open()
for (let i = 0; i < 8; i++) frame()
const before = morph.p
morph.close()
assert.equal(morph.p, before, 'reversal does not reset progress')
frame()
assert.ok(Math.abs(morph.p - before) < 0.1)
morph.open()
settle()
assert.equal(morph.phase, 'open')
morph.beginCloseDrag(20)
now += 16
morph.dragTo(29)
assert.ok(Math.abs(morph.p - 0.975) < 1e-8, 'closing retains lock-axis displacement')
morph.cancelDrag()
settle()
assert.equal(morph.phase, 'open')
morph.beginCloseDrag(20)
now += 16
morph.dragTo(60)
morph.endDrag()
settle()
assert.equal(morph.phase, 'closed', 'short fast downward flick closes')
barX = 200
morph.open()
assert.equal(morph.sourceBar.left, 200, 'reopening measures current bar geometry')
settle()
barX = 120
window.innerWidth = 1024
morph.remeasure()
assert.equal(morph.sourceBar.left, 120, 'open state remeasures after resize')
assert.equal(morph.surfaceRect.width, 1024)
reduce = true
morph.close()
assert.equal(morph.phase, 'closed', 'reduced motion closes immediately')
morph.open()
assert.equal(morph.phase, 'open', 'reduced motion opens immediately')
assert.equal(frames.size, 0)

const actionSource = new URL('./close-drag.ts', import.meta.url)
const actionJs = ts.transpileModule(await readFile(actionSource, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
}).outputText.replace(/from '([^']+)'/g, (_, path) => `from '${path.includes('player-morph') ? moduleFile.href : new URL(path, actionSource).href}'`)
const actionFile = new URL('close-drag.mjs', cache)
await writeFile(actionFile, actionJs)
const { closeDrag } = await import(actionFile.href)
const listeners = new Map()
const node = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), setPointerCapture() {} }
let prevented = false
const event = (y, interactive = false) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: 20, clientY: y, target: { closest: () => interactive ? {} : null }, preventDefault() { prevented = true }, stopPropagation() {} })
const blankDrag = closeDrag(node)
listeners.get('pointerdown')(event(10, true))
listeners.get('pointermove')(event(300, true))
assert.equal(morph.phase, 'open', 'controls and cover do not start dismissal')
listeners.get('pointerdown')(event(10))
now += 16
listeners.get('pointermove')(event(60))
assert.equal(morph.phase, 'dragging', 'blank area starts dismissal')
listeners.get('pointercancel')(event(60))
assert.equal(morph.phase, 'open', 'pointer cancellation returns open')
blankDrag.destroy()
const handleDrag = closeDrag(node, true)
listeners.get('pointerdown')(event(10, true))
now += 16
listeners.get('pointermove')(event(300, true))
listeners.get('pointerup')(event(300, true))
assert.equal(morph.phase, 'closed', 'handle button accepts downward dragging')
prevented = false
listeners.get('click')(event(300))
assert.equal(prevented, true, 'drag release suppresses its click')
handleDrag.destroy()
assert.equal(listeners.size, 0, 'gesture listeners are cleaned up')
console.log('player-morph: all state, pointer gesture, cancellation, reversal, resize and reduced-motion checks passed')
