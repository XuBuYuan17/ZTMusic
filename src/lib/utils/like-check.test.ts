/**
 * parseLikeCheck self-check.
 * Run: node --experimental-strip-types src/lib/utils/like-check.test.ts
 */
import { parseLikeCheck } from './like-check.ts'

let passed = 0
let failed = 0
function check(actual: unknown, expected: unknown, message: string) {
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

// bare id array -> the ids that ARE liked (real /song/like/check shape)
check(parseLikeCheck({ code: 200, data: ['123'] }, ID), true, 'id array hit')
check(parseLikeCheck({ code: 200, data: ['123'] }, 456), false, 'id array miss')
check(parseLikeCheck({ data: [] }, ID), false, 'empty id array')
check(parseLikeCheck({ data: [123] }, ID), true, 'numeric id array')

// wrapped id arrays: songIds (/song/like/check) and ids (/likelist)
check(parseLikeCheck({ data: { songIds: [123] } }, ID), true, 'songIds wrapper')
check(parseLikeCheck({ data: { songIds: [999] } }, ID), false, 'songIds wrapper miss')
check(parseLikeCheck({ code: 200, ids: [123] }, ID), true, 'likelist ids wrapper')
check(parseLikeCheck({ code: 200, ids: ['999'] }, ID), false, 'likelist ids wrapper miss')

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
process.exitCode = failed ? 1 : 0
