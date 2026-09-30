import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
const paths = output => output.split('\0').filter(Boolean)
const forbiddenPath = path => {
  if (/(^|\/)(?:node_modules|dist|dist-ssr|\.codex|\.codex-target|\.claude|\.agents|\.pnpm-store|\.android-signing|\.local)(?:\/|$)/i.test(path)) return true
  if (/^src-tauri\/(?:target|gen)\//i.test(path) || /^scripts\/_tmp-/i.test(path)) return true
  const name = path.split('/').at(-1)
  if (/^\.env(?:\.|$)/i.test(name) && !/^\.env(?:\.[\w-]+)*\.example$/i.test(name)) return true
  return /\.(?:pem|key|p12|pfx|jks|keystore|db|sqlite|sqlite3)(?:-(?:wal|shm|journal))?$/i.test(name)
}
const secretPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['API key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['session cookie', /MUSIC_U\s*[=:]\s*['"]?[A-Za-z0-9%+/_=-]{24,}/],
]
function secretLocations(text) {
  const findings = []
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [kind, pattern] of secretPatterns) {
      if (pattern.test(line)) findings.push({ line: index + 1, kind })
    }
  })
  return findings
}

for (const path of ['.codex/config.toml', '.env', '.env.production', '.android-signing/upload.jks', 'local.key', 'cache.sqlite-wal', 'src-tauri/target/debug/app.exe', 'scripts/_tmp-fix.mjs']) {
  assert.equal(forbiddenPath(path), true, `must reject ${path}`)
}
for (const path of ['.env.example', '.env.production.example', '.github/workflows/build.yml', 'src/lib/db/settings.ts', 'public/fonts/HarmonyOS-Sans-LICENSE.txt', 'src/lib/utils/runtime.test.ts']) {
  assert.equal(forbiddenPath(path), false, `must allow ${path}`)
}
const token = 'ghp_' + 'a'.repeat(36)
assert.deepEqual(secretLocations('safe\r\n' + token), [{ line: 2, kind: 'GitHub token' }])
assert.equal(secretLocations('-----BEGIN ' + 'PRIVATE KEY-----')[0].kind, 'private key')
assert.equal(secretLocations('MUSIC_U=' + 'a'.repeat(32))[0].kind, 'session cookie')
assert.equal(secretLocations('MUSIC_U=test; GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}').length, 0)

const tracked = paths(git(['ls-files', '-z']))
const staged = new Set(paths(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])))
const failures = []
function scan(path, bytes, source) {
  if (bytes.includes(0)) return
  for (const finding of secretLocations(bytes.toString('utf8'))) {
    failures.push(`${source} ${path}:${finding.line}: possible ${finding.kind}`)
  }
}
for (const path of tracked) {
  if (forbiddenPath(path)) failures.push(`tracked local/generated/sensitive file: ${path}`)
  const absolute = resolve(root, path)
  if (existsSync(absolute)) scan(path, readFileSync(absolute), 'working tree')
  if (staged.has(path)) {
    scan(path, execFileSync('git', ['show', `:${path}`], { cwd: root }), 'index')
  }
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log(`repository hygiene: ${tracked.length} tracked paths checked; no forbidden files or recognized secret patterns`)
}
