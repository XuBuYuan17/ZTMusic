/**
 * Login status verdict self-check.
 * Run: node src/lib/auth/login-status.test.ts
 */

import { classifyLoginStatus } from './login-status.ts'

let passed = 0
let failed = 0

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual === expected) {
    passed++
  } else {
    console.error(`FAIL: ${message} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  }
}

// 正常登录：code 只在外层 / 只在 data 内层，两种形态都要认
assertEqual(classifyLoginStatus({ code: 200, account: { id: 1 } }), 'valid', 'outer code 200')
assertEqual(classifyLoginStatus({ data: { code: 200, account: { id: 1 } } }), 'valid', 'inner code 200')
assertEqual(classifyLoginStatus({ code: 200, data: { code: 200 } }), 'valid', 'both layers 200')

// 明确失效：301/302 是需要登录，anonimousUser 是服务端把请求当匿名
assertEqual(classifyLoginStatus({ code: 301 }), 'expired', '301 means login required')
assertEqual(classifyLoginStatus({ code: 302 }), 'expired', '302 means session expired')
assertEqual(classifyLoginStatus({ data: { code: 301 } }), 'expired', 'inner 301')
assertEqual(classifyLoginStatus({ code: 200, account: { anonimousUser: true } }), 'expired', 'anonymous account on 200')
assertEqual(classifyLoginStatus({ data: { code: 200, account: { anonimousUser: true } } }), 'expired', 'inner anonymous account')

// 问不出来：网关错误信封、解析失败、字段缺失。这三类绝不能被当成登出理由
assertEqual(classifyLoginStatus({ code: 502, msg: '网关连不上网易云' }), 'unknown', 'gateway error envelope')
assertEqual(classifyLoginStatus({ code: -1, message: 'API response not JSON: 200' }), 'unknown', 'unparseable body')
assertEqual(classifyLoginStatus({ code: 503 }), 'unknown', '503 is not an auth verdict')
assertEqual(classifyLoginStatus({}), 'unknown', 'empty body')
assertEqual(classifyLoginStatus(null), 'unknown', 'null body')
assertEqual(classifyLoginStatus('not json'), 'unknown', 'string body')

// 失效优先于有效：信封说 200 但内层说需要登录时，按失效处理
assertEqual(classifyLoginStatus({ code: 200, data: { code: 301 } }), 'expired', 'inner 301 wins over outer 200')
assertEqual(classifyLoginStatus({ code: 502, data: { code: 200 } }), 'valid', 'inner 200 survives a bad outer code')

// anonimousUser 只在严格 true 时才算失效，false / undefined 不能误伤
assertEqual(classifyLoginStatus({ code: 200, account: { anonimousUser: false } }), 'valid', 'explicit false is a real account')
assertEqual(classifyLoginStatus({ code: 200, account: {} }), 'valid', 'missing flag is a real account')

console.log(`\n${passed} passed, ${failed} failed${failed ? ' - FAIL' : ' - all good'}`)
process.exitCode = failed ? 1 : 0
