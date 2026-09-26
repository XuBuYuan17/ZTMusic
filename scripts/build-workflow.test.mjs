import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workflow = await readFile(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8')
const releasePrepare = await readFile(new URL('../.github/workflows/release-prepare.yml', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.ok(workflow.includes('build_windows:'), 'workflow_dispatch should expose the Windows build switch')
assert.ok(workflow.includes('build_linux:'), 'workflow_dispatch should expose the Linux build switch')
assert.ok(workflow.includes('needs: [windows, linux]'), 'release should wait for both desktop builds')
assert.ok(workflow.includes('artifacts/**/*.exe'), 'tag releases should include Windows installers')
assert.ok(workflow.includes('artifacts/**/*.deb'), 'tag releases should include Debian packages')
assert.ok(workflow.includes('artifacts/**/*.rpm'), 'tag releases should include RPM packages')
assert.ok(!workflow.includes('android:'), 'workflow should not contain an Android build job')
assert.ok(!workflow.includes('artifacts/**/*.apk'), 'releases should not publish APK files')
assert.equal(packageJson.scripts['tauri:build:android'], undefined, 'package scripts should not expose Android builds')
assert.equal(packageJson.scripts['setup:android-signing'], undefined, 'package scripts should not expose Android signing')
assert.ok(!releasePrepare.includes('gh workflow run build.yml'), 'release prepare should not manually dispatch duplicate installer builds')

console.log('build workflow self-check: 11 assertions passed')
