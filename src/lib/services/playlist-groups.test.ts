import assert from 'node:assert/strict'
import { createPlaylistGroup, deletePlaylistGroup, readPlaylistGroups, renamePlaylistGroup, setPlaylistGroupMembership } from './playlist-groups.ts'

const values = new Map<string, string>()
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, String(value)) },
  removeItem: key => { values.delete(key) },
  clear: () => values.clear(),
  key: index => [...values.keys()][index] ?? null,
  get length() { return values.size },
}

createPlaylistGroup(1, ' 夜听 ')
createPlaylistGroup(1, '收藏')
assert.deepEqual(readPlaylistGroups(2), [], 'accounts are isolated')
const [night, saved] = readPlaylistGroups(1)
assert.equal(night?.name, '夜听')
assert.throws(() => createPlaylistGroup(1, '夜听'), /已存在/)
setPlaylistGroupMembership(1, 42, [night!.id, saved!.id])
assert.deepEqual(readPlaylistGroups(1).map(group => group.playlistIds), [['42'], ['42']])
setPlaylistGroupMembership(1, 42, [saved!.id])
assert.deepEqual(readPlaylistGroups(1).map(group => group.playlistIds), [[], ['42']])
renamePlaylistGroup(1, saved!.id, '常听')
assert.equal(readPlaylistGroups(1)[1]?.name, '常听')
assert.throws(() => setPlaylistGroupMembership(1, 42, ['missing']), /已变化/)
deletePlaylistGroup(1, night!.id)
assert.deepEqual(readPlaylistGroups(1)[0]?.playlistIds, ['42'], 'deleting a group preserves other memberships')
values.set('zt-playlist-groups-v1:3', '{broken')
assert.throws(() => createPlaylistGroup(3, 'new'), /无法读取/)
assert.equal(values.get('zt-playlist-groups-v1:3'), '{broken', 'malformed data is not overwritten')
localStorage.setItem = () => { throw new Error('quota') }
assert.throws(() => createPlaylistGroup(1, 'new'), /quota/, 'storage failures reach the caller')
console.log('playlist groups: account isolation, membership, deletion and storage errors passed')
