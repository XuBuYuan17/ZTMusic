// Mobile shares core page components and playback state, with dedicated touch-first surfaces where needed.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8')
const [app, sidebar, mobileApp, miniPlayer, queuePanel, responsiveCss, loadingCss, dockConfig, mobileCss] = await Promise.all([
  read('../../App.svelte'),
  read('./Sidebar.svelte'),
  read('./MobileApp.svelte'),
  read('./MobileMiniPlayer.svelte'),
  read('./QueuePanel.svelte'),
  read('../../styles/mobile/responsive.css'),
  read('../../styles/loading.css'),
  read('../settings/mobile-dock.ts'),
  read('../../app-mobile.css'),
])

for (const page of ['Explore', 'Library']) {
  assert.ok(mobileApp.includes(`../pages/pc/${page}.svelte`), `mobile must render the PC ${page} page`)
}
assert.ok(mobileApp.includes('../pages/Settings.svelte'), 'mobile settings must use the shared categorized settings page')
assert.ok(!mobileApp.includes('../pages/pc/Settings.svelte'), 'mobile shell must not fall back to the desktop settings hierarchy')

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
for (const view of ['explore', 'search', 'library', 'settings']) assert.ok(dockConfig.includes(`id: '${view}'`), `bottom tab bar is missing the ${view} entry`)
assert.ok(sidebar.includes("nav('search')") && sidebar.includes("nav('explore')") && sidebar.includes("nav('library')"), 'primary destinations remain reachable through navigation menu')
assert.ok(mobileApp.includes("classList.toggle('mobile-chrome-hidden', chromeHidden && chromeCanHide)") && mobileApp.includes('use:swipeChrome'), 'floating player and navigation share the same hide state')
assert.match(mobileCss, /:is\(\.player-bar-wrap\.floating-dock, \.mobile-tab-bar\.floating\)\s*\{[^}]*left:[^}]*right:/, 'both capsules use the same horizontal safe-area insets')
assert.match(mobileCss, /:is\(\.player-bar-wrap\.floating-dock, \.mobile-tab-bar\.floating\)\s*\{[^}]*max-width:\s*var\(--mobile-floating-max-width\);[^}]*margin-inline:\s*auto/, 'the floating bars share a centered width cap')
assert.match(mobileCss, /@media \(orientation: landscape\) and \(max-height: 720px\)[\s\S]*?\.mobile-tab-bar:not\(\.floating\)\s*\{[^}]*inset:/, 'the landscape navigation rail applies to classic mode')
assert.ok(mobileCss.includes('transition: translate var(--mobile-floating-motion)') && mobileCss.includes('transition: transform var(--mobile-floating-motion)'), 'the two rows move on the same timing curve')
assert.ok(mobileApp.includes('onOpenPlaylist={(id, push, preview)'), 'playlist callbacks must preserve push and preview arguments')
assert.ok(!app.includes('aria-label="正在加载移动端界面"'), 'mobile shell must not render the ZT loading placeholder')
assert.ok(!loadingCss.includes("content: 'ZT'"), 'shared loading styles must not recreate the removed ZT animation')
console.log('mobile shell coverage: shared core pages, dedicated settings, Sidebar and PlayerBar passed')
