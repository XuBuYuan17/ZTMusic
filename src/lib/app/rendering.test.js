/**
 * Desktop route rendering regression check.
 * Run: node src/lib/app/rendering.test.js
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../../App.svelte', import.meta.url), 'utf8')
const lazyRoutes = [
  'PlaylistPage', 'SearchPage', 'ArtistPage', 'ExplorePage', 'DailyHistoryPage',
  'LibraryPage', 'RecentPage', 'MessagesPage', 'LikedPage', 'SettingsPage', 'AboutPage',
]

assert.ok(app.includes("{#if router.activeView === 'home'}"), 'desktop routes should use conditional rendering')
assert.ok(!app.includes('<div style:display={router.activeView'), 'inactive desktop pages must not remain mounted')
assert.ok(app.includes("const loadMobileApp = () => import("), 'mobile application should not be in the desktop startup bundle')

for (const component of lazyRoutes) {
  assert.ok(app.includes(`const load${component} = () => import(`), `${component} should be loaded on demand`)
}

console.log(`desktop rendering self-check: ${lazyRoutes.length + 3} assertions passed`)
