/**
 * 将布局圆角收敛到 6 / 8 / 12 / 16 / 20px 五档语义令牌。
 *
 * 用法：
 *   node scripts/converge-border-radius.mjs --dry
 *   node scripts/converge-border-radius.mjs
 *
 * 1–4px 属于进度轨、滚动条等微型几何；50% 和 999px 分别代表圆形与
 * 胶囊，保持原样。其余 px 值按邻近的语义档位收敛。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

function targets() {
  const found = ['index.html']
  const walk = (dir) => {
    for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(rel)
      else if (/\.(css|svelte|js)$/.test(entry.name)) found.push(rel)
    }
  }
  walk('src')
  return found
}

export function radiusToken(px) {
  if (px <= 4) return `${px}px`
  if (px <= 7) return 'var(--radius-xs)'
  if (px <= 10) return 'var(--radius-sm)'
  if (px <= 13) return 'var(--radius-md)'
  if (px <= 18) return 'var(--radius-lg)'
  if (px === 999 || px === 1000) return '999px'
  return 'var(--radius-xl)'
}

export function isAllowedRadius(value) {
  const normalized = value.replace(/\s*!important\s*$/, '').trim()
  const allowed = /^(?:0|inherit|50%|999px|[1-4]px|var\(--radius-(?:xs|sm|md|lg|xl)\))$/
  return normalized.split(/\s+/).every((part) => allowed.test(part))
}

export function convergeRadiusDeclarations(source) {
  let changes = 0
  const output = source.replace(/border-radius\s*:\s*([^;}\r\n"']+)/g, (declaration, value) => {
    const next = value.replace(/\b(\d+)px\b/g, (literal, digits) => {
      const replacement = radiusToken(Number.parseInt(digits, 10))
      if (replacement === literal) return literal
      changes++
      return replacement
    })
    return declaration.replace(value, next)
  })
  return { output, changes }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry')
  let total = 0
  for (const file of targets()) {
    const path = resolve(root, file)
    const source = readFileSync(path, 'utf8')
    const { output, changes } = convergeRadiusDeclarations(source)
    if (!changes) continue
    total += changes
    console.log(`${file}: ${changes}`)
    if (!dryRun) writeFileSync(path, output)
  }
  console.log(`合计改动 ${total} 处${dryRun ? '（--dry：未写入）' : '，已写入'}`)
}
