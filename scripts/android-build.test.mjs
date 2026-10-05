import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [workflow, desktopWorkflow, cargo, lib, stableText, devText, ignore] = await Promise.all([
  read('.github/workflows/android.yml'), read('.github/workflows/build.yml'),
  read('src-tauri/Cargo.toml'), read('src-tauri/src/lib.rs'),
  read('src-tauri/tauri.conf.json'), read('src-tauri/tauri.dev.conf.json'), read('.gitignore'),
])

const triggers = workflow.match(/^on:\r?\n([\s\S]*?)^permissions:/m)?.[1]
assert.ok(triggers)
assert.deepEqual([...triggers.matchAll(/^  ([a-z_]+):/gm)].map(match => match[1]), ['workflow_dispatch'], 'test APK builds must be manually triggered')
assert.match(triggers, /options: \[debug, release\]/, 'both debug and optimized release must be selectable')
assert.match(triggers, /default: debug/, 'existing test builds keep their default')
assert.match(workflow, /permissions:\r?\n  contents: read/, 'Android packaging does not need release permissions')
assert.ok(!/action-gh-release|gh release|pull_request_target|secrets\./.test(workflow), 'test builds must not publish or depend on secrets')
assert.match(workflow, /cancel-in-progress: false/, 'test signing-key initialization is serialized')

const config = JSON.parse(workflow.match(/^  ANDROID_CONFIG: '(.+)'$/m)?.[1] ?? '{}')
assert.equal(config.identifier, 'com.zheting.music.androidtest')
assert.notEqual(config.identifier, JSON.parse(stableText).identifier, 'test data must not overwrite a stable installation')
assert.notEqual(config.identifier, JSON.parse(devText).identifier, 'Android tests use their own identity')
assert.match(workflow, /android init[^\r\n]*--config "\$ANDROID_CONFIG"/, 'init must use the test package identity')
assert.match(workflow, /args=\(--ci --apk --target aarch64 --config "\$ANDROID_CONFIG"\)/, 'both modes build arm64 with the same package identity')
assert.match(workflow, /pnpm tauri android build "\$\{args\[@\]\}"/, 'preserve arguments including configuration JSON as one argument')
assert.match(workflow, /android init --ci --skip-targets-install/, 'CI must not prompt or install additional Rust targets')
assert.match(workflow, /targets: aarch64-linux-android/, 'the selected Rust target must already be installed')
assert.match(workflow, /if \[\[ "\$\{\{ inputs.build_type \}\}" == "debug" \]\]; then args\+=\(--debug\); fi/, 'only debug adds --debug; release uses Cargo optimizations')
assert.match(workflow, /inputs.build_type == 'release' && 'stable' \|\| 'dev'/, 'optimized builds disable the frontend developer channel')
assert.match(workflow, /pnpm install --frozen-lockfile/, 'use the repository dependency lock')
assert.match(workflow, /uses: android-actions\/setup-android@v3\r?\n        with:\r?\n          packages: platform-tools\r?\n/, 'SDK setup must override the obsolete tools package default')
assert.match(workflow, /apksigner" verify --verbose/, 'reject an unsigned or invalid APK')
assert.match(workflow, /name: Test Android native plugin[\s\S]*?\.\/gradlew testDebugUnitTest/, 'native plugin unit tests must run in remote CI')
assert.match(workflow, /if-no-files-found: error/, 'missing output must fail the build')
assert.match(workflow, /path: src-tauri\/gen\/android\/app\/build\/outputs\/apk\/\*\*\/\*\.apk/, 'upload APKs only, excluding keystores and generated source')
assert.match(workflow, /path: ~\/\.android\/debug\.keystore/, 'cache the test certificate for repeat installations')
assert.match(workflow, /android-aarch64-\$\{\{ inputs.build_type \}\}/, 'debug and release Rust caches stay separate')
assert.match(workflow, /zheting-android-arm64-\$\{\{ inputs.build_type \}\}/, 'artifact names identify the selected mode')

const signing = workflow.match(/node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n          NODE/)?.[1]
assert.ok(signing, 'release signing setup must exist')
const signingCode = signing.replace(/^\s*import[^\r\n]*\r?\n/gm, '')
const generated = 'buildTypes {\n    getByName("debug") { isDebuggable = true }\n    getByName("release") {\n        isMinifyEnabled = true\n    }\n}\n'
let signed
runInNewContext(signingCode, {
  readFileSync: () => generated,
  writeFileSync(path, content) { assert.equal(path, 'src-tauri/gen/android/app/build.gradle.kts'); signed = content },
})
assert.ok(signed.includes('getByName("release") {\n            signingConfig = signingConfigs.getByName("debug")'), 'release uses the cached test certificate')
assert.ok(signed.includes('getByName("debug") { isDebuggable = true }'), 'debug settings remain intact')
assert.ok(signed.includes('isMinifyEnabled = true'), 'generated release optimizations remain intact')
assert.throws(() => runInNewContext(signingCode, { readFileSync: () => '', writeFileSync() { assert.fail('unsupported template must not be modified') } }), /release build type not found/, 'unexpected templates fail instead of producing an unsigned APK')

const library = cargo.match(/\[lib\]([\s\S]*?)\[features\]/)?.[1] ?? ''
for (const kind of ['staticlib', 'cdylib', 'rlib']) assert.ok(library.includes(`"${kind}"`), `${kind} output is required`)
const dependencies = cargo.match(/\[dependencies\]([\s\S]*?)\[target\./)?.[1] ?? ''
assert.ok(!/tauri-plugin-(?:single-instance|window-state)/.test(dependencies), 'mobile must not compile desktop-only plugins')
assert.match(cargo, /\[target\.'cfg\(not\(any\(target_os = "android", target_os = "ios"\)\)\)'\.dependencies\]\r?\n(?:tauri-plugin-[^\r\n]+\r?\n){2}/, 'desktop plugins remain available on desktop targets')
assert.match(lib, /#\[cfg_attr\(mobile, tauri::mobile_entry_point\)\]\r?\npub fn run\(\)/, 'Android needs the Tauri mobile entry point')
assert.ok(ignore.includes('src-tauri/gen/'), 'generated Android projects stay out of Git')
assert.ok(ignore.includes('*.keystore') && ignore.includes('*.jks'), 'local signing keys stay out of Git')
assert.ok(!desktopWorkflow.includes('artifacts/**/*.apk'), 'test APKs must not enter the desktop release pipeline')
console.log('Android build checks passed: trigger, identity, signing, artifacts and mobile entry boundaries')
