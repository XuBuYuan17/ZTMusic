// Mobile shares page components and playback state, with dedicated touch controls.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8')
const [app, sidebar, mobileApp] = await Promise.all([
  read('../../App.svelte'),
  read('./Sidebar.svelte'),
  read('./MobileApp.svelte'),
])

for (const page of ['Home', 'Explore', 'Library']) {
  assert.ok(mobileApp.includes(`../pages/pc/${page}.svelte`), `mobile must render the PC ${page} page`)
}
assert.ok(mobileApp.includes('../pages/pc/Settings.svelte'), 'mobile settings must reuse the PC page')
assert.ok(!mobileApp.includes('../pages/mobile/'), 'mobile shell must not import a second set of page components')

const navTargets = [...sidebar.matchAll(/nav\('([^']+)'\)/g)].map((match) => match[1])
const handled = new Set([...mobileApp.matchAll(/(?:activeView|page\.view) === '([^']+)'/g)].map((match) => match[1]))
for (const view of navTargets) assert.ok(handled.has(view), `Sidebar destination "${view}" has no mobile render branch`)

assert.ok(app.includes('<Sidebar'), 'mobile navigation must use the shared Sidebar component')
assert.ok(app.includes('inDrawer={isMobile}'), 'shared Sidebar must switch to drawer mode on mobile')
assert.ok(app.includes('<PlayerBar'), 'desktop playback must retain PlayerBar')
assert.ok(app.includes('<MobileMiniPlayer'), 'mobile playback must use the dedicated mini player')
assert.ok(mobileApp.includes('class="mobile-tab-bar"'), 'the bottom tab bar must be present')
for (const view of ['home', 'explore', 'library']) {
  assert.ok(mobileApp.includes(`data-view="${view}"`), `bottom tab bar is missing the ${view} entry`)
}
assert.ok(!mobileApp.includes('data-view="search"'), 'search belongs to the Explore header, not the bottom tab bar')
assert.ok(mobileApp.includes('onOpenPlaylist={(id, push, preview)'), 'playlist callbacks must preserve push and preview arguments')
console.log('mobile shell coverage: shared PC pages, Sidebar and PlayerBar passed')
