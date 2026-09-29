// 临时脚本：修复「删除规则后残留的孤儿选择器列表行」。默认 dry-run，--apply 写入。用完即删。
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const FILES = [
  'src/app.css', 'src/app-pc.css', 'src/styles/content.css', 'src/styles/explore.css',
  'src/styles/home.css', 'src/styles/lyrics.css', 'src/styles/lyrics/context.css',
  'src/styles/lyrics/controls.css', 'src/styles/lyrics/player.css',
  'src/styles/mobile/responsive.css', 'src/styles/shell.css', 'src/styles/theme-transition.css',
]

/**
 * 在 depth 0 找出「既不含 { 也不含 }」的连续行块。
 * 合法 CSS 里这种行只可能是跨行选择器列表的中间行，后面必须紧跟含 { 的行。
 * 不紧跟 → 孤儿（规则体已被删掉，只剩选择器碎片）。
 */
/** 把注释内容替换成空格（保留换行），这样多行注释的续行不会被当成选择器碎片 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

function findOrphans(text) {
  const lines = text.split('\n')
  const bare = stripComments(text).split('\n')
  const orphans = []
  let depth = 0
  let run = []
  const flush = (next) => {
    if (!run.length) return
    if (!(next ?? '').includes('{')) orphans.push([run[0], run[run.length - 1]])
    run = []
  }
  for (let i = 0; i < bare.length; i++) {
    const ln = bare[i]
    for (const ch of ln) { if (ch === '{') depth++; else if (ch === '}') depth-- }
    const trimmed = ln.trim()
    const isFragment = depth === 0 && trimmed !== '' && !ln.includes('{') && !ln.includes('}')
      && !trimmed.startsWith('@')
    if (isFragment) { run.push(i); continue }
    flush(ln)
  }
  flush(null)
  return { orphans, lines }
}

const HEAD = process.argv.includes('--check-head')
let bad = 0
for (const f of FILES) {
  const text = HEAD ? execFileSync('git', ['show', `HEAD:${f}`], { encoding: 'utf8' }) : readFileSync(f, 'utf8')
  const { orphans, lines } = findOrphans(text)
  const n = orphans.reduce((s, [a, b]) => s + (b - a + 1), 0)
  if (!orphans.length) continue
  bad += n
  console.log(`${HEAD ? 'HEAD ' : ''}${f.padEnd(32)} 孤儿块 ${orphans.length} 个 / ${n} 行`)
  if (HEAD || process.argv.includes('--verbose')) {
    for (const [a, b] of orphans) {
      console.log(`    ${a + 1}-${b + 1}: ${lines[a].trim().slice(0, 58)}`)
      console.log(`        下一行: ${(lines[b + 1] ?? '<EOF>').trim().slice(0, 58)}`)
    }
  }
}
console.log(bad === 0 ? '\n没有孤儿' : `\n合计 ${bad} 行孤儿`)

if (!HEAD && process.argv.includes('--apply') && bad) {
  for (const f of FILES) {
    const { orphans, lines } = findOrphans(readFileSync(f, 'utf8'))
    if (!orphans.length) continue
    const kill = new Set()
    for (const [a, b] of orphans) for (let i = a; i <= b; i++) kill.add(i)
    const out = lines.filter((_, i) => !kill.has(i))
      .filter((ln, i, arr) => !(ln.trim() === '' && arr[i - 1]?.trim() === ''))
    writeFileSync(f, out.join('\n'))
  }
  console.log('已写入')
}
