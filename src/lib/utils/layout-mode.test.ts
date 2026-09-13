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
assertEqual(shouldUseMobileLayout(768, 1024, 'auto'), false, 'auto uses pc layout on tablets')
assertEqual(shouldUseMobileLayout(390, 844, 'pc'), false, 'pc override wins on phones')
assertEqual(shouldUseMobileLayout(1024, 768, 'mobile'), true, 'mobile override wins on tablets')

// ?mobile 强制手持端布局，优先级高于 pc 覆盖
locationState.search = '?mobile'
assertEqual(shouldUseMobileLayout(1440, 900, 'pc'), true, '?mobile forces mobile layout even with pc override')
locationState.search = ''

console.log(`\nlayout-mode: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
