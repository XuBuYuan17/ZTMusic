import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectBuildContext } from './build-channel.mjs'
import { validateReleaseTag } from './validate-release-tag.mjs'

const workflow = await readFile(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8')
const releasePrepare = await readFile(new URL('../.github/workflows/release-prepare.yml', import.meta.url), 'utf8')
const releasePublish = await readFile(new URL('../.github/workflows/release-publish.yml', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const stable = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
const dev = JSON.parse(await readFile(new URL('../src-tauri/tauri.dev.conf.json', import.meta.url), 'utf8'))

assert.ok(workflow.includes('build_windows:'), 'workflow_dispatch should expose the Windows build switch')
assert.ok(workflow.includes('build_linux:'), 'workflow_dispatch should expose the Linux build switch')
assert.match(workflow, /build_windows:[\s\S]*?default: false/, 'Windows packaging must be opt-in by default')
assert.match(workflow, /build_linux:[\s\S]*?default: false/, 'Linux packaging must be opt-in by default')
assert.ok(workflow.includes('needs: [source-check, windows, linux]'), 'release should wait for validation and both desktop builds')
assert.ok(workflow.includes('artifacts/**/*.exe'), 'tag releases should include Windows installers')
assert.ok(workflow.includes('artifacts/**/*.deb'), 'tag releases should include Debian packages')
assert.ok(workflow.includes('artifacts/**/*.rpm'), 'tag releases should include RPM packages')
assert.ok(!workflow.includes('android:'), 'workflow should not contain an Android build job')
assert.ok(!workflow.includes('artifacts/**/*.apk'), 'releases should not publish APK files')
assert.equal(packageJson.scripts['tauri:build:android'], undefined, 'package scripts should not expose Android builds')
assert.equal(packageJson.scripts['setup:android-signing'], undefined, 'package scripts should not expose Android signing')
assert.ok(!releasePrepare.includes('gh workflow run build.yml'), 'release prepare should not manually dispatch duplicate installer builds')
assert.ok(releasePrepare.includes('gh pr create --base main'), 'version updates must enter main through a PR')
assert.ok(!releasePrepare.includes('HEAD:main'), 'release preparation must not bypass main protection')
assert.ok(releasePublish.includes('types: [closed]'), 'tagging must wait for a closed release PR')
assert.ok(releasePublish.includes('github.event.pull_request.merged == true'), 'unmerged PRs must not publish')
assert.ok(releasePublish.includes('github.event.pull_request.head.repo.full_name == github.repository'), 'tagging must reject foreign release branches')
assert.ok(workflow.includes('branches: [main, dev]'), 'checks should support both long-lived branches')
assert.ok(workflow.includes('retention-days: 14'), 'development artifacts should expire after 14 days')
assert.ok(workflow.includes('github.run_number') && workflow.includes('outputs.short-sha'), 'artifact names should identify their build')
assert.ok(workflow.includes('permissions:\n  contents: read') || workflow.includes('permissions:\r\n  contents: read'), 'PR builds should default to read-only permissions')
assert.ok(!workflow.includes('pull_request_target'), 'PR code must not run with target workflow privileges')
assert.ok(workflow.includes('--features dev-channel') && workflow.includes('VITE_APP_CHANNEL: dev'), 'native and frontend channels should agree')
assert.ok(workflow.includes('node scripts/validate-release-tag.mjs'), 'official tags must be validated before packaging')
assert.notEqual(stable.identifier, dev.identifier, 'development storage should use a separate app identifier')
assert.equal(dev.identifier, 'com.zheting.music.dev')
assert.equal(dev.productName, '哲听 Dev')
assert.equal(dev.mainBinaryName, 'zheting-dev')
assert.equal(dev.app.windows[0].devtools, true)
assert.equal(stable.app.windows[0].devtools, false)
assert.equal(stable.bundle.linux.deb.desktopTemplate, 'linux/zheting.desktop')
assert.equal(stable.bundle.linux.deb.files, undefined, 'packages must not install a fixed shared desktop entry')

const sha = 'a'.repeat(40)
const context = (event, ref, overrides = {}) => selectBuildContext({ event, ref, sha, ...overrides })

assert.deepEqual(context('push', 'refs/heads/dev'), {
  channel: 'dev', 'short-sha': 'aaaaaaaa', 'build-windows': 'false', 'build-linux': 'false', publish: 'false',
})
assert.deepEqual(context('push', 'refs/heads/main'), {
  channel: 'stable', 'short-sha': 'aaaaaaaa', 'build-windows': 'false', 'build-linux': 'false', publish: 'false',
})

for (const base of ['dev', 'main']) {
  const pr = context('pull_request', 'refs/pull/12/merge', { base })
  assert.equal(pr.channel, 'dev')
  assert.equal(pr['build-windows'], 'false')
  assert.equal(pr['build-linux'], 'false')
  assert.equal(pr.publish, 'false')
}

const manualNone = context('workflow_dispatch', 'refs/heads/main', { buildWindows: 'false', buildLinux: 'false' })
assert.equal(manualNone['build-windows'], 'false')
assert.equal(manualNone['build-linux'], 'false')

const manualWindows = context('workflow_dispatch', 'refs/heads/main', { buildWindows: 'true', buildLinux: 'false' })
assert.equal(manualWindows['build-windows'], 'true')
assert.equal(manualWindows['build-linux'], 'false')

const manualLinux = context('workflow_dispatch', 'refs/heads/dev', { buildWindows: 'false', buildLinux: 'true' })
assert.equal(manualLinux['build-windows'], 'false')
assert.equal(manualLinux['build-linux'], 'true')

const manualBoth = context('workflow_dispatch', 'refs/heads/dev', { buildWindows: 'true', buildLinux: 'true' })
assert.equal(manualBoth['build-windows'], 'true')
assert.equal(manualBoth['build-linux'], 'true')

for (const event of ['push', 'workflow_dispatch']) {
  const tag = context(event, 'refs/tags/v1.4.1', { buildWindows: 'false', buildLinux: 'false' })
  assert.equal(tag.channel, 'stable')
  assert.equal(tag['build-windows'], 'true')
  assert.equal(tag['build-linux'], 'true')
  assert.equal(tag.publish, 'true')
}

assert.throws(() => context('push', 'refs/tags/v1.4.1-dev'), /Only main/)
assert.throws(() => context('workflow_dispatch', 'refs/heads/feature/ui'), /Only main/)
assert.throws(() => context('pull_request_target', 'refs/heads/main'), /Unsupported/)
assert.throws(() => context('push', 'refs/heads/dev', { sha: 'bad' }), /Invalid build SHA/)

const release = { version: '1.4.1', changelog: '## [1.4.1] - 2026-09-30\r\n', onMain: true }
validateReleaseTag('v1.4.1', release)
assert.throws(() => validateReleaseTag('v1.4.2', release), /source version/)
assert.throws(() => validateReleaseTag('v1.4.1-dev', release), /source version/)
assert.throws(() => validateReleaseTag('v1.4.1', { ...release, onMain: false }), /belong to main/)
assert.throws(() => validateReleaseTag('v1.4.1', { ...release, changelog: '## [Unreleased]' }), /changelog/)

console.log('build workflow self-check passed: checks by default, manual installers, automatic release packaging')
