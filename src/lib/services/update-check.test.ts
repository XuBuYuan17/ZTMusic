import assert from 'node:assert/strict'
import { checkForUpdates, compareVersions } from './update-check.ts'

assert.equal(compareVersions('0.9.10', 'v0.10.0'), -1)
assert.equal(compareVersions('1.0.0', 'v1.0.0'), 0)
assert.equal(compareVersions('1.2.0', 'v1.1.9'), 1)
assert.equal(compareVersions('1.0.0', 'v1.1.0-beta'), null)

function response(status: number, body: unknown = {}): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status })
}

assert.deepEqual(await checkForUpdates('0.14.0', response(404)), { status: 'none' })
assert.deepEqual(await checkForUpdates('0.14.0', response(200, { tag_name: 'v0.15.0' })), { status: 'newer', version: 'v0.15.0' })
assert.deepEqual(await checkForUpdates('0.14.0', response(200, { tag_name: 'v0.14.0' })), { status: 'same', version: 'v0.14.0' })
assert.deepEqual(await checkForUpdates('0.14.0', response(200, { tag_name: 'v0.13.0' })), { status: 'ahead', version: 'v0.13.0' })
assert.deepEqual(await checkForUpdates('0.14.0', response(200, { tag_name: 'preview' })), { status: 'unknown', version: 'preview' })
await assert.rejects(checkForUpdates('0.14.0', response(403)))
await assert.rejects(checkForUpdates('0.14.0', response(200, {})))
console.log('Update check: version ordering, no release, malformed response and network errors passed')
