import assert from 'node:assert/strict'
import { MusicProviderRegistry, defineMusicProvider } from './provider.js'

assert.throws(() => defineMusicProvider({ id: 'Bad ID', name: 'bad', search() {} }), /stable lowercase id/)
assert.throws(() => defineMusicProvider({ id: 'empty', name: 'Empty' }), /must implement search/)

const registry = new MusicProviderRegistry()
registry.register({ id: 'first', name: 'First', search: async (query) => ({ query }) })
registry.register({ id: 'second', name: 'Second', search: async (query) => ({ query: query.toUpperCase() }), getTopSongs: async () => [] })

assert.equal(registry.getActive().id, 'first')
assert.deepEqual(registry.getActive().capabilities, ['search'])
assert.deepEqual(await registry.call('search', 'test'), { query: 'test' })
assert.throws(() => registry.call('getTopSongs'), /does not support getTopSongs/)
registry.setActive('second')
assert.deepEqual(await registry.call('search', 'test'), { query: 'TEST' })
assert.deepEqual(registry.list().map((provider) => provider.id), ['first', 'second'])
assert.throws(() => registry.register({ id: 'second', name: 'Duplicate', search() {} }), /already registered/)
assert.throws(() => registry.setActive('missing'), /Unknown music provider/)

console.log('music provider contract: 10 assertions passed')
