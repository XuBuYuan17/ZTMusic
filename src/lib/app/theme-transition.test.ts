import assert from 'node:assert/strict'
import { createThemeTransition, getThemeTransitionGeometry } from './theme-transition.ts'

assert.deepEqual(
  getThemeTransitionGeometry({ left: 80, top: 40, width: 40, height: 40 }, 400, 300),
  { x: 100, y: 60, radius: 385 },
)

assert.deepEqual(
  getThemeTransitionGeometry(null, 400, 300),
  { x: 200, y: 150, radius: 250 },
)

const classes = new Set(['mobile-runtime'])
const frames: FrameRequestCallback[] = []
const globals = ['window', 'document', 'requestAnimationFrame'] as const
const originals = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name))
let theme = 'dark'
let updates = 0
try {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: false }) } })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    querySelector: () => null,
    documentElement: { classList: {
      contains: (name: string) => classes.has(name),
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
    } },
    startViewTransition: () => { throw new Error('mobile must not capture a page transition') },
  } })
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (frame: FrameRequestCallback) => { frames.push(frame); return frames.length } })
  const change = createThemeTransition({ getTheme: () => theme, setTheme: value => { theme = value; updates++ }, tick: async () => {} })
  change(undefined, 'light')
  assert.equal(theme, 'light')
  assert.ok(classes.has('mobile-theme-switching'))
  await Promise.resolve()
  frames.shift()!(0)
  change(undefined, 'dark')
  frames.shift()!(0)
  assert.ok(classes.has('mobile-theme-switching'), 'old cleanup must not interrupt a newer switch')
  await Promise.resolve()
  frames.shift()!(0)
  frames.shift()!(0)
  assert.ok(!classes.has('mobile-theme-switching'))
  change(undefined, 'dark')
  assert.equal(updates, 2, 'selecting the active theme must do nothing')
} finally {
  globals.forEach((name, index) => {
    if (originals[index]) Object.defineProperty(globalThis, name, originals[index]!)
    else Reflect.deleteProperty(globalThis, name)
  })
}
console.log('theme transition: geometry, mobile snapshot bypass, rapid switching and cleanup passed')
