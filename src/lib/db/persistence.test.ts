import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { LIMITS, STORAGE_KEYS } from '../utils/constants.ts'
import type { dbHistory as History } from './history.ts'

const script = async (file: string) => stripTypeScriptTypes((await readFile(new URL(file, import.meta.url), 'utf8'))
  .replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  .replace("await import('sqlocal')", '({ SQLocal: TestSQLocal })'))
const source = `${await script('./init.ts')}\n${await script('./history.ts')}`

function harness({
  native = true, isolated = false, storageType = 'opfs', infoError = false, schemaError = false,
  store = new Map<string, string>(),
} = {}) {
  const calls: string[] = []
  let created = 0, destroyed = 0, migrations = 0
  class TestSQLocal {
    constructor() { created++ }
    async getDatabaseInfo() {
      if (infoError) throw new Error('database info unavailable')
      return { storageType, persisted: false }
    }
    async destroy() { destroyed++ }
    async sql(statement: string) {
      calls.push(statement)
      if (schemaError) throw new Error('schema unavailable')
      return []
    }
  }
  const api = runInNewContext(`${source}\n;({ ensureDB, getDB, getDBBackend, dbHistory })`, {
    window: { __TAURI_INTERNALS__: native ? {} : undefined, dispatchEvent: () => true },
    crossOriginIsolated: isolated, isTauriRuntime: () => native,
    TestSQLocal, LIMITS, STORAGE_KEYS, Event,
    debugLog() {}, describeError: (error: Error) => error.message,
    normalizeImageUrl: (value: string) => value,
    getStorage: (key: string, fallback: string) => store.get(key) ?? fallback,
    getStorageJson: (key: string, fallback: unknown) => store.has(key) ? JSON.parse(store.get(key)!) : fallback,
    setStorage: (key: string, value: unknown) => store.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value)),
    removeStorage: (key: string) => { store.delete(key) },
    LEGACY_MESSAGE_READ_STATE_KEY: 'zheting-message-read-state',
    migrateLegacyData: async () => { migrations++ },
  }) as {
    ensureDB(): Promise<boolean>; getDB(): unknown; getDBBackend(): string; dbHistory: typeof History;
  }
  return { ...api, store, calls, counts: () => ({ created, destroyed, migrations }) }
}

for (const native of [false, true]) {
  const store = new Map([[STORAGE_KEYS.LOCAL_HISTORY, JSON.stringify([{ id: 101, name: 'Saved song', artists: [] }])]])
  const app = harness({ native, store })
  assert.deepEqual(await Promise.all([app.ensureDB(), app.ensureDB()]), [false, false], 'non-isolated WebViews must use persistent fallback storage')
  assert.equal(app.getDBBackend(), 'fallback')
  assert.equal(app.getDB(), null)
  assert.deepEqual(app.counts(), { created: 0, destroyed: 0, migrations: 0 }, 'do not create a temporary SQLocal database or migrate history into it')
  assert.equal(store.get('db_fallback_reason'), 'cross_origin_isolation_unavailable')
  await app.dbHistory.add({ id: 202, name: 'New song', ar: [], al: {} })
  assert.deepEqual(Array.from(await app.dbHistory.list(), entry => entry.id), [202, 101])

  const restarted = harness({ native, store })
  assert.deepEqual(Array.from(await restarted.dbHistory.list(), entry => entry.id), [202, 101], 'old and new history must survive a fresh application session')
}

for (const storageType of ['memory', 'session', 'unknown']) {
  const store = new Map([[STORAGE_KEYS.LOCAL_HISTORY, JSON.stringify([{ id: 303, name: 'Keep me' }])]])
  const app = harness({ isolated: true, storageType, store })
  assert.equal(await app.ensureDB(), false, 'successful SQL queries do not prove OPFS persistence')
  assert.equal(app.getDBBackend(), 'fallback')
  assert.equal(app.getDB(), null)
  assert.deepEqual(app.counts(), { created: 1, destroyed: 1, migrations: 0 })
  assert.deepEqual(app.calls, [], 'reject temporary storage before creating schemas or removing legacy history')
  assert.equal(JSON.parse(store.get(STORAGE_KEYS.LOCAL_HISTORY)!)[0].id, 303)
}

for (const failure of ['infoError', 'schemaError'] as const) {
  const app = harness({ isolated: true, [failure]: true })
  assert.equal(await app.ensureDB(), false)
  assert.equal(app.getDB(), null)
  assert.equal(app.counts().destroyed, 1, 'release SQLocal resources when initialization fails')
}

{
  const app = harness({ isolated: true })
  assert.deepEqual(await Promise.all([app.ensureDB(), app.ensureDB()]), [true, true])
  assert.equal(app.getDBBackend(), 'sqlite')
  assert.ok(app.getDB())
  assert.deepEqual(app.counts(), { created: 1, destroyed: 0, migrations: 1 }, 'OPFS remains usable without requesting storage permission')
}

console.log('Database persistence: WebView isolation, temporary SQLocal rejection, restart retention and persistent OPFS passed')
