/**
 * 歌单状态机自检：每种展示/底部状态都有一行测试数据。
 * 跑法：node --experimental-strip-types src/lib/pages/playlist-state.test.ts
 * 退出码：0 = 过，1 = 挂。
 */
import assert from 'node:assert/strict'
import { playlistDisplayState, playlistFooterState } from './playlist-state.ts'

const displayCases = [
  // [说明, 输入, 期望]
  ['首屏还没详情', { loading: true, error: '', hasDetail: false, loadedCount: 0 }, 'initial-loading'],
  ['详情都没拿到', { loading: false, error: '网络错误', hasDetail: false, loadedCount: 0 }, 'failed'],
  ['没有详情也不再加载', { loading: false, error: '', hasDetail: false, loadedCount: 0 }, 'missing'],
  ['详情到了、曲目在补', { loading: true, error: '', hasDetail: true, loadedCount: 0 }, 'header-only'],
  ['详情到了、歌单为空', { loading: false, error: '', hasDetail: true, loadedCount: 0 }, 'empty'],
  ['详情到了、首批失败', { loading: false, error: '请求失败', hasDetail: true, loadedCount: 0 }, 'batch-failed'],
  ['有曲目可展示', { loading: false, error: '', hasDetail: true, loadedCount: 40 }, 'ready'],
] as const

for (const [label, input, expected] of displayCases) {
  assert.equal(playlistDisplayState(input), expected, label)
}

// 已有曲目时，刷新/追加错误都必须保持 ready，不能把页面打回空态
assert.equal(playlistDisplayState({ loading: true, error: '', hasDetail: true, loadedCount: 40 }), 'ready', 'refresh keeps rows')
assert.equal(playlistDisplayState({ loading: false, error: '追加失败', hasDetail: true, loadedCount: 40 }), 'ready', 'append failure keeps rows')
assert.equal(playlistDisplayState({ loading: true, error: '重试中', hasDetail: true, loadedCount: 40 }), 'ready', 'retrying keeps rows')

// 「详情有了但曲目失败」与「详情都没拿到」必须是不同状态：前者能保留头部
assert.notEqual(
  playlistDisplayState({ loading: false, error: 'x', hasDetail: true, loadedCount: 0 }),
  playlistDisplayState({ loading: false, error: 'x', hasDetail: false, loadedCount: 0 }),
)

const footerCases = [
  ['没有曲目时不显示底部行', { loadingMore: false, error: '', hasMore: true, hasLoadedTracks: false }, 'hidden'],
  ['还有下一页', { loadingMore: false, error: '', hasMore: true, hasLoadedTracks: true }, 'more'],
  ['正在追加', { loadingMore: true, error: '', hasMore: true, hasLoadedTracks: true }, 'appending'],
  ['追加失败', { loadingMore: false, error: '加载更多失败', hasMore: true, hasLoadedTracks: true }, 'append-failed'],
  ['加载完且无追加失败', { loadingMore: false, error: '', hasMore: false, hasLoadedTracks: true }, 'hidden'],
] as const

for (const [label, input, expected] of footerCases) {
  assert.equal(playlistFooterState(input), expected, label)
}

// 追加失败优先于「正在追加」，否则错误和转圈会同时出现
assert.equal(
  playlistFooterState({ loadingMore: true, error: '失败', hasMore: true, hasLoadedTracks: true }),
  'append-failed',
  'error wins over spinner',
)

console.log('playlist state: 7 display states and 4 footer states passed')
