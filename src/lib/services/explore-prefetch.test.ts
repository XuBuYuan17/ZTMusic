import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('./explore.ts', import.meta.url), 'utf8')
const cacheSource = source.slice(source.indexOf('let exploreCache'), source.indexOf('\ntype Loose'))
let now = 0
let calls = 0
const pending: Array<(data: { allFailed: boolean; name: string }) => void> = []
const context = {
  Date: { now: () => now },
  loadExploreData: () => { calls++; return new Promise(resolve => pending.push(resolve)) },
}
runInNewContext(stripTypeScriptTypes(cacheSource.replace(/^export /gm, '')), context)
const load = (context as unknown as { loadCachedExploreData: (api: object, owner: unknown, refresh?: boolean) => Promise<{ allFailed: boolean; name: string }> }).loadCachedExploreData
const api = {}, ownerA = {}, ownerB = {}
const a = load(api, ownerA)
assert.equal(load(api, ownerA), a, 'startup and page share the same pending request')
pending.shift()!({ allFailed: false, name: 'A' })
await a
assert.equal((await load(api, ownerA)).name, 'A'); assert.equal(calls, 1)
const refresh = load(api, ownerA, true)
assert.equal(load(api, ownerA, true), refresh, 'retry cannot duplicate a request already in flight')
const b = load(api, ownerB)
pending.shift()!({ allFailed: false, name: 'late A' })
await refresh
pending.shift()!({ allFailed: false, name: 'B' })
await b
assert.equal((await load(api, ownerB)).name, 'B', 'late previous-account response cannot replace the new account cache')
now += 5 * 60 * 1000
const stale = load(api, ownerB)
pending.shift()!({ allFailed: true, name: 'failed' })
await stale
const retry = load(api, ownerB)
pending.shift()!({ allFailed: false, name: 'retried' })
assert.equal((await retry).name, 'retried', 'complete failure is not retained as a fresh cache hit')
assert.equal(calls, 5)
console.log('Explore prefetch: shared startup/page requests, account isolation, refresh, expiry and failed-cache retry passed')
