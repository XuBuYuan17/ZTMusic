import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../src/lib/components/ui/PlayerHud.svelte', import.meta.url), 'utf8')
const script = stripTypeScriptTypes(source.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*\r?\n/gm, ''))
const player = { volume: 0.8, mode: 'list', hudRequest: null }
let update, hide, destroy
const context = {
  player, $state: value => value, $effect: callback => { update = callback },
  onDestroy: callback => { destroy = callback },
  setTimeout: callback => { hide = callback; return 1 }, clearTimeout() {},
}
runInNewContext(script + ';globalThis.hud = () => ({ visible, text, iconName });', context)
update()
assert.equal(context.hud().visible, false)
// This is the actual delayed 100% hydration that previously escaped the 1800ms gate.
player.volume = 1; player.mode = 'shuffle'; update()
assert.equal(context.hud().visible, false, 'native volume and mode hydration are passive at any time')
player.hudRequest = { kind: 'volume', volume: 0.4 }; update()
assert.equal(context.hud().visible, true); assert.equal(context.hud().text, '40%')
hide(); assert.equal(context.hud().visible, false)
player.hudRequest = { kind: 'mode', mode: 'repeat' }; update()
assert.equal(context.hud().text, '单曲循环')
destroy()

const store = await readFile(new URL('../src/lib/stores/player.svelte.ts', import.meta.url), 'utf8')
const setters = store.slice(store.indexOf('  setVolume('), store.indexOf('  /**', store.indexOf('  setMode(')))
const setterContext = {
  STORAGE_KEYS: { VOLUME: 'volume', MODE: 'mode', PLAYER_SHUFFLE: 'shuffle' },
  setSetting: (_, value) => String(value), engine: { setVolume() {}, setMode() {} },
  setStorage() {}, createShuffleState() { return { order: [], position: -1 } },
}
runInNewContext(stripTypeScriptTypes('class Controls { volume = .8; mode = "list"; shuffleState = {order:[],position:-1}; hudRequest = null;\n' + setters + '\n}\nglobalThis.controls = new Controls()'), setterContext)
setterContext.controls.setVolume(.3)
assert.equal(setterContext.controls.hudRequest.kind, 'volume')
setterContext.controls.setMode('shuffle')
assert.equal(setterContext.controls.hudRequest.kind, 'mode')
console.log('Player HUD: delayed native hydration stays silent; explicit volume/mode controls still show feedback')
