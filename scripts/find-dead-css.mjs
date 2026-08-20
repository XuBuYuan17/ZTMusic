/**
 * 扫描全局 CSS 中在源码里找不到任何引用的 class 选择器。
 *
 * 用法：
 *   node scripts/find-dead-css.mjs           # 列出候选
 *   node scripts/find-dead-css.mjs --json    # 输出 JSON（供删除脚本消费）
 *
 * 判定为"活"的条件（任一成立即保留）：
 *   1. 出现在 .svelte / .js 源码或 index.html 中（去掉组件 <style> 块后再匹配）
 *   2. 出现在 :is() / :where() 选择器列表中（预留的样式 API，如 .selectable）
 *
 * 注意：这是保守的**候选**清单，不是可以无脑删除的清单。
 * 项目里所有 classList 操作都是字面量字符串，没有动态拼接，所以静态扫描是可靠的；
 * 一旦将来出现 `class={`x-${v}`}` 这类写法，本脚本就会漏判。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GLOBAL_CSS_FILES } from './css-files.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, acc)
    else if (/\.(svelte|js)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) acc.push(path)
  }
  return acc
}

const read = (p) => readFileSync(resolve(root, p), 'utf8')

// 源码文本：去掉组件 <style> 块，避免"CSS 里出现过"被误判为使用
const source = walk(resolve(root, 'src'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')
  .replace(/<style[\s\S]*?<\/style>/g, '') + read('index.html')

const globalCss = GLOBAL_CSS_FILES.map(read).join('\n')

const classNames = new Set()
for (const m of globalCss.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classNames.add(m[1])

// :is(...) / :where(...) 里列出的 class 是预留的样式 API，不算死代码
const apiHooks = new Set()
for (const m of globalCss.matchAll(/:(?:is|where)\(([^)]*)\)/g)) {
  for (const c of m[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) apiHooks.add(c[1])
}

const dead = [...classNames]
  .filter((c) => !source.includes(c) && !apiHooks.has(c))
  .sort()

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(dead))
} else {
  console.log(`全局 CSS 中的 class: ${classNames.size}`)
  console.log(`:is()/:where() 预留 API: ${apiHooks.size}（保留）`)
  console.log(`无任何引用的候选: ${dead.length}\n`)
  const groups = new Map()
  for (const c of dead) {
    const key = c.split(/[-_]/)[0]
    groups.set(key, [...(groups.get(key) || []), c])
  }
  for (const [key, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${key.padEnd(14)} ${String(list.length).padStart(3)}  ${list.slice(0, 4).join(', ')}${list.length > 4 ? ' …' : ''}`)
  }
}
