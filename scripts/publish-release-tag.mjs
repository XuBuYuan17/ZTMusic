import { execFileSync, spawnSync } from 'node:child_process'
import { validateCurrentRelease } from './validate-release-tag.mjs'

const branch = process.env.RELEASE_BRANCH
if (!/^release\/v\d+\.\d+\.\d+$/.test(branch || '')) throw new Error('Invalid release branch')
const tag = branch.slice('release/'.length)
execFileSync('git', ['fetch', 'origin', 'main', '--tags'], { stdio: 'inherit' })
validateCurrentRelease(tag)
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const existing = spawnSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], { encoding: 'utf8' })
if (existing.error) throw existing.error
if (existing.status === 0) {
  if (existing.stdout.trim() !== sha) throw new Error('Existing release tag points to a different commit')
} else {
  execFileSync('git', ['tag', tag], { stdio: 'inherit' })
  execFileSync('git', ['push', 'origin', `refs/tags/${tag}`], { stdio: 'inherit' })
}
execFileSync('gh', ['workflow', 'run', 'build.yml', '--ref', tag, '-f', 'build_windows=true', '-f', 'build_linux=true'], { stdio: 'inherit' })
console.log(`Dispatched official installer build for ${tag} (${sha})`)
