/**
 * Trial playback message self-check.
 * Run: node src/lib/player/trial-message.test.js
 */

import { getTrialPlaybackMessage } from './trial-message.js'
import { ERROR_MESSAGES } from '../utils/constants.js'

let passed = 0
let failed = 0

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++
  } else {
    console.error(`FAIL: ${message} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  }
}

assertEqual(getTrialPlaybackMessage({ isLoggedIn: false }), ERROR_MESSAGES.VIP_TRIAL, 'keeps generic message when logged out')
assertEqual(getTrialPlaybackMessage({ isLoggedIn: true, vipInfo: null }), ERROR_MESSAGES.VIP_TRIAL_SYNCING, 'asks to retry after VIP sync')
assertEqual(getTrialPlaybackMessage({ isLoggedIn: true, vipInfo: { isVip: false }, isVip: false }), ERROR_MESSAGES.VIP_TRIAL_ACCOUNT, 'explains normal account trial')
assertEqual(getTrialPlaybackMessage({ isLoggedIn: true, vipInfo: { isVip: true }, isVip: true }), ERROR_MESSAGES.VIP_TRIAL_LIMITED, 'explains VIP account still limited')

console.log(`\n${passed} passed, ${failed} failed${failed ? ' - FAIL' : ' - all good'}`)
process.exit(failed ? 1 : 0)