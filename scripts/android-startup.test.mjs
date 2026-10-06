import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8')
const source = await read('src/lib/app/android-startup.ts')
const script = stripTypeScriptTypes(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, ''))

for (const native of [false, true]) {
  for (const saved of [null, 'light', 'dark']) {
    const calls = []
    const root = { dataset: {}, style: {} }
    const body = { style: {} }
    const context = {
      isTauriRuntime: () => native,
      runtimePlatform: () => native ? 'Android' : 'Windows',
      matchMedia: query => ({ matches: query.includes('dark') }),
      localStorage: { getItem: () => saved },
      performance: { mark() {} },
      invoke: (...args) => { calls.push(args); return Promise.resolve() },
      document: {
        documentElement: root,
        body,
        querySelector: () => ({ setAttribute() {} }),
      },
    }
    runInNewContext(script, context)
    context.prepareAndroidStartup()
    const expected = saved || 'dark'
    assert.equal(root.dataset.theme, expected)
    assert.equal(root.style.colorScheme, expected)
    assert.equal(body.style.backgroundColor, expected === 'dark' ? '#111113' : '#ffffff')
    assert.equal(calls.length, 0, 'startup theme application must never wait on or invoke native IPC')

    context.announceAndroidFrame()
    context.announceAndroidFrame()
    assert.equal(calls.length, native ? 1 : 0, 'mounted shell notifies Android exactly once')
    if (native) {
      assert.equal(calls[0][1].payload.action, 'startupReady')
      context.syncAndroidTheme('light')
      assert.equal(calls.at(-1)[1].payload.action, 'appTheme')
    }
  }
}

const playerSource = await read('src/lib/stores/player.svelte.ts')
const initialStateBody = playerSource.match(/_restoreInitialState\(\): void \{([\s\S]*?)\n  \}/)?.[1]
assert.ok(initialStateBody)
for (const native of [true, false]) {
  const largeReads = []
  const stateContext = {
    engine: { native, setVolume() {} },
    STORAGE_KEYS: new Proxy({}, { get: (_, key) => key }),
    parseStoredTrackId: Number,
    getStorage: (_, fallback) => fallback,
    getSetting: (_, fallback) => fallback,
    getStorageJson: (key, fallback) => { largeReads.push(key); return fallback },
    replaceQueueState: (queue, queueIndex) => ({ queue, queueIndex }),
    restoreShuffleState: () => null,
  }
  runInNewContext(stripTypeScriptTypes('function restore() {' + initialStateBody + '}'), stateContext)
  stateContext.restore.call({})
  assert.equal(largeReads.length, native ? 0 : 2, 'Android must not parse the redundant large WebView queue')
}

const main = await read('src/main.js')
assert.match(main, /prepareAndroidStartup\(\)/)
assert.doesNotMatch(main, /await prepareAndroidStartup\(\)/, 'App mount must not wait for startup preparation')
assert.doesNotMatch(main, /installAndroidStartup/, 'no JS reveal/splash coordinator remains')

const app = await read('src/App.svelte')
assert.doesNotMatch(app, /StartupSplash|startupActive|startupShellReady|ztmusic:android-reveal|ztmusic:system-splash-exit/)
assert.match(app, /\$effect\(\(\) => \{ untrack\(\(\) => player\.restore\(\)\) \}\)/, 'playback hydration runs in parallel with first paint')
assert.match(app, /if \(isMobileRuntime\(\)\) void loadMobileApp\(\)/, 'mobile shell chunk starts loading as soon as App evaluates')

const activity = await read('src-tauri/android/MainActivity.kt')
assert.ok(activity.indexOf('installSplashScreen()') < activity.indexOf('super.onCreate(savedInstanceState)'))
assert.match(activity, /setKeepOnScreenCondition \{ !uiFrameSubmitted \}/)
assert.match(activity, /setOnExitAnimationListener \{ provider -> provider\.remove\(\) \}/)
assert.ok(!/postVisualStateCallback|ViewTreeObserver|FastOutSlowInInterpolator|ValueAnimator/.test(activity), 'custom first-frame/exit animation machinery is removed')
assert.ok(!/view\.alpha\s*=\s*0f|scaleX\(|scaleY\(|ztmusic:android-reveal/.test(activity), 'WebView is never hidden for a branded reveal')
assert.ok(!/320L|8000L/.test(activity), 'no artificial startup minimum or legacy reveal watchdog remains')
assert.match(activity, /3000L/, 'failure watchdog releases the static system launch surface')
assert.ok(!/overridePendingTransition|windowEnterAnimation|Thread\.sleep|startActivity\(/.test(activity))

for (const [directory, color] of [['values', '#ffffff'], ['values-night', '#111113']]) {
  const xml = await read('src-tauri/android/res/' + directory + '/zt_startup.xml')
  assert.ok(xml.includes(color))
  assert.match(xml, /windowSplashScreenAnimatedIcon">@mipmap\/ic_launcher/)
  assert.match(xml, /postSplashScreenTheme">@style\/Theme.ZTMusic/)
}
const adaptive = await read('src-tauri/android/res/mipmap-anydpi-v26/ic_launcher.xml')
assert.match(adaptive, /<adaptive-icon[\s\S]*<background[\s\S]*<foreground/)
assert.ok(!activity.includes('SplashActivity'))
const emptyIcon = await read('src-tauri/android/res/drawable/zt_startup_empty.xml')
assert.match(emptyIcon, /android:fillColor="@android:color\\/transparent"/)
assert.ok(!/bitmap|zt_portrait|ic_launcher/.test(emptyIcon), 'system startup drawable must stay visually empty')

// Exercise the actual Android overlay generator against a regenerated project, including a second run.
const project = await mkdtemp(join(tmpdir(), 'zt-startup-'))
try {
  await mkdir(join(project, 'app/src/main'), { recursive: true })
  await writeFile(join(project, 'app/build.gradle.kts'), 'android { namespace = "com.zheting.music.androidtest" }\ndependencies { }\n')
  await writeFile(join(project, 'app/src/main/AndroidManifest.xml'),
    '<manifest><application><activity android:name=".MainActivity" android:exported="true"><intent-filter /></activity></application></manifest>')
  const generator = new URL('./configure-android-startup.mjs', import.meta.url)
  for (let run = 0; run < 2; run++) execFileSync(process.execPath, [fileURLToPath(generator), project])
  const gradle = await readFile(join(project, 'app/build.gradle.kts'), 'utf8')
  const manifest = await readFile(join(project, 'app/src/main/AndroidManifest.xml'), 'utf8')
  assert.equal(gradle.match(/core-splashscreen/g).length, 1)
  assert.equal(manifest.match(/Theme.ZTMusic.Starting/g).length, 1)
  assert.equal(manifest.match(/<activity /g).length, 1)
  const generatedMain = await readFile(join(project, 'app/src/main/java/com/zheting/music/androidtest/MainActivity.kt'), 'utf8')
  assert.ok(generatedMain.startsWith('package com.zheting.music.androidtest'))
  assert.ok(!generatedMain.includes('__PACKAGE__'))
  const bytes = await readFile(join(project, 'app/src/main/res/drawable/zt_portrait.png'))
  const original = await readFile(new URL('../src-tauri/icons/icon.png', import.meta.url))
  assert.ok(bytes.equals(original), 'keep the selected portrait unchanged')
  assert.equal(await readFile(join(project, 'app/src/main/res/drawable/zt_startup_empty.xml'), 'utf8'), emptyIcon, 'generator must copy the transparent system startup drawable')
} finally {
  await rm(project, { recursive: true, force: true })
}
console.log('Android startup: synchronous theme, immediate shell handoff, parallel restore and static system launch surface passed')
