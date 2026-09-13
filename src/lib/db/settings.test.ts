import assert from 'node:assert/strict'

const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)) },
  removeItem: (key: string) => { store.delete(key) },
} as unknown as Storage

const { dbSettings } = await import('./settings.ts')

await dbSettings.set('theme', 'dark')
assert.equal(await dbSettings.get('theme'), 'dark')
await dbSettings.setJson('message-state', { id: 42 })
assert.deepEqual(await dbSettings.getJson<{ id: number }>('message-state'), { id: 42 })
await dbSettings.remove('theme')
assert.equal(await dbSettings.get('theme', 'system'), 'system')

console.log('db settings fallback: 4 assertions passed')
