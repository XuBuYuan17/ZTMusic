/**
 * App back action self-check.
 * Run: node src/lib/app/back.test.ts
 */

import { getAppBackAction, type AppBackState } from './back.ts'

let passed = 0
let failed = 0

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) {
    passed++
  } else {
    console.error(`FAIL: ${message} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  }
}

function state(overrides: Partial<AppBackState> = {}): AppBackState {
  return {
    showMobileDrawer: false,
    showSheet: false,
    showQueuePanel: false,
    showSearch: false,
    showLogin: false,
    showFollowDialog: false,
    routeStackLength: 0,
    activeView: 'home',
    isMobile: false,
    ...overrides,
  }
}

assertEqual(getAppBackAction(state({ showMobileDrawer: true, showSheet: true })), 'mobileDrawer', 'drawer wins over sheet')
assertEqual(getAppBackAction(state({ showSheet: true, showQueuePanel: true })), 'sheet', 'sheet wins over queue')
assertEqual(getAppBackAction(state({ showQueuePanel: true, showSearch: true })), 'queue', 'queue wins over search')
assertEqual(getAppBackAction(state({ showSearch: true, showLogin: true })), 'search', 'search wins over login')
assertEqual(getAppBackAction(state({ showLogin: true, showFollowDialog: true })), 'login', 'login wins over follow dialog')
assertEqual(getAppBackAction(state({ showFollowDialog: true, routeStackLength: 1 })), 'followDialog', 'follow dialog wins over route back')
assertEqual(getAppBackAction(state({ routeStackLength: 1, activeView: 'playlist' })), 'routeBack', 'route stack wins over home navigation')
assertEqual(getAppBackAction(state({ activeView: 'settings' })), 'homeView', 'desktop non-home returns home')
assertEqual(getAppBackAction(state({ isMobile: true, activeView: 'home' })), 'homeView', 'mobile non-explore returns explore')
assertEqual(getAppBackAction(state({ isMobile: true, activeView: 'explore' })), null, 'mobile explore has no back target')
assertEqual(getAppBackAction(state()), null, 'desktop home has no back target')

console.log(`\n${passed} passed, ${failed} failed${failed ? ' - FAIL' : ' - all good'}`)
process.exitCode = failed ? 1 : 0
