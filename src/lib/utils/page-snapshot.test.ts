import assert from 'node:assert/strict'
import { readPageSnapshot, savePageSnapshot } from './storage.ts'

const entries = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  },
})

const scope = JSON.stringify(['https://api.test', 'account-a'])
const key = 'startup-library-v1'
savePageSnapshot(key, scope, { playlists: [42] })
assert.deepEqual(readPageSnapshot(key, scope), { playlists: [42] })
assert.equal(readPageSnapshot(key, JSON.stringify(['https://api.test', 'account-b'])), null)
assert.equal(readPageSnapshot(key, JSON.stringify(['https://other.test', 'account-a'])), null)
entries.set(key, JSON.stringify({ scope, savedAt: Date.now() - 86_400_000, data: { playlists: [42] } }))
assert.equal(readPageSnapshot(key, scope), null)
entries.set(key, '{')
assert.equal(readPageSnapshot(key, scope), null)
console.log('Page snapshots: persisted data, account and backend isolation, expiry and corrupt storage passed')
