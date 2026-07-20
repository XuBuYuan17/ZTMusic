/**
 * parseLikeCheck self-check.
 * Run: node src/lib/utils/like-check.test.js
 */
import { parseLikeCheck } from './like-check.js'

let passed = 0
let failed = 0
function check(actual, expected, message) {
  if (actual === expected) { passed++ }
  else { console.error(`FAIL: ${message} - expected ${expected}, got ${actual}`); failed++ }
}

const ID = 123

// bare boolean
check(parseLikeCheck(true, ID), true, 'bare true')
check(parseLikeCheck(false, ID), false, 'bare false')

// wrapped in data/result
check(parseLikeCheck({ data: true }, ID), true, 'data:true')
check(parseLikeCheck({ result: false }, ID), false, 'result:false')

// array of ids -> match by id/songId
check(parseLikeCheck({ data: [{ id: 123, liked: true }] }, ID), true, 'array match by id liked')
check(parseLikeCheck({ data: [{ songId: 123, like: true }] }, ID), true, 'array match by songId like')
check(parseLikeCheck([{ id: 999, liked: true }, { id: 123, liked: false }], ID), false, 'array picks right id')
check(parseLikeCheck([true], ID), true, 'array of bare boolean')

// object keyed by id
check(parseLikeCheck({ 123: true }, ID), true, 'object keyed true')
check(parseLikeCheck({ 123: 0 }, ID), false, 'object keyed falsy')

// object with liked/isLike/success flags
check(parseLikeCheck({ data: { isLike: true } }, ID), true, 'object isLike')
check(parseLikeCheck({ success: true }, ID), true, 'object success')

// junk -> false
check(parseLikeCheck(null, ID), false, 'null')
check(parseLikeCheck(undefined, ID), false, 'undefined')
check(parseLikeCheck({ data: 'nope' }, ID), false, 'string data')

console.log(`\nparseLikeCheck: ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
