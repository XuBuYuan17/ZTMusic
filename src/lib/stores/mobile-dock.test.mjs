import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { DEFAULT_MOBILE_DOCK, normalizeMobileDock, toggleDockTab } from '../settings/mobile-dock.ts'

const source = (await readFile(new URL('./mobile-dock.svelte.ts', import.meta.url), 'utf8')).replace(/^import .*\n/m, '').replace('export const mobileDock', 'const mobileDock')
const js = stripTypeScriptTypes(source) + '\nglobalThis.result = mobileDock'
const data = new Map()
let failWrites = false
const storage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => { if (failWrites) throw new Error('storage blocked'); data.set(key, String(value)) },
}
function create() {
  const context = { localStorage: storage, $state: value => value, DEFAULT_MOBILE_DOCK, normalizeMobileDock, toggleDockTab }
  runInNewContext(js, context)
  return context.result
}

const dock = create()
dock.setLayout('floating')
dock.toggleTab('search')
dock.setIcon('library', 'grid')
dock.setLabels(false)
assert.equal(dock.config.layout, 'floating')
assert.deepEqual([...dock.config.tabs], ['explore', 'library', 'settings'])
assert.equal(dock.config.icons.library, 'grid')
assert.equal(dock.config.labels, false)
const reloaded = create()
assert.equal(JSON.stringify(reloaded.config), JSON.stringify(dock.config), 'saved choices survive reloading')
failWrites = true
reloaded.setLayout('classic')
assert.equal(reloaded.config.layout, 'floating', 'a failed write does not pretend it was saved')
assert.ok(reloaded.error)
failWrites = false
reloaded.reset()
assert.equal(reloaded.error, '')
assert.equal(reloaded.config.layout, 'classic')
console.log('Mobile dock storage: persistence, restore and write failure passed')
