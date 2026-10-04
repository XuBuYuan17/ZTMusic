import assert from 'node:assert/strict'
import { selectBuildContext } from './build-channel.mjs'

const sha = 'a'.repeat(40)

for (const headRef of ['codex/mobile-fixes-round-2', 'feature/desktop-player', 'fix/search-page']) {
  const context = selectBuildContext({
    event: 'pull_request',
    ref: 'refs/pull/5/merge',
    sha,
    headRef,
  })
  assert.equal(context['build-windows'], 'false', `${headRef} PR must not build Windows installers by default`)
  assert.equal(context['build-linux'], 'false', `${headRef} PR must not build Linux packages by default`)
  assert.equal(context.publish, 'false', `${headRef} PR must never publish`)
}

for (const branch of ['refs/heads/main', 'refs/heads/dev']) {
  const context = selectBuildContext({ event: 'push', ref: branch, sha })
  assert.equal(context['build-windows'], 'false', `${branch} push should run checks only`)
  assert.equal(context['build-linux'], 'false', `${branch} push should run checks only`)
}

const manual = selectBuildContext({
  event: 'workflow_dispatch',
  ref: 'refs/heads/main',
  sha,
  buildWindows: 'true',
  buildLinux: 'true',
})
assert.equal(manual['build-windows'], 'true', 'manual dispatch should build Windows when requested')
assert.equal(manual['build-linux'], 'true', 'manual dispatch should build Linux when requested')

console.log('build routing checks passed: ordinary changes run checks only; installers are opt-in')
