/**
 * 字重必须落在实际打包的字面上。
 * Run: node src/lib/utils/font-weight.test.js
 *
 * HarmonyOS Sans SC 只打包 3 档（Regular 400 / Medium 500 / Bold 700，见 app.css
 * 的 @font-face）。其余字重浏览器要么舍入、要么合成"假粗体"——笔画糊、字距乱，
 * 正是"廉价感"的来源之一。
 *
 * 例外：index.html 的开屏 logotype 在 webfont 加载前就渲染，用系统回退字体，
 * 不受 3 档限制。
 */
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { GLOBAL_CSS_FILES } from '../../../scripts/css-files.mjs'

const PACKED = [400, 500, 700]
const ROOT = new URL('../../../', import.meta.url)

async function collect(dir, acc = []) {
  for (const entry of await readdir(new URL(dir, ROOT), { withFileTypes: true })) {
    const rel = `${dir}${entry.name}`
    if (entry.isDirectory()) await collect(`${rel}/`, acc)
    else if (entry.name.endsWith('.svelte')) acc.push(rel)
  }
  return acc
}

const files = [...GLOBAL_CSS_FILES, ...await collect('src/')]

const offenders = []
let seen = 0

for (const file of files) {
  const text = await readFile(new URL(file, ROOT), 'utf8')
  for (const m of text.matchAll(/font-weight:\s*(\d+)/g)) {
    const weight = Number.parseInt(m[1], 10)
    seen++
    if (!PACKED.includes(weight)) {
      const line = text.slice(0, m.index).split('\n').length
      offenders.push(`${file}:${line} font-weight: ${weight}`)
    }
  }
}

assert.ok(seen >= 100, `应扫到至少 100 处 font-weight，实际 ${seen}（扫描器可能失效）`)
assert.deepEqual(
  offenders, [],
  `字重必须是 ${PACKED.join('/')} 之一（打包的字面）：\n  ${offenders.join('\n  ')}`
)

// @font-face 必须恰好声明这 3 档，且指向随包字体
const appCss = await readFile(new URL('src/app.css', ROOT), 'utf8')
const declared = [...appCss.matchAll(/@font-face\s*\{[^}]*?font-weight:\s*(\d+)[^}]*?\}/g)]
  .map((m) => Number.parseInt(m[1], 10))
  .sort((a, b) => a - b)
assert.deepEqual(declared, PACKED, `@font-face 应声明 ${PACKED.join('/')}，实际 ${declared.join('/')}`)

for (const weight of ['Regular', 'Medium', 'Bold']) {
  assert.ok(
    appCss.includes(`/fonts/HarmonyOS_Sans_SC_${weight}.ttf`),
    `缺少 ${weight} 字面的 @font-face src`
  )
}

// 字体栈首位必须是打包的字体，否则等于没接入
assert.match(appCss, /--font:\s*'HarmonyOS Sans SC'/, '--font 首位应为 HarmonyOS Sans SC')

// index.html 的字体栈要和 --font 一致，否则开屏到应用会跳字体
const html = await readFile(new URL('index.html', ROOT), 'utf8')
assert.ok(
  html.includes("'HarmonyOS Sans SC', -apple-system"),
  'index.html 的 body 字体栈应与 app.css 的 --font 一致（避免开屏字体跳变）'
)

console.log(`font weight self-check: ${seen} declarations, all in ${PACKED.join('/')}`)
