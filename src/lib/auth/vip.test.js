/**
 * VIP normalization self-check.
 * Run: node src/lib/auth/vip.test.js
 */

import { fetchVipInfo, normalizeVipInfo } from './vip.js'

let passed = 0
let failed = 0

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson === expectedJson) {
    passed++
  } else {
    console.error(`FAIL: ${message} - expected ${expectedJson}, got ${actualJson}`)
    failed++
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++
  } else {
    console.error(`FAIL: ${message} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  }
}

{
  const raw = { vipType: 11, vipLevel: 7 }
  assertDeepEqual(normalizeVipInfo({ data: raw }), { vipType: 11, vipLevel: 7, isVip: true, raw }, 'normalizes direct vipType/vipLevel fields')
}

{
  const raw = { redVipLevel: 5 }
  assertDeepEqual(normalizeVipInfo({ data: raw }), { vipType: 5, vipLevel: 5, isVip: true, raw }, 'uses redVipLevel for type and level')
}

{
  const raw = { musicPackage: { vipType: 1, vipLevel: 3 } }
  assertDeepEqual(normalizeVipInfo({ data: raw }), { vipType: 1, vipLevel: 3, isVip: true, raw }, 'normalizes nested musicPackage fields')
}

{
  const raw = { associator: { isVip: true } }
  assertDeepEqual(normalizeVipInfo({ data: raw }), { vipType: 0, vipLevel: 0, isVip: true, raw }, 'keeps nested boolean vip status')
}

{
  const raw = { vipType: 0, vipLevel: 0, isVip: false }
  assertDeepEqual(normalizeVipInfo({ data: raw }), { vipType: 0, vipLevel: 0, isVip: false, raw }, 'normalizes normal account')
}

{
  let v1Calls = 0
  const res = await fetchVipInfo({
    vipInfoV2: async () => ({ code: 200, data: { vipType: 1 } }),
    vipInfo: async () => { v1Calls++; return { code: 200, data: { vipType: 2 } } },
  })
  assertDeepEqual(res, { code: 200, data: { vipType: 1 } }, 'uses v2 response when successful')
  assertEqual(v1Calls, 0, 'does not call v1 after successful v2')
}

{
  const res = await fetchVipInfo({
    vipInfoV2: async () => ({ code: 500 }),
    vipInfo: async () => ({ code: 200, data: { vipType: 2 } }),
  })
  assertDeepEqual(res, { code: 200, data: { vipType: 2 } }, 'falls back to v1 on non-200 v2')
}

{
  const res = await fetchVipInfo({
    vipInfoV2: async () => { throw new Error('v2 unavailable') },
    vipInfo: async () => ({ code: 200, data: { vipType: 3 } }),
  })
  assertDeepEqual(res, { code: 200, data: { vipType: 3 } }, 'falls back to v1 when v2 throws')
}

console.log(`\n${passed} passed, ${failed} failed${failed ? ' - FAIL' : ' - all good'}`)
process.exit(failed ? 1 : 0)