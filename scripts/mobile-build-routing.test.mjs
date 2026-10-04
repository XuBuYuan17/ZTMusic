import assert from 'node:assert/strict'
import { selectBuildContext } from './build-channel.mjs'

const sha = 'a'.repeat(40)
const mobileBranches = ['codex/mobile-fixes-round-2', 'codex/mobile-player', 'mobile/player-state']

for (const headRef of mobileBranches) {
  const context = selectBuildContext({
    event: 'pull_request',
    ref: 'refs/pull/5/merge',
    sha,
    headRef,
  })
  assert.equal(context['build-windows'], 'false', `${headRef} must not build Windows installers`)
  assert.equal(context['build-linux'], 'false', `${headRef} must not build Linux packages`)
  assert.equal(context.publish, 'false', `${headRef} must never publish`)
}

const desktopPr = selectBuildContext({
  event: 'pull_request',
  ref: 'refs/pull/6/merge',
  sha,
  headRef: 'feature/desktop-player',
})
assert.equal(desktopPr['build-windows'], 'true', 'desktop PRs should keep Windows validation')

const stable = selectBuildContext({ event: 'push', ref: 'refs/heads/main', sha, headRef: 'codex/mobile-player' })
assert.equal(stable['build-windows'], 'true', 'main pushes must still build Windows')
assert.equal(stable['build-linux'], 'true', 'main pushes must still build Linux')

console.log('mobile build routing checks passed: mobile PRs skip desktop installers')
