import assert from 'node:assert/strict'

const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)) },
  removeItem: (key: string) => { store.delete(key) },
} as unknown as Storage

const { adaptSQLocal, ensureDB, getDBBackend, supportsPersistentSQLiteRuntime } = await import('./init.ts')

assert.equal(supportsPersistentSQLiteRuntime({ crossOriginIsolated: true }), true)
assert.equal(supportsPersistentSQLiteRuntime({ crossOriginIsolated: false }), false)

const calls: unknown[][] = []
const adapted = adaptSQLocal({
  sql: async (...args: unknown[]) => { calls.push(args); return [] },
})
await adapted.sql('SELECT ?, ?', [1, 2])
await adapted.sql('SELECT 1')
assert.deepEqual(calls[0], ['SELECT ?, ?', 1, 2])
assert.deepEqual(calls[1], ['SELECT 1'])

const [first, second] = await Promise.all([ensureDB(), ensureDB()])

assert.equal(first, false)
assert.equal(second, false)
assert.equal(getDBBackend(), 'fallback')
assert.equal(store.get('db_fallback_reason'), 'non_browser_runtime')

console.log('db backend selection: 8 assertions passed')
