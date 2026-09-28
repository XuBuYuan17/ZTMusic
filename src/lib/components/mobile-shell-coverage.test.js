// 移动端抽屉里渲染的是同一份 Sidebar，所以它的每个入口都必须有移动端渲染分支，
// 否则点进去是一片空白（「关于」曾漏掉）。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8')
const [sidebar, mobileApp] = await Promise.all([
  read('./Sidebar.svelte'),
  read('./MobileApp.svelte'),
])

const navTargets = [...sidebar.matchAll(/nav\('([^']+)'\)/g)].map((m) => m[1])
assert.ok(navTargets.length > 0, 'Sidebar 未解析出导航入口，本检查的正则需要更新')

const tabViewsSource = mobileApp.match(/const tabViews = \[([^\]]+)\]/)
assert.ok(tabViewsSource, 'MobileApp.svelte 找不到 tabViews 声明，本检查需要更新')

const handled = new Set([
  ...[...mobileApp.matchAll(/activeView === '([^']+)'/g)].map((m) => m[1]),
  ...[...tabViewsSource[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
])

for (const view of navTargets) {
  assert.ok(handled.has(view), `侧栏入口 "${view}" 在 MobileApp 没有渲染分支，移动端打开会是空白页`)
}

console.log(`mobile shell coverage: ${navTargets.length} sidebar entries all rendered`)
