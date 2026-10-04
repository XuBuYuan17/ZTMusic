// Mobile shares page components and playback state, with dedicated touch controls.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8')
const [app, sidebar, mobileApp, miniPlayer, queuePanel, responsiveCss, loadingCss] = await Promise.all([
  read('../../App.svelte'),
  read('./Sidebar.svelte'),
  read('./MobileApp.svelte'),
  read('./MobileMiniPlayer.svelte'),
  read('./QueuePanel.svelte'),
  read('../../styles/mobile/responsive.css'),
  read('../../styles/loading.css'),
])

for (const page of ['Explore', 'Library']) {
  assert.ok(mobileApp.includes(`../pages/pc/${page}.svelte`), `mobile must render the PC ${page} page`)
}
assert.ok(mobileApp.includes('../pages/pc/Settings.svelte'), 'mobile settings must reuse the PC page')
assert.ok(!mobileApp.includes('../pages/mobile/'), 'mobile shell must not import a second set of page components')

const navTargets = [...sidebar.matchAll(/nav\('([^']+)'\)/g)].map((match) => match[1])
const handled = new Set([...mobileApp.matchAll(/(?:activeView|page\.view) === '([^']+)'/g)].map((match) => match[1]))
handled.add('home') // Legacy mobile profile routes are mapped to Library.
for (const view of navTargets) assert.ok(handled.has(view), `Sidebar destination "${view}" has no mobile render branch`)

assert.ok(app.includes('<Sidebar'), 'mobile navigation must use the shared Sidebar component')
assert.ok(app.includes('inDrawer={isMobile}'), 'shared Sidebar must switch to drawer mode on mobile')
assert.ok(app.includes('<PlayerBar'), 'desktop playback must retain PlayerBar')
assert.ok(app.includes('<MobileMiniPlayer'), 'mobile playback must use the dedicated mini player')
assert.ok(app.includes('onToggleQueue={toggleQueue}'), 'mobile mini player must open the shared queue panel')
assert.ok(miniPlayer.includes('name="queue"'), 'mobile mini player must use the local queue icon')
assert.ok(miniPlayer.includes('player.next()') && miniPlayer.includes('player.prev()'), 'mobile mini player swipe must switch in both directions')
assert.ok(queuePanel.includes('class:pending=') && queuePanel.includes('aria-busy={pendingIndex'), 'queue selection must expose a pending playback state')
assert.ok(responsiveCss.includes('.queue-item:has(.queue-item-open:focus-visible)') && responsiveCss.includes('.queue-item.pending'), 'queue focus and pending states must use row-level mobile feedback')
assert.ok(mobileApp.includes('class="mobile-tab-bar"'), 'the bottom tab bar must be present')
for (const view of ['explore', 'search', 'library', 'settings']) {
  assert.ok(mobileApp.includes(`view: '${view}'`), `bottom tab bar is missing the ${view} entry`)
}
assert.ok(!mobileApp.includes('use:scrollChrome'), 'bottom navigation must stay visible while scrolling')
assert.ok(mobileApp.includes('onOpenPlaylist={(id, push, preview)'), 'playlist callbacks must preserve push and preview arguments')
assert.ok(!app.includes('aria-label="正在加载移动端界面"'), 'mobile shell must not render the ZT loading placeholder')
assert.ok(!loadingCss.includes("content: 'ZT'"), 'shared loading styles must not recreate the removed ZT animation')
console.log('mobile shell coverage: shared PC pages, Sidebar and PlayerBar passed')
