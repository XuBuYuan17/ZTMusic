/**
 * Layout mode self-check.
 * Run: node --experimental-strip-types src/lib/utils/layout-mode.test.ts
 * Status code: 0 = pass, 1 = fail.
 */

import { shouldUseMobileLayout } from './layout-mode.ts'

let passed = 0
let failed = 0

function assertEqual(actual: unknown, expected: unknown, msg: string) {
  if (actual === expected) {
    passed++
  } else {
    console.error(`FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  }
}

const locationState = { search: '' }
globalThis.window = {
  location: locationState,
  matchMedia(query: string) {
    return { matches: query === '(pointer: coarse)' }
  },
} as unknown as Window & typeof globalThis

assertEqual(shouldUseMobileLayout(390, 844, 'auto'), true, 'auto uses mobile layout on phones')
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Android', maxTouchPoints: 5 } })
assertEqual(shouldUseMobileLayout(844, 390, 'auto'), true, 'landscape phones keep mobile layout')
assertEqual(shouldUseMobileLayout(844, 390, 'pc'), false, 'pc override wins in landscape')
assertEqual(shouldUseMobileLayout(1440, 900, 'auto'), false, 'large landscape devices keep pc layout')
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'desktop', maxTouchPoints: 0 } })
assertEqual(shouldUseMobileLayout(844, 390, 'auto'), false, 'desktop landscape keeps pc layout')
assertEqual(shouldUseMobileLayout(768, 1024, 'auto'), false, 'auto uses pc layout on tablets')
assertEqual(shouldUseMobileLayout(390, 844, 'pc'), false, 'pc override wins on phones')
assertEqual(shouldUseMobileLayout(768, 1024, 'mobile'), true, 'mobile override wins in portrait')
assertEqual(shouldUseMobileLayout(1024, 768, 'mobile'), true, 'mobile override works in landscape')

// ?mobile 在两种方向都强制手持端布局
locationState.search = '?mobile'
assertEqual(shouldUseMobileLayout(900, 1440, 'pc'), true, '?mobile forces portrait mobile layout even with pc override')
assertEqual(shouldUseMobileLayout(1440, 900, 'pc'), true, '?mobile forces landscape mobile layout')
locationState.search = ''

console.log(`\nlayout-mode: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
