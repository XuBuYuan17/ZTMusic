/**
 * 歌曲行数据归一自检。
 * 跑法：node --experimental-strip-types src/lib/components/song-row.test.ts
 * 退出码：0 = 过，1 = 挂。
 */
import assert from 'node:assert/strict'
import { toSongRow, withRowKeys } from './song-row.ts'

// ── 完整字段：两种命名（网易云原始 / 中立模型）归一到同一形状 ──
{
  const raw = { id: 7, name: '像风一样', ar: [{ id: 21, name: '薛之谦' }], al: { id: 31, name: '渡', picUrl: 'https://p/31.jpg' }, dt: 245000, addTime: 1700000000000 }
  const row = toSongRow(raw)
  assert.equal(row.id, 7)
  assert.equal(row.name, '像风一样')
  assert.deepEqual(row.artists, [{ id: 21, name: '薛之谦' }])
  assert.deepEqual(row.album, { id: 31, name: '渡' })
  assert.equal(row.cover, 'https://p/31.jpg')
  assert.equal(row.durationLabel, '4:05')
  assert.equal(row.addedLabel.startsWith('2023.') || row.addedLabel.startsWith('2024.'), true, 'added date is formatted')
  assert.equal(row.source, raw, 'raw track is kept for the context menu')

  // 同一首歌无论从哪个页面进来，归一结果一致 → 两端指向同一资源
  const neutral = { id: 7, name: '像风一样', artists: [{ id: 21, name: '薛之谦' }], album: { id: 31, name: '渡' }, picUrl: 'https://p/31.jpg', duration: 245000, addedAt: 1700000000000 }
  const same = toSongRow(neutral)
  assert.equal(same.id, row.id)
  assert.deepEqual(same.artists, row.artists)
  assert.deepEqual(same.album, row.album)
  assert.equal(same.durationLabel, row.durationLabel)
}

// ── 缺失字段：都有稳定输出，不抛错 ──
{
  const empty = toSongRow({})
  assert.equal(empty.name, '')
  assert.deepEqual(empty.artists, [])
  assert.equal(empty.album, null)
  assert.equal(empty.cover, '')
  assert.equal(empty.durationLabel, '—', 'missing duration is not 0:00')
  assert.equal(empty.addedLabel, '—')

  const noArtists = toSongRow({ id: 1, name: '纯音乐', al: { name: '专辑' }, dt: 0 })
  assert.deepEqual(noArtists.artists, [])
  assert.equal(noArtists.album?.name, '专辑')

  // 歌手字段残缺：没有名字的条目被丢弃
  const brokenArtists = toSongRow({ id: 2, name: 'x', ar: [{ id: 9 }, null, 'bad', { name: '有名字' }] })
  assert.deepEqual(brokenArtists.artists, [{ id: 9, name: '' }, { id: undefined, name: '有名字' }])

  // 封面缺失：没有 picUrl 也没有专辑封面
  assert.equal(toSongRow({ id: 3, name: 'y', al: { name: '空封面' } }).cover, '')
  // 长名称原样保留（截断交给 CSS）
  const longName = '很'.repeat(300)
  assert.equal(toSongRow({ id: 4, name: longName }).name, longName)
}

// ── 重复曲目：id 相同也不能撞 key ──
{
  const rows = [toSongRow({ id: 5, name: 'A' }), toSongRow({ id: 5, name: 'A' }), toSongRow({ id: 6, name: 'B' }), toSongRow({ id: 5, name: 'A' })]
  const keyed = withRowKeys(rows)
  assert.deepEqual(keyed.map(item => item.key), ['5#0', '5#1', '6#0', '5#2'])
  assert.equal(new Set(keyed.map(item => item.key)).size, keyed.length, 'keys stay unique with duplicate ids')
  // 同一位置重复计算得到相同 key，列表顺序不变时不会因重渲染整体重建
  assert.deepEqual(withRowKeys(rows).map(item => item.key), keyed.map(item => item.key))
}

console.log('song row: normalization, missing fields and duplicate keys passed')
