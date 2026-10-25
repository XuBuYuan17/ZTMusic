/**
 * 资料库管理动作自检（全部使用测试替身，不触碰真实账号）。
 * 跑法：node --experimental-strip-types src/lib/components/library-playlist-actions.test.ts
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  libraryPlaylistActionOf,
  libraryPlaylistActions,
  runLibraryPlaylistAction,
} from './library-playlist-actions.ts'

// ── 权限矩阵：归属决定动作 ──
assert.deepEqual(libraryPlaylistActions('liked'), [], 'liked playlist has no management actions')
assert.deepEqual(libraryPlaylistActions('owned').map(a => a.id), ['edit', 'delete'], 'own playlist can be edited and deleted')
assert.deepEqual(libraryPlaylistActions('saved').map(a => a.id), ['unsubscribe'], 'saved playlist can only be unsubscribed')

// 非本人歌单不出现编辑/删除
assert.equal(libraryPlaylistActionOf('saved', 'delete'), null)
assert.equal(libraryPlaylistActionOf('saved', 'edit'), null)
assert.equal(libraryPlaylistActionOf('liked', 'unsubscribe'), null)
assert.equal(libraryPlaylistActionOf('owned', 'unsubscribe'), null, 'own playlist is not something to unsubscribe')
assert.ok(libraryPlaylistActionOf('owned', 'delete')?.danger, 'delete is destructive')

// ── 执行：成功 / 业务失败 / 抛错，都用替身 ──
const calls: string[] = []
const okApi = {
  playlistDelete: async (id: unknown) => { calls.push(`delete:${id}`); return { code: 200 } },
  playlistSubscribe: async (id: unknown, on: boolean) => { calls.push(`subscribe:${id}:${on}`); return { code: 200 } },
}
const okDelete = await runLibraryPlaylistAction('delete', 7, okApi)
assert.deepEqual(okDelete, { ok: true, message: '已删除歌单' })
const okUnsub = await runLibraryPlaylistAction('unsubscribe', 8, okApi)
assert.deepEqual(okUnsub, { ok: true, message: '已取消收藏' })
assert.deepEqual(calls, ['delete:7', 'subscribe:8:false'], 'unsubscribe calls subscribe(false)')

const businessFail = await runLibraryPlaylistAction('delete', 9, {
  playlistDelete: async () => ({ code: 400, message: '歌单不存在' }),
  playlistSubscribe: async () => ({ code: 200 }),
})
assert.deepEqual(businessFail, { ok: false, message: '歌单不存在' }, 'body.code !== 200 is a failure with the api message')

const noCode = await runLibraryPlaylistAction('delete', 12, {
  playlistDelete: async () => ({}),
  playlistSubscribe: async () => ({ code: 200 }),
})
assert.deepEqual(noCode, { ok: false, message: '删除失败' }, 'an object body without code is still a failure')

const thrown = await runLibraryPlaylistAction('unsubscribe', 10, {
  playlistDelete: async () => ({ code: 200 }),
  playlistSubscribe: async () => { throw new Error('offline') },
})
assert.deepEqual(thrown, { ok: false, message: 'offline' }, 'network errors surface to the caller')

// 失败时不会调用第二个接口（只执行对应动作）
let touched = 0
await runLibraryPlaylistAction('delete', 11, {
  playlistDelete: async () => { touched++; return { code: 500, msg: 'boom' } },
  playlistSubscribe: async () => { touched += 10; return { code: 200 } },
})
assert.equal(touched, 1, 'a delete never unsubscribes')

// ── 卡片不直接承担账号写入 ──
const card = await readFile(new URL('./LibraryPlaylistCard.svelte', import.meta.url), 'utf8')
for (const banned of ['ncm.', 'playlistDelete', 'playlistSubscribe', 'await fetch(', 'runLibraryPlaylistAction']) {
  assert.ok(!card.includes(banned), `card must not write account data (${banned})`)
}
assert.ok(card.includes('onOptions') && card.includes('onEdit'), 'card only emits intent through callbacks')

// ── 页面用同一份策略 ──
const library = await readFile(new URL('../pages/pc/Library.svelte', import.meta.url), 'utf8')
assert.ok(library.includes("import { libraryPlaylistActions, runLibraryPlaylistAction }"), 'page uses the policy module')
assert.ok(!library.includes("selected.kind === 'owned' ?"), 'the sheet no longer hardcodes permissions inline')
assert.ok(library.includes("runLibraryPlaylistAction('delete'") && library.includes("runLibraryPlaylistAction('unsubscribe'"), 'mutations go through the runner')
assert.ok(library.includes('notifyPlaylistChange(pl.id as SongId)'), 'success still refreshes the related lists')

console.log('library actions: permissions, mutations and card purity passed')
