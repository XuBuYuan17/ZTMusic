/**
 * API session cookie self-check.
 * Run: node src/lib/api/session.test.js
 */

import { extractCookie, mergeCookies, normalizeCookieForRequest } from './session.js'

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

{
  const cookie = normalizeCookieForRequest('MUSIC_U=token; __csrf=csrf; NMTID=nmt')
  assertEqual(cookie, 'MUSIC_U=token; __csrf=csrf; NMTID=nmt; os=pc', 'keeps auth cookie pairs and appends os=pc')
}

{
  const cookie = normalizeCookieForRequest('__csrf=csrf; os=pc')
  assertEqual(cookie, '', 'rejects cookies without MUSIC_U')
}

{
  const cookie = normalizeCookieForRequest('MUSIC_U=token; os=android; __csrf=csrf')
  assertEqual(cookie, 'MUSIC_U=token; os=android; __csrf=csrf', 'does not duplicate existing os cookie')
}

{
  const cookie = mergeCookies('MUSIC_U=old; __csrf=oldcsrf; os=pc', 'MUSIC_U=new; NMTID=nmt')
  assertEqual(cookie, 'MUSIC_U=new; __csrf=oldcsrf; os=pc; NMTID=nmt', 'new response cookie overrides matching keys and keeps old keys')
}

{
  const cookie = extractCookie('MUSIC_U=token; Path=/; HttpOnly; __csrf=csrf; Max-Age=3600; SameSite=Lax')
  assertEqual(cookie, 'MUSIC_U=token; __csrf=csrf', 'drops Set-Cookie attributes')
}

console.log(`\n${passed} passed, ${failed} failed${failed ? ' - FAIL' : ' - all good'}`)
process.exit(failed ? 1 : 0)