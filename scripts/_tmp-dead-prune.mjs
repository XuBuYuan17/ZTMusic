// 临时脚本：删除「引用的所有 class 在组件里都零引用」的顶层 CSS 规则。默认 dry-run。用完即删。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const APPLY = process.argv.includes('--apply')
const ROOTS = 'src'
const files = []
;(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(svelte|ts|js|mjs|css|html)$/.test(name)) files.push(p)
  }
})(ROOTS)

const MODIFIERS = /^(mobile-runtime|mobile-keyboard-open|desktop-titlebar|dark|light)$/
const comps = files.filter(f => !f.endsWith('.css'))
const cssFiles = files.filter(f => f.endsWith('.css'))

const used = new Set()
for (const f of comps) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) used.add(m[1])
  for (const m of text.matchAll(/class:([-_a-zA-Z][\w-]*)/g)) used.add(m[1])
  for (const m of text.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) used.add(c)
}

// 一行一条的规则（responsive.css 写法）也要能识别
function deadTopLevelRules(lines) {
  const dead = []
  let depth = 0, start = -1
  lines.forEach((ln, i) => {
    const before = depth
    for (const ch of ln) { if (ch === '{') depth++; else if (ch === '}') depth-- }
    if (before === 0 && depth > 0) { start = i; return }
    if (before > 0 && depth === 0 && start >= 0) {
      const head = lines.slice(start, i + 1).join('\n').split('{')[0]
      if (!head.trimStart().startsWith('@')) {
        const names = [...head.matchAll(/\.([-_a-zA-Z][\w-]*)/g)].map(m => m[1]).filter(c => !MODIFIERS.test(c))
        if (names.length && names.every(c => !used.has(c))) dead.push([start, i])
      }
      start = -1
      return
    }
    if (before === 0 && depth === 0 && /^[^@/\s*].*\{.*\}/.test(ln)) {
      const head = ln.slice(0, ln.indexOf('{'))
      const names = [...head.matchAll(/\.([-_a-zA-Z][\w-]*)/g)].map(m => m[1]).filter(c => !MODIFIERS.test(c))
      if (names.length && names.every(c => !used.has(c))) dead.push([i, i])
    }
  })
  return dead
}

const deadLines = new Set()
const perFile = new Map()
for (const f of cssFiles) {
  const lines = readFileSync(f, 'utf8').split('\n')
  const dead = deadTopLevelRules(lines)
  if (!dead.length) continue
  perFile.set(f, { lines, dead })
  for (const [a, b] of dead) for (let i = a; i <= b; i++) deadLines.add(f + ':' + i)
}

// 自定义属性安全检查：死规则里定义、但存活 CSS 里还在 var() 引用的 token
const definedInDead = new Map()
for (const [f, { lines, dead }] of perFile) {
  for (const [a, b] of dead) {
    for (const m of lines.slice(a, b + 1).join('\n').matchAll(/(--[\w-]+)\s*:/g)) {
      if (!definedInDead.has(m[1])) definedInDead.set(m[1], f)
    }
  }
}
const hazards = []
for (const [token, where] of definedInDead) {
  const re = new RegExp('var\\(\\s*' + token + '\\b')
  const stillUsed = []
  for (const f of cssFiles) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((ln, i) => { if (re.test(ln) && !deadLines.has(f + ':' + i)) stillUsed.push(f.replace(/^src[\\/]/, '') + ':' + (i + 1)) })
  }
  if (stillUsed.length) hazards.push([token, where, stillUsed])
}

let totalLines = 0
for (const [f, { dead }] of perFile) {
  const n = dead.reduce((s, [a, b]) => s + (b - a + 1), 0)
  totalLines += n
  console.log(`${f.replace(/^src[\\/]/, '').padEnd(30)} 删 ${String(dead.length).padStart(3)} 条规则 / ${String(n).padStart(4)} 行`)
}
console.log(`\n合计 ${totalLines} 行`)

if (hazards.length) {
  console.log(`\n⚠️  ${hazards.length} 个自定义属性只在这些死规则里定义，但存活规则仍在引用：`)
  for (const [token, where, stillUsed] of hazards) {
    console.log(`  ${token}  定义于 ${where.replace(/^src[\\/]/, '')}，仍被 ${stillUsed.slice(0, 6).join(', ')}${stillUsed.length > 6 ? ` …+${stillUsed.length - 6}` : ''} 引用`)
  }
} else console.log('\n✓ 没有「只在死规则里定义」的自定义属性')

// 安全网：组件里用到的类，是否都能在「存活下来的 CSS」里找到定义
function orphans(keepPredicate) {
  const defined = new Set()
  for (const f of cssFiles) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((ln, i) => {
      if (!keepPredicate(f, i)) return
      for (const m of ln.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1])
    })
  }
  return [...used].filter(c => !defined.has(c) && !MODIFIERS.test(c))
}
const deadOf = (f, i) => {
  const entry = perFile.get(f)
  if (!entry) return false
  return entry.dead.some(([a, b]) => i >= a && i <= b)
}
const before = orphans(() => true)
const after = orphans((f, i) => !deadOf(f, i))
console.log(`ORPHAN_BEFORE=${before.length}`)
console.log(`ORPHAN_AFTER=${after.length}`)
if (after.length > before.length) console.log('NEW_ORPHANS=' + after.filter(c => !before.includes(c)).join(','))
if (after.length > before.length) {
  console.log('\n⛔ 删除会引入孤儿类，已中止')
  process.exit(1)
}

if (process.argv.includes("--list")) {
  for (const [f, { lines, dead }] of perFile) {
    console.log('\n## ' + f.replace(/^src[\\/]/, ''))
    for (const [a, b] of dead) console.log('  ' + lines.slice(a, b + 1).join(' ').split('{')[0].replace(/\s+/g, ' ').trim())
  }
  process.exit(0)
}
if (APPLY && !hazards.length) {
  for (const [f, { lines, dead }] of perFile) {
    const kill = new Set()
    for (const [a, b] of dead) for (let i = a; i <= b; i++) kill.add(i)
    const kept = lines.filter((_, i) => !kill.has(i))
    // 折叠删除后产生的连续空行
    const out = kept.filter((ln, i) => !(ln.trim() === '' && kept[i - 1]?.trim() === ''))
    readFileSync(f, 'utf8')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(f, out.join('\n'))
  }
  console.log('\n已写入')
} else if (APPLY) console.log('\n有 hazard，未写入')
