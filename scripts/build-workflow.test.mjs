import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workflow = await readFile(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8')
const releasePrepare = await readFile(new URL('../.github/workflows/release-prepare.yml', import.meta.url), 'utf8')
const cargoToml = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.ok(workflow.includes('build_android:'), 'workflow_dispatch should expose the Android build switch')
assert.ok(workflow.includes('android-actions/setup-android@v3'), 'Android job should install SDK command-line tools')
assert.ok(workflow.includes('"ndk;${ANDROID_NDK_VERSION}"'), 'Android job should install the pinned NDK')
assert.ok(workflow.includes('aarch64-linux-android,armv7-linux-androideabi,i686-linux-android,x86_64-linux-android'), 'Android job should install Rust Android targets')
assert.ok(workflow.includes('pnpm tauri android init --ci --skip-targets-install'), 'Android job should initialize the generated Android project when absent')
assert.ok(workflow.includes('pnpm tauri:build:android'), 'Android job should use the project APK build script')
assert.ok(workflow.includes('src-tauri/gen/android/app/build/outputs/apk/**/*.apk'), 'Android APK artifact should be uploaded')
assert.ok(workflow.includes('artifacts/**/*.apk'), 'tag releases should include Android APK files')
assert.equal(packageJson.scripts['tauri:build:android'], 'tauri android build --debug --apk --target aarch64 --target armv7 --target x86_64')
assert.ok(cargoToml.includes('crate-type = ["staticlib", "cdylib", "rlib"]'), 'Tauri Android should build the app_lib cdylib .so artifact')
assert.ok(!releasePrepare.includes('gh workflow run build.yml'), 'release prepare should not manually dispatch duplicate installer builds')

console.log('build workflow self-check: 11 assertions passed')
