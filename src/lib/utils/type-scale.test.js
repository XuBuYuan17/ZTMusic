/**
 * 字距自检。
 * Run: node src/lib/utils/type-scale.test.js
 *
 * 规则：界面标题和组件文字不使用负 letter-spacing。
 * 小屏中英文混排时负字距更容易挤压笔画，移动端尤其明显；字重和字号承担层级即可。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GLOBAL_CSS_FILES } from '../../../scripts/css-files.mjs'

const FILES = GLOBAL_CSS_FILES

/** 把顶层规则块切出来，附带起始行号 */
function* rules(css) {
  const lines = css.split('\n')
  let depth = 0
  let start = -1
  let buf = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const delta = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
    if (depth === 0 && line.includes('{')) { start = i; buf = [line] }
    else if (depth > 0) buf.push(line)
    else continue
    depth += delta
    if (depth === 0 && start !== -1) {
      yield { line: start + 1, text: buf.join('\n') }
      start = -1
    }
  }
}

/** 取规则的"最小生效字号"：px 直接读，clamp/min/max 取其中最小的 px 值 */
function minFontSizePx(block) {
  const decl = block.match(/font-size:\s*([^;]+)/)
  if (!decl) return null
  const value = decl[1]
  const pxs = [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number.parseFloat(m[1]))
  if (pxs.length === 0) return null
  return Math.min(...pxs)
}

let checked = 0
const offenders = []

for (const name of FILES) {
  const css = await readFile(new URL(`../../../${name}`, import.meta.url), 'utf8')
  for (const { line, text } of rules(css)) {
    // 只看规则自身的声明，跳过 at-rule 外壳（其内部规则会各自被扫到）
    const selector = text.split('{')[0].trim()
    if (selector.startsWith('@')) continue

    const size = minFontSizePx(text)
    if (size === null || size < 22) continue
    checked++

    const ls = text.match(/letter-spacing:\s*(-?[\d.]+)(px|em)/)
    const where = `${name}:${line} (${size}px) ${selector.replace(/\s+/g, ' ').slice(0, 54)}`
    if (ls && Number.parseFloat(ls[1]) < 0) offenders.push(`${where} — letter-spacing: ${ls[1]}${ls[2]} 为负值`)
  }
}

assert.ok(checked >= 20, `应扫到至少 20 条大字号规则，实际 ${checked}（扫描器可能失效）`)
assert.deepEqual(offenders, [], `发现负字距：\n  ${offenders.join('\n  ')}`)

console.log(`type scale self-check: ${checked} large-type rules, no negative letter spacing`)
