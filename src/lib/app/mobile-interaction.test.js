import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GLOBAL_CSS_FILES } from '../../../scripts/css-files.mjs'

const mobileCssFiles = GLOBAL_CSS_FILES.filter((file) => file === 'src/app-mobile.css' || file.startsWith('src/styles/mobile/'))
const mobileCss = (await Promise.all(
  mobileCssFiles.map((file) => readFile(new URL(`../../../${file}`, import.meta.url), 'utf8')),
)).join('\n')
const mobileApp = await readFile(new URL('../components/MobileApp.svelte', import.meta.url), 'utf8')
const playerBar = await readFile(new URL('../components/PlayerBar.svelte', import.meta.url), 'utf8')
const haptics = await readFile(new URL('../utils/haptics.js', import.meta.url), 'utf8')

assert.ok(mobileCss.includes('Native mobile interaction layer'), 'mobile CSS should expose one native interaction layer')
assert.ok(mobileCss.includes('-webkit-tap-highlight-color: transparent'), 'touch controls should suppress browser tap highlighting')
assert.ok(mobileCss.includes('@media (hover: none), (pointer: coarse)'), 'touch controls should neutralize sticky hover feedback')
assert.ok(mobileCss.includes('.m-home-skeleton'), 'mobile home should show a skeleton instead of a spinner-only loading state')
assert.ok(mobileCss.includes('):active::before'), 'mobile tappables should expose native-like pressed overlays')
assert.ok(mobileCss.includes('height: calc(var(--mobile-tabs-h) + env(safe-area-inset-bottom))'), 'tab bar should include the bottom safe area')
assert.ok(mobileCss.includes('.player-bar.pressing'), 'mini player should expose a pressed state')
assert.ok(mobileApp.includes('handleHapticPointerDown'), 'mobile shell should delegate touch haptics')
assert.ok(playerBar.includes("import { hapticTap } from '../utils/haptics.js'"), 'mini player should trigger touch haptics outside the mobile shell')
assert.ok(haptics.includes('now - lastPulseAt < 45'), 'haptics should be throttled to avoid noisy repeated pulses')
assert.ok(haptics.includes('aria-disabled'), 'haptics should ignore disabled interactive elements')
assert.ok(!playerBar.includes('}, 150)'), 'opening the lyrics view should not wait for a post-tap delay')
assert.equal((mobileApp.match(/aria-current=/g) || []).length, 4, 'every primary mobile tab should expose its active page')
assert.ok(!mobileApp.includes('{#if !isDetailView}'), 'mobile bottom tabs should stay mounted on detail pages')
assert.ok(!mobileApp.includes('setTabsHidden(true)'), 'mobile bottom tabs should not disappear while scrolling')

console.log('mobile interaction self-check: 15 assertions passed')
