import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
}

const { dbSettings } = await import('./settings.js')

await dbSettings.set('theme', 'dark')
assert.equal(await dbSettings.get('theme'), 'dark')
await dbSettings.setJson('message-state', { id: 42 })
assert.deepEqual(await dbSettings.getJson('message-state'), { id: 42 })
await dbSettings.remove('theme')
assert.equal(await dbSettings.get('theme', 'system'), 'system')

console.log('db settings fallback: 3 assertions passed')
