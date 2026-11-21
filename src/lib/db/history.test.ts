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

const imported = {
  id: 42, name: '迁移测试在线歌曲', source: 'online', artists: [], album: {},
  picUrl: null, pic_url: null, duration: 90_000, dt: 90_000, playedAt: 1, playCount: 2, fileSize: 0,
}
assert.equal(await dbHistory.mergeImported([imported, imported]), 1)
assert.equal(await dbHistory.mergeImported([imported]), 0)
const merged = await dbHistory.list()
assert.equal(merged.length, 2)
assert.equal(merged[0]?.id, 'local:demo', 'the existing local file record is preserved')
assert.equal(merged[1]?.playedAt, 1, 'the original timestamp survives migration')

console.log('db history local source self-check: 11 assertions passed')
