import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const api = await readFile(new URL('../api/client.ts', import.meta.url), 'utf8')
const router = await readFile(new URL('../stores/router.svelte.ts', import.meta.url), 'utf8')
const desktopHost = await readFile(new URL('../components/layout/DesktopPageHost.svelte', import.meta.url), 'utf8')
const mobileApp = await readFile(new URL('../components/MobileApp.svelte', import.meta.url), 'utf8')

assert.match(api, /userFollow\(id:[\s\S]*request\('\/follow',[\s\S]*cache: false/, 'follow mutation must use the uncached /follow endpoint')
assert.match(router, /function goUser\(/, 'router must expose user profile navigation')
assert.match(router, /prev\.view === 'user'/, 'user profile must participate in the back stack')
assert.match(desktopHost, /router\.activeView === 'user'/, 'desktop host must render the user profile route')
assert.match(mobileApp, /class:secondary=\{!isPrimaryView\}/, 'all non-primary routes must use the secondary mobile shell')
assert.match(mobileApp, /page\.view === 'user'/, 'mobile cache must render the user profile route')
assert.match(mobileApp, /const primaryViews = \['home', 'explore', 'library'\]/, 'user profile must not be a primary mobile page')

console.log('user profile boundary: 7 assertions passed')
