/**
 * Layout mode self-check.
 * Run: node src/lib/utils/layout-mode.test.js
 * Status code: 0 = pass, 1 = fail.
 */

import { shouldUseMobileLayout } from './layout-mode.js'

let passed = 0
let failed = 0

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    passed++
  } else {
    console.error(`FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  }
}

globalThis.window = {
  location: { search: '' },
  matchMedia(query) {
    return { matches: query === '(pointer: coarse)' }
  },
}

assertEqual(shouldUseMobileLayout(390, 844, 'auto'), true, 'auto uses mobile layout on phones')
assertEqual(shouldUseMobileLayout(768, 1024, 'auto'), false, 'auto uses pc layout on tablets')
assertEqual(shouldUseMobileLayout(390, 844, 'pc'), false, 'pc override wins on phones')
assertEqual(shouldUseMobileLayout(1024, 768, 'mobile'), true, 'mobile override wins on tablets')

// ?mobile 强制手持端布局，优先级高于 pc 覆盖
globalThis.window.location.search = '?mobile'
assertEqual(shouldUseMobileLayout(1440, 900, 'pc'), true, '?mobile forces mobile layout even with pc override')
globalThis.window.location.search = ''

console.log(`layout-mode.test.js: ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)