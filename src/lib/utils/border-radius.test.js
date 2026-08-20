import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { convergeRadiusDeclarations, isAllowedRadius, radiusToken } from '../../../scripts/converge-border-radius.mjs'

const ROOT = new URL('../../../', import.meta.url)

async function collect(dir, files = []) {
  for (const entry of await readdir(new URL(dir, ROOT), { withFileTypes: true })) {
    const rel = `${dir}${entry.name}`
    if (entry.isDirectory()) await collect(`${rel}/`, files)
    else if (/\.(css|svelte|js)$/.test(entry.name)) files.push(rel)
  }
  return files
}

assert.deepEqual(
  [4, 5, 8, 11, 14, 19, 999, 1000].map(radiusToken),
  ['4px', 'var(--radius-xs)', 'var(--radius-sm)', 'var(--radius-md)', 'var(--radius-lg)', 'var(--radius-xl)', '999px', '999px']
)

const files = ['index.html', ...await collect('src/')]
const offenders = []
let declarations = 0

for (const file of files) {
  const source = await readFile(new URL(file, ROOT), 'utf8')
  const { changes } = convergeRadiusDeclarations(source)
  declarations += [...source.matchAll(/border-radius\s*:/g)].length
  if (changes) offenders.push(`${file}: ${changes} 处未使用统一圆角令牌`)
  for (const match of source.matchAll(/border-radius\s*:\s*([^;}\r\n"']+)/g)) {
    if (!isAllowedRadius(match[1])) {
      const line = source.slice(0, match.index).split('\n').length
      offenders.push(`${file}:${line} radius value ${match[1].trim()}`)
    }
  }
}

assert.ok(declarations >= 250, `应扫描到至少 250 处 border-radius，实际 ${declarations}`)
assert.deepEqual(offenders, [], `发现游离圆角：\n  ${offenders.join('\n  ')}`)

const appCss = await readFile(new URL('src/app.css', ROOT), 'utf8')
for (const [name, value] of [['xs', 6], ['sm', 8], ['md', 12], ['lg', 16], ['xl', 20]]) {
  assert.match(appCss, new RegExp(`--radius-${name}:\\s*${value}px`), `缺少 --radius-${name}: ${value}px`)
}

console.log(`border radius self-check: ${declarations} declarations use the shared scale`)
