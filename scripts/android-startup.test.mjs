import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8')
const source = await read('src/lib/app/android-startup.ts')
const script = stripTypeScriptTypes(source.replace(/^import .*\n/gm, '').replace(/^export /gm, ''))
for (const native of [false, true]) {
  for (const reduced of [false, true]) {
    const handlers = new Map(), calls = [], animations = [], classes = new Set()
    const node = { animate(frames, options) { animations.push({ frames, options }) } }
    const context = {
      isTauriRuntime: () => native, runtimePlatform: () => 'Android',
      matchMedia: query => ({ matches: query.includes('reduced') ? reduced : false }),
      performance: { mark() {} },
      invoke: (...args) => { calls.push(args); return Promise.resolve() },
      window: { addEventListener: (event, callback) => handlers.set(event, callback) },
      document: {
        documentElement: { dataset: { theme: 'light' }, classList: {
          add: name => classes.add(name), remove: name => classes.delete(name),
        } },
        querySelectorAll: () => [node], querySelector: () => node,
      },
    }
    runInNewContext(script, context)
    assert.equal(context.initialAndroidTheme(), native ? 'light' : 'dark')
    context.installAndroidStartup()
    context.announceAndroidFrame()
    context.announceAndroidFrame()
    assert.equal(calls.length, native ? 1 : 0, 'one local frame notification; browsers never invoke Android')
    if (!native) { assert.equal(handlers.size, 0); continue }
    assert.ok(classes.has('android-startup-pending'))
    handlers.get('ztmusic:android-reveal')({ detail: { animate: !reduced } })
    handlers.get('ztmusic:android-reveal')({ detail: { animate: !reduced } })
    assert.ok(!classes.has('android-startup-pending'))
    assert.equal(animations.length, reduced ? 0 : 2, 'single overlapping content and ambient reveal')
    if (!reduced) {
      assert.equal(animations[0].options.duration, 260)
      assert.equal(animations[0].frames[0].transform, 'translateY(12px)')
      assert.equal(animations[1].options.delay, 140)
      assert.equal(animations[1].options.duration, 500)
    }
    context.syncAndroidTheme('dark')
    assert.equal(calls.at(-1)[1].payload.action, 'appTheme')
  }
}

// WebView media-query defaults must not override the native starting-window theme.
for (const saved of [null, 'light']) {
  const root = { dataset: {}, style: {} }, body = { style: {} }, calls = []
  const context = {
    isTauriRuntime: () => true, runtimePlatform: () => 'Android',
    matchMedia: () => ({ matches: false }), localStorage: { getItem: () => saved },
    invoke: (...args) => { calls.push(args); return Promise.resolve({ theme: 'dark' }) },
    document: { documentElement: root, body, querySelector: () => ({ setAttribute() {} }) },
  }
  runInNewContext(script, context)
  await context.prepareAndroidStartup()
  assert.equal(context.initialAndroidTheme(), 'dark')
  assert.equal(root.dataset.theme, saved || 'dark')
  assert.equal(body.style.backgroundColor, saved ? '#ffffff' : '#111113')
  assert.equal(calls[0][1].payload.action, 'startupTheme')
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

const activity = await read('src-tauri/android/MainActivity.kt')
assert.ok(activity.indexOf('installSplashScreen()') < activity.indexOf('super.onCreate(savedInstanceState)'))
assert.match(activity, /postVisualStateCallback/)
assert.ok(!/overridePendingTransition|windowEnterAnimation|Thread.sleep|startActivity\(/.test(activity))
assert.match(activity, /view\.alpha = 0f/)
assert.match(activity, /scaleX\(0\.97f\)/)
assert.match(activity, /catch \(_: NullPointerException\) \{ null \}/, 'iconless platform splash must still reveal without crashing')
assert.match(activity, /320L -/)
for (const [directory, color] of [['values', '#ffffff'], ['values-night', '#111113']]) {
  const xml = await read('src-tauri/android/res/' + directory + '/zt_startup.xml')
  assert.ok(xml.includes(color))
  assert.match(xml, /windowSplashScreenAnimatedIcon">@mipmap\/ic_launcher/)
  assert.match(xml, /postSplashScreenTheme">@style\/Theme.ZTMusic/)
}
const adaptive = await read('src-tauri/android/res/mipmap-anydpi-v26/ic_launcher.xml')
assert.match(adaptive, /<adaptive-icon[\s\S]*<background[\s\S]*<foreground/)
assert.ok(!(await read('src-tauri/android/MainActivity.kt')).includes('SplashActivity'))

// Exercise the actual overlay generator against a regenerated project, including a second run.
const project = await mkdtemp(join(tmpdir(), 'zt-startup-'))
try {
  await mkdir(join(project, 'app/src/main'), { recursive: true })
  await writeFile(join(project, 'app/build.gradle.kts'), 'android { namespace = "com.zheting.music.androidtest" }\ndependencies { }\n')
  await writeFile(join(project, 'app/src/main/AndroidManifest.xml'),
    '<manifest><application><activity android:name=".MainActivity" android:exported="true"><intent-filter /></activity></application></manifest>')
  const generator = new URL('./configure-android-startup.mjs', import.meta.url)
  for (let run = 0; run < 2; run++) execFileSync(process.execPath, [generator.pathname, project])
  const gradle = await readFile(join(project, 'app/build.gradle.kts'), 'utf8')
  const manifest = await readFile(join(project, 'app/src/main/AndroidManifest.xml'), 'utf8')
  assert.equal(gradle.match(/core-splashscreen/g).length, 1)
  assert.equal(manifest.match(/Theme.ZTMusic.Starting/g).length, 1)
  assert.equal(manifest.match(/<activity /g).length, 1)
  const main = await readFile(join(project, 'app/src/main/java/com/zheting/music/androidtest/MainActivity.kt'), 'utf8')
  assert.ok(main.startsWith('package com.zheting.music.androidtest'))
  assert.ok(!main.includes('__PACKAGE__'))
  const bytes = await readFile(join(project, 'app/src/main/res/drawable/zt_portrait.png'))
  const original = await readFile(new URL('../src-tauri/icons/icon.png', import.meta.url))
  assert.ok(bytes.equals(original), 'keep the selected portrait unchanged')
} finally {
  await rm(project, { recursive: true, force: true })
}
console.log('Android startup: local first frame, theme, overlap, reduced motion and repeatable native overlay passed')
