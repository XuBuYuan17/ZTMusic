import assert from 'node:assert/strict'
import { getThemeTransitionGeometry } from './theme-transition.js'

assert.deepEqual(
  getThemeTransitionGeometry({ left: 80, top: 40, width: 40, height: 40 }, 400, 300),
  { x: 100, y: 60, radius: 385 },
)

assert.deepEqual(
  getThemeTransitionGeometry(null, 400, 300),
  { x: 200, y: 150, radius: 250 },
)

console.log('theme transition geometry: 2 assertions passed')
