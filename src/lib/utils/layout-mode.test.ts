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
assertEqual(shouldUseMobileLayout(844, 390, 'auto'), false, 'landscape phones use pc layout')
assertEqual(shouldUseMobileLayout(768, 1024, 'auto'), false, 'auto uses pc layout on tablets')
assertEqual(shouldUseMobileLayout(390, 844, 'pc'), false, 'pc override wins on phones')
assertEqual(shouldUseMobileLayout(768, 1024, 'mobile'), true, 'mobile override wins in portrait')
assertEqual(shouldUseMobileLayout(1024, 768, 'mobile'), false, 'landscape wins over mobile override')

// ?mobile 在竖屏强制手持端布局，横屏仍切到 PC 外壳
locationState.search = '?mobile'
assertEqual(shouldUseMobileLayout(900, 1440, 'pc'), true, '?mobile forces portrait mobile layout even with pc override')
assertEqual(shouldUseMobileLayout(1440, 900, 'mobile'), false, 'landscape wins over ?mobile')
locationState.search = ''

console.log(`\nlayout-mode: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
