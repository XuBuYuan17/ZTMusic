import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
}

const { adaptSQLocal, ensureDB, getDBBackend, supportsPersistentSQLiteRuntime } = await import('./init.js')

assert.equal(supportsPersistentSQLiteRuntime({ crossOriginIsolated: true }), true)
assert.equal(supportsPersistentSQLiteRuntime({ crossOriginIsolated: false }), false)

const calls = []
const adapted = adaptSQLocal({
  sql: async (...args) => { calls.push(args); return [] },
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
