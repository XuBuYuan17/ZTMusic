/**
 * 版本号显示必须来自 package.json，不能硬编码。
 * Run: node src/lib/utils/version-display.test.js
 *
 * 背景：AboutPage 一直读 pkg.version，但两个设置页曾把版本写死 ——
 * PC 停在 1.3.0、移动端停在 0.1.0（跟真实版本差了三个 minor）。
 * 发版时改了四处版本号却漏掉 UI，用户看到的就是错的。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ROOT = new URL('../../../', import.meta.url)
const read = (p) => readFile(new URL(p, ROOT), 'utf8')

const pkg = JSON.parse(await read('package.json'))
let passed = 0
const check = (cond, msg) => { assert.ok(cond, msg); passed++ }

// 展示版本号的页面必须 import package.json 并渲染 pkg.version
const PAGES = [
  'src/lib/pages/AboutPage.svelte',
  'src/lib/pages/pc/Settings.svelte',
  'src/lib/pages/mobile/Settings.svelte',
]

for (const page of PAGES) {
  const text = await read(page)
  check(/import\s+pkg\s+from\s+['"][^'"]*package\.json['"]/.test(text), `${page} 应 import package.json`)
  check(/\{pkg\.version\}|\$\{appVersion\}|v\$\{appVersion\}|pkg\.version/.test(text), `${page} 应渲染 pkg.version`)

  // 模板里不能出现写死的 x.y.z 版本串
  const template = text.slice(text.indexOf('</script>'))
  const hardcoded = [...template.matchAll(/>\s*v?(\d+\.\d+\.\d+)\s*</g)].map((m) => m[1])
  assert.deepEqual(hardcoded, [], `${page} 模板里有硬编码版本号: ${hardcoded.join(', ')}`)
  passed++
}

// 四处版本号一致由 scripts/verify-versions.mjs 保证；这里只确认 package.json 格式合法
check(/^\d+\.\d+\.\d+$/.test(pkg.version), `package.json version 应为 x.y.z，实际 ${pkg.version}`)

console.log(`version display self-check: ${passed} assertions passed (v${pkg.version})`)
