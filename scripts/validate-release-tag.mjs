import { readFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function validateReleaseTag(tag, { version, changelog, onMain }) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || tag !== `v${version}`) {
    throw new Error('Release tag must match the source version')
  }
  if (!onMain) throw new Error('Release commit must belong to main')
  if (!changelog.split(/\r?\n/).some(line => line.startsWith(`## [${version}] - `))) {
    throw new Error('Release changelog entry is missing')
  }
}

export function validateCurrentRelease(tag) {
  const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], { encoding: 'utf8' })
  if (ancestry.error || ![0, 1].includes(ancestry.status)) {
    throw ancestry.error || new Error(ancestry.stderr || 'Unable to check main ancestry')
  }
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version
  validateReleaseTag(tag, {
    version,
    changelog: readFileSync('CHANGELOG.md', 'utf8'),
    onMain: ancestry.status === 0,
  })
  execFileSync(process.execPath, ['scripts/verify-versions.mjs'], { stdio: 'inherit' })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateCurrentRelease(process.env.GITHUB_REF_NAME)
}
