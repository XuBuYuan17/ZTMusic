/**
 * SQLite API 缓存保留窗口自检
 *
 * 验证 cache.ts 对过期行的两级处理：过期但仍在离线保留窗口内的行
 * 读取时（allowExpired=false）不删除、allowExpired 仍可读到；
 * 会话清扫也只回收超过窗口的行。窗口内删除与读取逻辑都是 SQL 字面量，
 * 这里按本仓库 cache-policy.test.ts 的惯例做源码断言，避免依赖浏览器 SQLite。
 * Run: node src/lib/db/cache.test.ts
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { OFFLINE_RETENTION_MS } from './cache.ts'

let passed = 0
function check(name: string, fn: () => void) {
  try {
    fn()
    passed++
  } catch (err) {
    console.error(`FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

check('保留窗口为 7 天', () => {
  assert.equal(OFFLINE_RETENTION_MS, 7 * 24 * 60 * 60 * 1000)
})

const source = await readFile(new URL('./cache.ts', import.meta.url), 'utf8')

check('allowExpired 兜底读取带保留窗口条件', () => {
  assert.ok(source.includes('AND expires_at + ? > ?'), '需要 SELECT 用 expires_at + 窗口过滤')
})

check('新鲜读命中过期行时不删窗口内行', () => {
  assert.ok(
    source.includes('DELETE FROM api_cache WHERE key = ? AND expires_at + ? <= ?'),
    'DELETE 必须带保留窗口条件，否则断网兜底读不到数据'
  )
})

check('会话清扫只回收超过保留窗口的行', () => {
  assert.ok(source.includes('DELETE FROM api_cache WHERE expires_at + ? <= ?'), '清扫不能删窗口内的行')
})

check('新鲜读仍按 expires_at 过滤', () => {
  assert.ok(source.includes('WHERE key = ? AND expires_at > ?'), '新鲜读必须保持严格新鲜')
})

console.log(`cache retention: ${passed} passed${process.exitCode ? ', 有失败' : ', 0 failed'}`)