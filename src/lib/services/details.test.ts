/**
 * 歌单分页合并逻辑自检
 * reconstructPlaylistTracks 是纯函数，不打网络，直接喂假数据验证：
 * trackIds 顺序保持、playlistIndex 正确、addTime 回退、已展示行只增不减。
 * Run: node src/lib/services/details.test.ts
 */

import assert from 'node:assert/strict'

// 先挂浏览器全局（client/session 模块加载时可能读 localStorage），再动态导入
const store = new Map<string, string>()
const session = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
} as unknown as Storage
globalThis.sessionStorage = {
  getItem: (k: string) => session.get(k) ?? null,
  setItem: (k: string, v: string) => { session.set(k, String(v)) },
  removeItem: (k: string) => { session.delete(k) },
} as unknown as Storage

const { reconstructPlaylistTracks } = await import('./details.ts')

let passed = 0
function check(name: string, fn: () => void) {
  try {
    fn()
    passed++
  } catch (err) {
    console.error(`FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

const trackIds = [
  { id: 1, addTime: 100 },
  { id: 2, at: 200 },
  { id: 3, time: 300 },
  { id: 4, addTime: 400 },
]

check('按 trackIds 顺序合并，playlistIndex 递增', () => {
  const existing = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]
  const fetched = [{ id: 3, name: 'C' }, { id: 4, name: 'D' }]
  const tracks = reconstructPlaylistTracks(trackIds, existing, fetched, 4)
  assert.deepEqual(tracks.map(t => t.name), ['A', 'B', 'C', 'D'])
  assert.deepEqual(tracks.map(t => t.playlistIndex), [0, 1, 2, 3])
})

check('合并只增不减（已展示的行不会被新写入丢弃）', () => {
  const existing = [{ id: 1, name: 'A' }]
  const fetched = [{ id: 2, name: 'B' }]
  const tracks = reconstructPlaylistTracks(trackIds, existing, fetched, 2)
  assert.deepEqual(tracks.map(t => t.name), ['A', 'B'])
})

check('addTime 回退顺序：at > addTime > time > 详情值', () => {
  const fetched = [
    { id: 1, name: 'A', addTime: 999 },
    { id: 2, name: 'B', addTime: 888 },
    { id: 3, name: 'C', addTime: 777 },
  ]
  const tracks = reconstructPlaylistTracks(trackIds, [], fetched, 3)
  assert.deepEqual(tracks.map(t => t.addTime), [100, 200, 300])
})

check('trackIds 里没有附加时间的用详情里的 addTime', () => {
  const tracks = reconstructPlaylistTracks([{ id: 9 }], [], [{ id: 9, name: 'Z', addTime: 55 }], 1)
  assert.equal(tracks[0]?.addTime, 55)
})

check('limit 内缺失详情的行跳过（不渲染占位幽灵行）', () => {
  const tracks = reconstructPlaylistTracks([{ id: 1 }, { id: 2 }], [], [{ id: 1, name: 'A' }], 2)
  assert.deepEqual(tracks.map(t => t.id), [1])
})

console.log(`details playlist pagination: ${passed} passed${process.exitCode ? ', 有失败' : ', 0 failed'}`)