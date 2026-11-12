/**
 * 统一资料库入口自检。
 * 跑法：node --experimental-strip-types src/lib/components/mobile-home-entry.test.ts
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildDockItems, DEFAULT_MOBILE_DOCK } from '../settings/mobile-dock.ts'

const mobile = await readFile(new URL('./MobileApp.svelte', import.meta.url), 'utf8')
const library = await readFile(new URL('../pages/pc/Library.svelte', import.meta.url), 'utf8')
const home = await readFile(new URL('../pages/pc/Home.svelte', import.meta.url), 'utf8')
const router = await readFile(new URL('../stores/router.svelte.ts', import.meta.url), 'utf8')

// ── 1) 旧入口归入资料库，两端使用同一路由 ──
assert.ok(router.includes("if (view === 'home' || view === 'profile') view = 'library'"), 'legacy aliases open the library')
assert.ok(mobile.includes("if (view === 'home' || view === 'profile') view = 'library'"), 'mobile avoids creating a redundant detail route')
assert.ok(!mobile.includes("page.view === 'home'"), 'mobile no longer mounts a separate home page')

// ── 3) 主页是模块组合，不再有 profileOnly 裁切 ──
assert.ok(!home.includes('profileOnly'), 'no profileOnly mode left')
for (const module of [
  'UserProfileHero',
  'ProfileQuickEntries',
  'RecentTracksModule',
  'WeeklyListenModule',
  'PlaylistSection',
  'SocialPreviewSection',
]) {
  assert.ok(home.includes(module), `home composes ${module}`)
}

// ── 4) 资料库组合已有内容，不再跳转到独立主页 ──
assert.ok(!library.includes("import HomePage"), 'library must not embed the whole home page')
assert.ok(!library.includes('<HomePage'), 'library must not render the whole home page')
assert.ok(!library.includes('class="library-home-link"'), 'library does not link to an obsolete home view')
assert.ok(library.includes('RecentTracksModule'), 'library keeps the recent listening module')
assert.ok(!library.includes('WeeklyListenModule'), '本周常听只留在主页，资料库不再重复一份')
assert.ok(!library.includes('SocialPreviewSection'), 'social previews live on the profile page')

// 默认仍然只有四个主入口；其他入口由用户在设置中选择。
assert.ok(mobile.includes('buildDockItems(mobileDock.config)'), 'the tab bar uses the saved configuration')
assert.deepEqual(buildDockItems(DEFAULT_MOBILE_DOCK).map(item => item.id), ['explore', 'search', 'library', 'settings'], 'default navigation retains four tabs without a separate home tab')

console.log('mobile home entry: legacy aliases and unified library passed')
