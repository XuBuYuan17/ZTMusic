/**
 * 边缘返回手势自检：只复用现有方向锁，拒绝条件都写成断言。
 * 跑法：node --experimental-strip-types src/lib/app/edge-back.test.ts
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EDGE_BACK_WIDTH, edgeBackStartAllowed } from './mobile-interaction.ts'
import { createMobileSwipe } from './mobile-interaction.ts'

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8')
const ok = { enabled: true, mobile: true, android: false, clientX: 8, isPrimary: true, button: 0, blocked: false }

// ── 1) 起点与平台 ──
assert.equal(edgeBackStartAllowed(ok), true, 'a primary press at the left edge starts the gesture')
assert.equal(edgeBackStartAllowed({ ...ok, clientX: EDGE_BACK_WIDTH + 40 }), false, 'starts only from the left edge')
assert.equal(edgeBackStartAllowed({ ...ok, enabled: false }), false, 'disabled when the page cannot go back')
assert.equal(edgeBackStartAllowed({ ...ok, mobile: false }), false, 'desktop layout has no edge gesture')
assert.equal(edgeBackStartAllowed({ ...ok, android: true }), false, 'android keeps its own system edge gesture')
assert.equal(edgeBackStartAllowed({ ...ok, isPrimary: false }), false, 'extra fingers never start a back gesture')
assert.equal(edgeBackStartAllowed({ ...ok, button: 2 }), false, 'right click never starts it')
assert.equal(edgeBackStartAllowed({ ...ok, blocked: true }), false, 'conflicting controls block it')

// ── 2) 方向锁与阈值复用 createMobileSwipe ──
const swipe = createMobileSwipe(true)
swipe.start(10, 300)
assert.equal(swipe.move(14, 301).direction, null, 'tiny movement stays undecided')
swipe.move(40, 302)
swipe.move(55, 303)
assert.equal(swipe.end(), null, 'a short swipe does not commit')

const vertical = createMobileSwipe(true)
vertical.start(10, 300)
vertical.move(12, 340)
assert.equal(vertical.move(14, 360).direction, 'vertical', 'vertical movement is locked out')
assert.equal(vertical.end(), null, 'vertical scroll never commits a back')

const long = createMobileSwipe(true)
long.start(10, 300)
long.move(60, 302)
long.move(120, 304)
assert.equal(long.end(), 'previous', 'a long horizontal swipe to the right commits once')

const backward = createMobileSwipe(true)
backward.start(10, 300)
backward.move(-40, 302)
backward.move(-120, 304)
assert.equal(backward.end(), 'next', 'a leftward swipe is not a back gesture')

const cancelled = createMobileSwipe(true)
cancelled.start(10, 300)
cancelled.move(120, 302)
cancelled.cancel()
assert.equal(cancelled.end(), null, 'a cancelled pointer never commits')

// ── 3) 实现细节：只提交一次、释放后不误点击、捕获丢失与尺寸变化要取消 ──
const source = await read('./mobile-interaction.ts')
const action = source.slice(source.indexOf('export function mobileEdgeBack'))
assert.ok(action.includes('committed'), 'commits are guarded by a flag')
assert.ok(action.includes("if (result === 'previous' && !committed)"), 'exactly one back per gesture')
assert.ok(action.includes('event.stopImmediatePropagation()'), 'the post-swipe click is swallowed')
assert.ok(action.includes("node.addEventListener('lostpointercapture', finish)"), 'lost capture finishes (and cancels) the gesture')
assert.ok(action.includes("window.addEventListener('resize', cancel)"), 'resize cancels the gesture')
assert.ok(action.includes("window.addEventListener('orientationchange', cancel)"), 'orientation change cancels it')
assert.ok(action.includes('if (pointer !== null) { cancel(); return }'), 'a second finger cancels instead of starting over')
assert.ok(source.includes('export function edgeBackBlockedTarget'), 'conflict zones are a single predicate')
for (const zone of ['input', 'textarea', '[role="slider"]', '[role="dialog"]', '.mobile-cover-rail', '.music-card-rail']) {
  assert.ok(source.includes(zone), `conflict zone ${zone} is covered`)
}

// ── 4) 只在能返回的页面启用 ──
const mobile = await read('../components/MobileApp.svelte')
assert.ok(mobile.includes('use:mobileEdgeBack='), 'mounted once on the mobile shell')
assert.ok(mobile.includes('const canEdgeBack = $derived(!primaryViews.includes(activeView) || router.routeStack.length > 0)'), 'primary views do not enable it')
assert.ok(mobile.includes('onBack: () => { requestBack() }'), 'it reuses the unified back entry')

console.log('edge back: start guards, reused direction lock and single commit passed')
