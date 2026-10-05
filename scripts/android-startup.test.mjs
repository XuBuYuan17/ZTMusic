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
    handlers.get('ztmusic:android-reveal')()
    handlers.get('ztmusic:android-reveal')()
    assert.ok(!classes.has('android-startup-pending'))
    assert.equal(animations.length, reduced ? 0 : 2, 'single overlapping content and ambient reveal')
    if (!reduced) {
      assert.equal(animations[0].options.duration, 280)
      assert.equal(animations[0].frames[0].transform, 'translateY(12px)')
      assert.equal(animations[1].options.delay, 140)
      assert.equal(animations[1].options.duration, 500)
    }
    context.syncAndroidTheme('dark')
    assert.equal(calls.at(-1)[1].payload.action, 'appTheme')
  }
}

const activity = await read('src-tauri/android/MainActivity.kt')
assert.ok(activity.indexOf('installSplashScreen()') < activity.indexOf('super.onCreate(savedInstanceState)'))
assert.match(activity, /postVisualStateCallback/)
assert.ok(!/overridePendingTransition|windowEnterAnimation|Thread.sleep|postDelayed|startActivity\(/.test(activity))
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
