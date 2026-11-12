import assert from 'node:assert/strict'
import { buildDockItems, DEFAULT_MOBILE_DOCK, hiddenDockTabs, normalizeMobileDock, toggleDockTab } from './mobile-dock.ts'

assert.deepEqual(normalizeMobileDock(null), DEFAULT_MOBILE_DOCK)
assert.deepEqual(normalizeMobileDock({ layout: 'bad', labels: 'false', tabs: ['bogus', 'search', 'search'], icons: { search: 'bogus', library: 'grid' } }), { layout: 'classic', labels: true, tabs: ['search', 'settings'], icons: { library: 'grid' } })
assert.deepEqual(normalizeMobileDock({ tabs: [] }).tabs, ['explore', 'settings'])
assert.deepEqual(normalizeMobileDock({ tabs: ['recent', 'localMusic', 'search', 'library', 'settings'] }).tabs, ['recent', 'localMusic', 'search', 'settings'])
assert.equal(toggleDockTab(DEFAULT_MOBILE_DOCK, 'recent'), null, 'four visible navigation entries is the limit')
assert.equal(toggleDockTab(DEFAULT_MOBILE_DOCK, 'settings'), null, 'settings must stay reachable')
const smaller = toggleDockTab(DEFAULT_MOBILE_DOCK, 'search')!
assert.deepEqual(smaller.tabs, ['explore', 'library', 'settings'])
assert.deepEqual(toggleDockTab(smaller, 'recent')!.tabs, ['explore', 'library', 'recent', 'settings'])
assert.equal(toggleDockTab(normalizeMobileDock({ tabs: ['explore'] }), 'explore'), null, 'at least one other entry remains')
assert.deepEqual(buildDockItems(DEFAULT_MOBILE_DOCK).map(item => item.id), ['explore', 'search', 'library', 'settings'])
assert.deepEqual(hiddenDockTabs(smaller).map(tab => tab.id), ['search'])
assert.deepEqual(buildDockItems(smaller).map(item => item.id), ['explore', 'library', 'more', 'settings'], 'hidden primary pages remain reachable through more')
assert.equal(buildDockItems(normalizeMobileDock({ tabs: ['library'], icons: { library: 'grid' } }))[0]?.icon, 'grid')
console.log('Mobile dock: normalization, icon choices, count limits and settings access passed')
