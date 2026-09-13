import assert from 'node:assert/strict'

const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)) },
  removeItem: (key: string) => { store.delete(key) },
} as unknown as Storage

const { dbHistory } = await import('./history.ts')

await dbHistory.clear()
await dbHistory.add({
  id: 'local:demo',
  name: '本地测试歌曲',
  artists: [{ name: '本地歌手' }],
  album: { name: '本地专辑', picUrl: 'cover.jpg' },
  duration: 180_000,
  source: 'local',
  localId: 'local:demo',
  fileName: 'demo.mp3',
  fileSize: 1024,
})

const [entry] = await dbHistory.list()

assert.ok(entry)
assert.equal(entry.id, 'local:demo')
assert.equal(entry.source, 'local')
assert.equal(entry.localId, 'local:demo')
assert.equal(entry.fileName, 'demo.mp3')
assert.equal(entry.playCount, 1)

console.log('db history local source self-check: 6 assertions passed')
