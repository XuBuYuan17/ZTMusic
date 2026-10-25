/**
 * 移动端完整个人主页入口自检。
 * 跑法：node --experimental-strip-types src/lib/components/mobile-home-entry.test.ts
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const mobile = await readFile(new URL('./MobileApp.svelte', import.meta.url), 'utf8')
const library = await readFile(new URL('../pages/pc/Library.svelte', import.meta.url), 'utf8')
const home = await readFile(new URL('../pages/pc/Home.svelte', import.meta.url), 'utf8')
const router = await readFile(new URL('../stores/router.svelte.ts', import.meta.url), 'utf8')

// ── 1) 不再把 home 无条件重定向为资料库 ──
assert.ok(!router.includes("isMobileDevice() && view === 'home'"), 'router must not rewrite home to library on mobile')
assert.ok(!mobile.includes("activeView === 'home' || activeView === 'profile') onNavigate?.('library')"), 'mobile shell must not bounce home back to library')
assert.ok(!mobile.includes("if (view === 'home' || view === 'profile') view = 'library'"), 'mobile nav must not rewrite home')

// ── 2) 移动端真的能渲染完整主页 ──
assert.ok(mobile.includes("import HomePage from '../pages/pc/Home.svelte'"), 'mobile shell loads the shared page')
assert.ok(mobile.includes("page.view === 'home'"), 'a home branch exists in the detail stack')
assert.ok(mobile.includes("home: '我的主页'"), 'home has its own title')

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

// ── 4) 资料库只组合自己需要的模块，并给出进入主页的入口 ──
assert.ok(!library.includes("import HomePage"), 'library must not embed the whole home page')
assert.ok(!library.includes('<HomePage'), 'library must not render the whole home page')
assert.ok(library.includes('class="library-home-link"'), 'library offers an explicit entry')
assert.ok(library.includes("onNavigate?.('home')"), 'the entry navigates to the home view')
assert.ok(library.includes('RecentTracksModule') && library.includes('SocialPreviewSection'), 'library keeps the modules it actually needs')

// ── 5) 入口没有新增第五个底部标签 ──
const tabs = mobile.match(/mobile-tab-bar[\s\S]*?\{#each \[([\s\S]*?)\] as tab\}/)
assert.ok(tabs, 'tab bar found')
const tabViews = [...(tabs?.[1] ?? '').matchAll(/view: '([a-z-]+)'/g)].map(match => match[1])
assert.deepEqual(tabViews, ['explore', 'search', 'library', 'settings'], 'still four tabs, no home tab')

console.log('mobile home entry: no redirect, composed page, explicit entry passed')
