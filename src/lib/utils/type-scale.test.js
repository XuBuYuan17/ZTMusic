/**
 * 大字号标题的光学字距自检。
 * Run: node src/lib/utils/type-scale.test.js
 *
 * 规则：font-size >= 22px 的标题必须显式收紧字距（负 letter-spacing）。
 * 字号越大越要收紧，否则字与字之间发散，是"廉价网页感"最直接的来源。
 *
 * 例外：歌词正文（.ly-line-text）用 font-weight 500 + 正字距，是为长句可读性
 * 有意为之，不算标题，白名单放行。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GLOBAL_CSS_FILES } from '../../../scripts/css-files.mjs'

const FILES = GLOBAL_CSS_FILES

// 歌词正文不是标题；.so-top__ph 是单个音符占位图形，字距无意义。
const ALLOW_POSITIVE = /\.ly-line-text|\.ly-line\.active|\.so-top__ph/

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
    if (ALLOW_POSITIVE.test(selector)) continue

    const where = `${name}:${line} (${size}px) ${selector.replace(/\s+/g, ' ').slice(0, 54)}`
    if (!ls) offenders.push(`${where} — 缺 letter-spacing`)
    else if (Number.parseFloat(ls[1]) >= 0) offenders.push(`${where} — letter-spacing: ${ls[1]}${ls[2]} 未收紧`)
  }
}

assert.ok(checked >= 20, `应扫到至少 20 条大字号规则，实际 ${checked}（扫描器可能失效）`)
assert.deepEqual(offenders, [], `大字号标题必须收紧字距：\n  ${offenders.join('\n  ')}`)

// clamp() 字号必须用 em 收紧，px 在流体两端观感不一致
for (const name of FILES) {
  const css = await readFile(new URL(`../../../${name}`, import.meta.url), 'utf8')
  for (const { line, text } of rules(css)) {
    if (!/font-size:\s*(?:clamp|min|max)\(/.test(text)) continue
    const size = minFontSizePx(text)
    if (size === null || size < 22) continue
    const ls = text.match(/letter-spacing:\s*(-?[\d.]+)(px|em)/)
    if (!ls) continue
    assert.equal(ls[2], 'em', `${name}:${line} 流体字号应用 em 收紧，实际 ${ls[1]}${ls[2]}`)
  }
}

console.log(`type scale self-check: ${checked} large-type rules, all tightened`)
