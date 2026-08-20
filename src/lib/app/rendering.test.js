/**
 * Desktop route rendering regression check.
 * Run: node src/lib/app/rendering.test.js
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../../App.svelte', import.meta.url), 'utf8')
const mobileApp = await readFile(new URL('../components/MobileApp.svelte', import.meta.url), 'utf8')
const loginOverlay = await readFile(new URL('../components/LoginOverlay.svelte', import.meta.url), 'utf8')
const authStore = await readFile(new URL('../stores/auth.svelte.js', import.meta.url), 'utf8')
const lazyRoutes = [
  'PlaylistPage', 'SearchPage', 'ArtistPage', 'ExplorePage', 'DailyHistoryPage',
  'LibraryPage', 'RecentPage', 'MessagesPage', 'LikedPage', 'SettingsPage', 'AboutPage',
  'LocalMusicPage',
]

assert.ok(app.includes("{#if router.activeView === 'home'}"), 'desktop routes should use conditional rendering')
assert.ok(!app.includes('<div style:display={router.activeView'), 'inactive desktop pages must not remain mounted')
assert.ok(!app.includes('{#key router.activeView}'), 'desktop route changes should not add a second forced remount boundary')
assert.ok(app.includes("const loadMobileApp = lazyModule(() => import("), 'mobile application should not be in the desktop startup bundle')
assert.ok(app.includes('return () => module ?? (promise ??= loader().then'), 'loaded route modules should render synchronously on repeat visits')
assert.ok(mobileApp.includes("mountedTabs.includes('explore')"), 'mobile tab pages should mount on first visit')
assert.ok(mobileApp.includes("{:else if activeView === 'messages'}"), 'mobile secondary pages should mount only while active')
assert.ok(mobileApp.includes('tabScrollPositions'), 'mobile tabs should preserve independent scroll positions')
assert.match(loginOverlay, /import\s*\{[^}]*\btick\b[^}]*\}\s*from\s*['"]svelte['"]/, 'login mode focus should import tick')
assert.ok(authStore.includes("finish(rejectPromise, new DOMException('Aborted', 'AbortError'))"), 'canceling QR polling should settle its promise')
assert.ok(!loginOverlay.includes("if (m === 'qr') startQr()"), 'QR mode changes should rely on one reactive start')
assert.ok(mobileApp.includes("onclick={() => handleNav('explore')}"), 'mobile tab navigation should capture scroll before route changes')

for (const component of lazyRoutes) {
  assert.ok(app.includes(`const load${component} = lazyModule(() => import(`), `${component} should be loaded on demand`)
}

console.log(`application rendering self-check: ${lazyRoutes.length + 12} assertions passed`)
