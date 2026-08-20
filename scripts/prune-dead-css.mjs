/**
 * 删除全局 CSS 中确认无引用的 class 规则。
 *
 * 用法：
 *   node scripts/prune-dead-css.mjs --dry    # 只报告将要删什么
 *   node scripts/prune-dead-css.mjs          # 实际写入
 *
 * 安全策略（宁可漏删，不可错删）：
 *   - 只处理"整条规则的所有选择器都是死 class"的规则块，整块删除
 *   - 选择器列表里混有活选择器的（如 `.alive, .dead {}`），只摘掉死的那几个，保留规则
 *   - 纯元素/属性选择器（不含 class）一律不动
 *   - at-rule（@media 等）递归处理内部；内部全空则连同 at-rule 一起删
 *
 * 保真不变量：空死名单时输出必须与输入逐字节一致。
 * 见 scripts/prune-dead-css.test.mjs —— 该自检曾抓到"重建时丢失闭合 }"的 bug。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { GLOBAL_CSS_FILES } from './css-files.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

/**
 * 把 CSS 切成顶层 token。每个 token 的 `text` 是它在原文中的**原样切片**，
 * 因此 `tokens.map(t => t.text).join('')` 必然等于输入。
 */
export function parseBlocks(text) {
  const blocks = []
  let i = 0
  while (i < text.length) {
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      blocks.push({ type: 'comment', text: text.slice(i, stop) })
      i = stop
      continue
    }
    const brace = text.indexOf('{', i)
    if (brace === -1) {
      blocks.push({ type: 'raw', text: text.slice(i) })
      break
    }
    const commentFirst = text.indexOf('/*', i)
    if (commentFirst !== -1 && commentFirst < brace) {
      blocks.push({ type: 'raw', text: text.slice(i, commentFirst) })
      i = commentFirst
      continue
    }
    // 选择器前导里的前置空白单独切出来，作为 raw token。
    // 这样删除规则时能连带删掉它自己的缩进/空行，而不会把空白留给下一条规则。
    const rawPrelude = text.slice(i, brace)
    const lead = rawPrelude.match(/^\s*/)[0]
    if (lead) {
      blocks.push({ type: 'raw', text: lead })
      i += lead.length
      continue
    }
    let depth = 0
    let j = brace
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') { depth--; if (depth === 0) break }
    }
    if (depth !== 0) {
      blocks.push({ type: 'raw', text: text.slice(i) })
      break
    }
    const prelude = text.slice(i, brace)
    blocks.push({
      type: prelude.trimStart().startsWith('@') ? 'atrule' : 'rule',
      prelude,
      body: text.slice(brace + 1, j),
      text: text.slice(i, j + 1),
    })
    i = j + 1
  }
  return blocks
}

/** 一个选择器是否"只依赖死 class"。不含 class 的选择器永不判死。 */
function selectorIsDead(selector, dead) {
  const classes = [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])
  if (classes.length === 0) return false
  return classes.every((c) => dead.has(c))
}

const emptyStats = () => ({ removedRules: 0, trimmedSelectors: 0 })

function processBlocks(blocks, dead, stats) {
  const out = []
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k]

    if (b.type === 'atrule') {
      const innerText = processBlocks(parseBlocks(b.body), dead, stats).join('')
      // 只有"本来有规则、被我们删空了"才连带删除 at-rule；
      // 原本就是空的 at-rule 保持原样，以维持空死名单下的恒等性。
      if (innerText.trim() === '' && b.body.trim() !== '') {
        stats.removedRules++
        dropPrecedingBlank(out)
        continue
      }
      out.push(innerText === b.body ? b.text : b.prelude + '{' + innerText + '}')
      continue
    }

    if (b.type !== 'rule') { out.push(b.text); continue }

    const selectors = b.prelude.split(',').map((s) => s.trim()).filter(Boolean)
    if (selectors.length === 0) { out.push(b.text); continue }

    const alive = selectors.filter((s) => !selectorIsDead(s, dead))
    if (alive.length === selectors.length) { out.push(b.text); continue }

    if (alive.length === 0) {
      stats.removedRules++
      dropPrecedingBlank(out)
      continue
    }

    stats.trimmedSelectors += selectors.length - alive.length
    // prelude 已不含前置空白（被切成独立 raw token），可安全重建
    out.push(alive.join(', ') + b.prelude.slice(b.prelude.trimEnd().length) + '{' + b.body + '}')
  }
  return out
}

/** 规则被删后，把它前面那段纯空白也收掉，避免堆积空行 */
function dropPrecedingBlank(out) {
  if (out.length && /^\s+$/.test(out[out.length - 1])) out.pop()
}

/** 对 CSS 文本执行删除；dead 为空集时保证恒等 */
export function rebuild(css, dead, stats = emptyStats()) {
  return processBlocks(parseBlocks(css), dead, stats).join('')
}

// ── CLI ──
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const dryRun = process.argv.includes('--dry')
  const dead = new Set(JSON.parse(
    execFileSync(process.execPath, [resolve(root, 'scripts/find-dead-css.mjs'), '--json'], { encoding: 'utf8' })
  ))
  const outputs = GLOBAL_CSS_FILES.map((file) => {
    const path = resolve(root, file)
    const css = readFileSync(path, 'utf8')
    const stats = emptyStats()
    const result = rebuild(css, dead, stats)
    return { file, path, css, result, stats }
  })

  const before = outputs.reduce((sum, item) => sum + item.css.split('\n').length, 0)
  const after = outputs.reduce((sum, item) => sum + item.result.split('\n').length, 0)
  const removedRules = outputs.reduce((sum, item) => sum + item.stats.removedRules, 0)
  const trimmedSelectors = outputs.reduce((sum, item) => sum + item.stats.trimmedSelectors, 0)
  console.log(`死 class: ${dead.size}`)
  console.log(`整块删除的规则: ${removedRules}`)
  console.log(`从共享选择器列表中摘除: ${trimmedSelectors}`)
  console.log(`原 ${before} 行 → 新 ${after} 行 (-${before - after})`)

  const balanced = outputs.every(({ result }) =>
    (result.match(/\{/g) || []).length === (result.match(/\}/g) || []).length
  )
  console.log(`括号平衡: ${balanced ? 'OK' : '失败'}`)
  if (!balanced) {
    console.error('拒绝写入：大括号不平衡')
    process.exitCode = 1
  } else if (dryRun) {
    console.log('\n--dry：未写入')
  } else {
    for (const { path, result } of outputs) writeFileSync(path, result)
    console.log(`\n已写入 ${outputs.length} 个全局 CSS 文件`)
  }
}
