/**
 * prune-dead-css 的解析/重建保真自检。
 * Run: node scripts/prune-dead-css.test.mjs
 *
 * 核心不变量：**空死名单时，输出必须与输入逐字节一致**。
 * 若该断言失败，说明重建逻辑会破坏 CSS 结构（曾发生：规则块丢失闭合 }）。
 */
import assert from 'node:assert/strict'

const { parseBlocks, rebuild } = await import('./prune-dead-css.mjs')

let passed = 0
const check = (cond, msg) => { assert.ok(cond, msg); passed++ }

// 1. round-trip：token 拼回原文
const samples = [
  '.a { color: red; }',
  '\n\n.a,\n.b { color: red; }\n',
  '/* c */\n.a { x: 1; }\n/* d */\n',
  '@media (max-width: 5px) {\n  .a { x: 1; }\n}\n',
  '.a { x: 1; }\n\n.b { y: 2; }\n',
  'html.native-shell :is(input, .selectable) { user-select: text; }',
  '.a { background: url("data:image/svg+xml,%3Csvg%3E{}%3C/svg%3E"); }',
  // 原本就空的 at-rule 必须原样保留，否则空死名单下就不恒等了（曾因此破坏恒等性）
  '@media (max-width: 768px) {\n}\n',
]
for (const s of samples) {
  check(parseBlocks(s).map((b) => b.text).join('') === s, `round-trip: ${JSON.stringify(s.slice(0, 34))}`)
}

// 2. 空死名单 → 恒等（最关键的一条）
for (const s of samples) {
  check(rebuild(s, new Set()) === s, `identity with empty dead set: ${JSON.stringify(s.slice(0, 34))}`)
}

// 3. 整块删除
{
  const out = rebuild('.dead { x: 1; }\n.alive { y: 2; }\n', new Set(['dead']))
  check(!out.includes('.dead'), 'whole dead rule is removed')
  check(out.includes('.alive { y: 2; }'), 'alive rule survives')
}

// 4. 共享选择器列表里只摘死的，且保留闭合括号
{
  const out = rebuild('.alive, .dead { x: 1; }\n', new Set(['dead']))
  check(out.includes('.alive'), 'alive selector kept')
  check(!/\.dead\b/.test(out), 'dead selector dropped from the list')
  check((out.match(/\{/g) || []).length === (out.match(/\}/g) || []).length, 'braces stay balanced')
}

// 5. 纯元素/属性选择器不受影响
{
  const out = rebuild('a { x: 1; }\ninput[type="url"] { y: 2; }\n', new Set(['dead']))
  check(out.includes('a { x: 1; }') && out.includes('input[type="url"]'), 'selectors without classes untouched')
}

// 6. at-rule 内部清空后连同 at-rule 一起删，非空则保留
{
  const emptied = rebuild('@media (max-width: 5px) {\n  .dead { x: 1; }\n}\n', new Set(['dead']))
  check(emptied.trim() === '', 'at-rule emptied of all rules is removed')
  const kept = rebuild('@media (max-width: 5px) {\n  .dead { x: 1; }\n  .alive { y: 2; }\n}\n', new Set(['dead']))
  check(kept.includes('@media') && kept.includes('.alive'), 'at-rule with survivors is kept')
  check((kept.match(/\{/g) || []).length === (kept.match(/\}/g) || []).length, 'at-rule braces balanced')
}

console.log(`prune-dead-css self-check: ${passed} assertions passed`)
