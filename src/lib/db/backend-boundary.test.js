import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

for (const file of ['./cache.ts', './history.ts', './settings.ts']) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  assert.match(source, /import \{[^}]*ensureDB[^}]*\} from '\.\/init\.ts'/s, `${file} must use the shared DB initializer`)
  assert.match(source, /await ensureDB\(\)/, `${file} operations must await backend selection`)
}

const cache = await readFile(new URL('./cache.ts', import.meta.url), 'utf8')
assert.doesNotMatch(cache, /let _ensureDBPromise/, 'cache must not own a second initialization promise')

const messages = await readFile(new URL('../services/message-read-state.ts', import.meta.url), 'utf8')
assert.doesNotMatch(messages, /setStorage\(/, 'message state must not write a second storage backend')

const historyBridge = await readFile(new URL('../player/history.ts', import.meta.url), 'utf8')
assert.doesNotMatch(historyBridge, /(?:getStorage|setStorage|removeStorage)/, 'history bridge must use dbHistory only')

console.log('db backend boundary: 9 assertions passed')
