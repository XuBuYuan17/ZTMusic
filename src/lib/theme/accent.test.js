import assert from 'node:assert/strict'
import {
  adaptAccentColor,
  buildAccentProperties,
  getAccentProperties,
  normalizeAccentTheme,
  pickAccentColor,
} from './accent.js'

assert.equal(normalizeAccentTheme('violet'), 'violet')
assert.equal(normalizeAccentTheme('invalid'), 'red')

const pixels = new Uint8ClampedArray([
  20, 40, 220, 255, 20, 45, 225, 255, 210, 210, 210, 255, 5, 5, 5, 255,
  25, 50, 230, 255, 22, 42, 215, 255, 200, 200, 200, 255, 250, 250, 250, 255,
  18, 38, 218, 255, 24, 46, 224, 255, 180, 180, 180, 255, 2, 2, 2, 255,
  21, 41, 221, 255, 23, 43, 223, 255, 190, 190, 190, 255, 248, 248, 248, 255,
])
const picked = pickAccentColor(pixels)
assert.ok(picked.b > picked.r * 4, 'dominant saturated blue should win over grayscale pixels')

const light = adaptAccentColor({ r: 5, g: 20, b: 80 }, 'light')
const dark = adaptAccentColor({ r: 5, g: 20, b: 80 }, 'dark')
assert.ok(dark.r + dark.g + dark.b > light.r + light.g + light.b, 'dark theme accent should be brighter')

const props = buildAccentProperties({ r: 20, g: 80, b: 220 }, 'dark')
assert.deepEqual(Object.keys(props), ['--accent', '--accent-hover', '--accent-bg', '--accent-bg-hover', '--accent-gradient'])
assert.match(getAccentProperties('cover', 'dark', null)['--accent'], /^rgb\(/, 'cover mode should have a stable fallback')

console.log('accent theme self-check: 6 assertions passed')
