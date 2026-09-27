/**
 * Queue index self-check（重点是 shuffle 指针语义）。
 * Run: node --experimental-strip-types src/lib/player/queue.test.ts
 * Status code: 0 = pass, 1 = fail.
 */

import {
  compactTrack,
  compactQueue,
  moveQueueItemState,
  removeQueueItemState,
  replaceQueueState,
  resolveQueueSelection,
  restoreShuffleState,
  getNextIndex,
  getPrevIndex,
  commitNextIndex,
  commitPrevIndex,
  type ShuffleState,
} from './queue.ts'

let passed = 0
let failed = 0

function assert(cond: unknown, msg: string) {
  if (cond) { passed++ } else { console.error('FAIL:', msg); failed++ }
}

function assertEqual(a: unknown, b: unknown, msg: string) {
  if (a === b) { passed++ } else { console.error(`FAIL: ${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); failed++ }
}

function freshState(): ShuffleState {
  return { order: [], position: -1 }
}

function tracks(count: number) {
  return Array.from({ length: count }, (_, id) => ({ id, name: `Track ${id}` }))
}

// ── 持久化的随机顺序只接受完整合法的排列 ──
{
  const restored = restoreShuffleState({ order: [2, 0, 1], position: 1 }, 3, 0)
  assertEqual(restored.order.join(','), '2,0,1', 'restore keeps valid shuffle order')
  assertEqual(restored.position, 1, 'restore keeps valid shuffle position')
  assertEqual(restoreShuffleState({ order: [0, 0, 2], position: 1 }, 3).order.length, 0, 'duplicate shuffle index resets state')
  assertEqual(restoreShuffleState({ order: [0, 1], position: 0 }, 3).order.length, 0, 'queue length mismatch resets state')
  assertEqual(restoreShuffleState({ order: [0, 1, 3], position: 0 }, 3).order.length, 0, 'out-of-range shuffle index resets state')
  assertEqual(restoreShuffleState({ order: [2, 0, 1], position: 1 }, 3, 2).order.length, 0, 'current queue index mismatch resets state')
}

// ── 本地歌曲字段必须穿过队列压缩，否则重启后会误走远程 URL 解析 ──
{
  const track = compactTrack({
    id: 'local:1234', localId: 'local:1234', source: 'local', name: '本地歌曲',
    ar: [{ id: 'local-artist:a', name: '歌手' }], al: { id: 'local-album:a', name: '专辑' },
    dt: 120000, fileName: 'song.mp3', relativePath: 'album/song.mp3', mime: 'audio/mpeg', fileSize: 2048,
  })!
  assertEqual(track.source, 'local', 'compactTrack 保留本地来源')
  assertEqual(track.localId, 'local:1234', 'compactTrack 保留本地文件 ID')
  assertEqual(track.fileName, 'song.mp3', 'compactTrack 保留本地文件名')
  assertEqual(track.fileSize, 2048, 'compactTrack 保留本地文件大小')
}

// ── 空队列 ──
{
  assertEqual(getNextIndex({ currentIndex: 0, queueLength: 0, mode: 'list' }), -1, 'empty queue next = -1')
  assertEqual(getPrevIndex({ currentIndex: 0, queueLength: 0 }), -1, 'empty queue prev = -1')
}

// ── 直接点播与队列选择必须保持当前歌曲和队列一致 ──
{
  const queue = compactQueue(tracks(3))
  const standalone = resolveQueueSelection(queue, freshState(), compactTrack({ id: 9, name: 'Standalone' })!, 0, 'list')
  assertEqual(standalone.index, 0, 'standalone track starts at queue index zero')
  assertEqual(standalone.state?.queue.length, 1, 'standalone track replaces stale queue')
  assertEqual(standalone.state?.queue[0]?.id, 9, 'standalone queue contains selected track')

  const matching = resolveQueueSelection(queue, freshState(), queue[1]!, 1, 'list')
  assertEqual(matching.state, null, 'matching queue selection preserves queue')

  const staleShuffle = resolveQueueSelection(queue, { order: [2, 0, 1], position: 0 }, queue[1]!, 1, 'shuffle')
  assertEqual(staleShuffle.state?.queue.length, 3, 'stale shuffle selection preserves queue tracks')
  assertEqual(staleShuffle.state?.shuffleState.order.length, 0, 'stale shuffle selection resets order')

  const alignedShuffle = resolveQueueSelection(queue, { order: [2, 0, 1], position: 2 }, queue[1]!, 1, 'shuffle')
  assertEqual(alignedShuffle.state, null, 'aligned shuffle selection keeps history')
}

// ── 所有队列入口都遵守最大容量 ──
{
  assertEqual(compactQueue(tracks(600)).length, 500, 'queue is capped at MAX_QUEUE')
  const replaced = replaceQueueState(tracks(600), 599)
  assertEqual(replaced.queue.length, 500, 'replaceQueue caps queue')
  assertEqual(replaced.queueIndex, 499, 'replaceQueue clamps current index after cap')
}

// ── reorder 保持当前歌曲，并使旧 shuffle 顺序失效 ──
{
  const movedCurrent = moveQueueItemState(tracks(5), 1, 1, 3)!
  assertEqual(movedCurrent.queueIndex, 3, 'moving current track follows it')
  assertEqual(movedCurrent.queue[3]!.id, 1, 'current track identity survives reorder')
  assertEqual(movedCurrent.shuffleState.order.length, 0, 'reorder resets shuffle order')
  assertEqual(movedCurrent.shuffleState.position, -1, 'reorder resets shuffle position')

  const crossedCurrent = moveQueueItemState(tracks(5), 2, 0, 4)!
  assertEqual(crossedCurrent.queueIndex, 1, 'moving an earlier item past current adjusts index')
  assertEqual(crossedCurrent.queue[1]!.id, 2, 'adjusted index still points to current track')
}

// ── 删除当前歌曲选择同位置的下一首，删除末项则退到前一首 ──
{
  const middle = removeQueueItemState(tracks(4), 1, 1)!
  assertEqual(middle.wasCurrent, true, 'remove marks current track')
  assertEqual(middle.queueIndex, 1, 'removing current keeps its position')
  assertEqual(middle.queue[1]!.id, 2, 'next track becomes current')
  assertEqual(middle.shuffleState.order.length, 0, 'remove resets shuffle order')

  const last = removeQueueItemState(tracks(4), 3, 3)!
  assertEqual(last.queueIndex, 2, 'removing last current track selects previous track')
  assertEqual(last.queue[2]!.id, 2, 'previous track becomes current at queue end')
}

// ── list 模式环绕 ──
{
  assertEqual(getNextIndex({ currentIndex: 0, queueLength: 3, mode: 'list' }), 1, 'list next')
  assertEqual(getNextIndex({ currentIndex: 2, queueLength: 3, mode: 'list' }), 0, 'list next wraps')
  assertEqual(getPrevIndex({ currentIndex: 0, queueLength: 3 }), 2, 'prev wraps')
  assertEqual(getPrevIndex({ currentIndex: 2, queueLength: 3 }), 1, 'prev')
}

// ── repeat 模式停在原地 ──
{
  assertEqual(getNextIndex({ currentIndex: 1, queueLength: 3, mode: 'repeat' }), 1, 'repeat stays')
}

// ── 回归：shuffle 下 peek 幂等（曾因预取推进指针导致隔一首跳歌）──
{
  const shuffleState = freshState()
  const first = getNextIndex({ currentIndex: 0, queueLength: 6, mode: 'shuffle', shuffleState })
  const again = getNextIndex({ currentIndex: 0, queueLength: 6, mode: 'shuffle', shuffleState })
  const third = getNextIndex({ currentIndex: 0, queueLength: 6, mode: 'shuffle', shuffleState })
  assertEqual(again, first, 'shuffle peek 幂等：预取与切歌看到同一首')
  assertEqual(third, first, 'shuffle peek 幂等：连续三次一致')
  assertEqual(shuffleState.position, -1, 'peek 不推进 position')
}

// ── commit 之后 peek 才前进 ──
{
  const shuffleState = freshState()
  const first = getNextIndex({ currentIndex: 0, queueLength: 6, mode: 'shuffle', shuffleState })
  commitNextIndex({ mode: 'shuffle', shuffleState })
  assertEqual(shuffleState.position, 0, 'commit 推进 position')
  const second = getNextIndex({ currentIndex: first, queueLength: 6, mode: 'shuffle', shuffleState })
  assert(second !== first, 'commit 后 peek 前进到下一首')
}

// ── shuffle 上一首按实际播放历史回退，下一首可以原路返回 ──
{
  const shuffleState = freshState()
  let currentIndex = getNextIndex({ currentIndex: 0, queueLength: 6, mode: 'shuffle', shuffleState })
  commitNextIndex({ mode: 'shuffle', shuffleState })
  const secondIndex = getNextIndex({ currentIndex, queueLength: 6, mode: 'shuffle', shuffleState })
  commitNextIndex({ mode: 'shuffle', shuffleState })
  currentIndex = secondIndex

  const previousIndex = getPrevIndex({ currentIndex, queueLength: 6, mode: 'shuffle', shuffleState })
  assertEqual(previousIndex, shuffleState.order[0], 'shuffle previous follows played order')
  commitPrevIndex({ mode: 'shuffle', shuffleState })
  assertEqual(shuffleState.position, 0, 'shuffle previous rewinds cursor')
  assertEqual(
    getNextIndex({ currentIndex: previousIndex, queueLength: 6, mode: 'shuffle', shuffleState }),
    secondIndex,
    'shuffle next returns along history after going back',
  )
}

// ── shuffle 尚无历史时上一首停在当前歌曲 ──
{
  const shuffleState = freshState()
  const first = getNextIndex({ currentIndex: 0, queueLength: 4, mode: 'shuffle', shuffleState })
  commitNextIndex({ mode: 'shuffle', shuffleState })
  assertEqual(
    getPrevIndex({ currentIndex: first, queueLength: 4, mode: 'shuffle', shuffleState }),
    first,
    'shuffle previous stays when history is exhausted',
  )
}

// ── 一轮洗牌覆盖全部索引，不重不漏 ──
{
  const queueLength = 8
  const shuffleState = freshState()
  let currentIndex = 0
  const visited = []
  for (let i = 0; i < queueLength; i++) {
    const idx = getNextIndex({ currentIndex, queueLength, mode: 'shuffle', shuffleState })
    commitNextIndex({ mode: 'shuffle', shuffleState })
    visited.push(idx)
    currentIndex = idx
  }
  assertEqual(visited.length, queueLength, 'shuffle cycle length')
  assertEqual(new Set(visited).size, queueLength, 'shuffle 一轮覆盖全部索引，无重复无跳过')
  assert(visited.every((i) => i >= 0 && i < queueLength), 'shuffle 索引在范围内')
}

// ── 走完一轮后自动重新洗牌 ──
{
  const queueLength = 4
  const shuffleState = freshState()
  for (let i = 0; i < queueLength; i++) {
    getNextIndex({ currentIndex: 0, queueLength, mode: 'shuffle', shuffleState })
    commitNextIndex({ mode: 'shuffle', shuffleState })
  }
  assertEqual(shuffleState.position, queueLength - 1, '一轮走完 position 到末尾')
  const firstOfNextRound = getNextIndex({ currentIndex: 0, queueLength, mode: 'shuffle', shuffleState })
  assertEqual(shuffleState.position, -1, '走完一轮后 peek 触发重新洗牌')
  assert(firstOfNextRound >= 0 && firstOfNextRound < queueLength, '新一轮索引合法')
}

// ── 新一轮的第一首不会撞上正在播的那首 ──
{
  for (let trial = 0; trial < 50; trial++) {
    const shuffleState = freshState()
    const idx = getNextIndex({ currentIndex: 2, queueLength: 4, mode: 'shuffle', shuffleState })
    assert(idx !== 2, 'shuffle 首选不等于当前曲目')
    if (idx === 2) break
  }
}

// ── 队列长度变化触发重新洗牌 ──
{
  const shuffleState = freshState()
  getNextIndex({ currentIndex: 0, queueLength: 5, mode: 'shuffle', shuffleState })
  commitNextIndex({ mode: 'shuffle', shuffleState })
  const idx = getNextIndex({ currentIndex: 0, queueLength: 3, mode: 'shuffle', shuffleState })
  assertEqual(shuffleState.order.length, 3, '队列变短后重新洗牌')
  assert(idx >= 0 && idx < 3, '重洗后索引在新范围内')
}

// ── 单曲队列 ──
{
  const shuffleState = freshState()
  assertEqual(getNextIndex({ currentIndex: 0, queueLength: 1, mode: 'shuffle', shuffleState }), 0, 'single track shuffle')
}

// ── 缺少 shuffleState 时降级为随机，不抛错 ──
{
  const idx = getNextIndex({ currentIndex: 0, queueLength: 5, mode: 'shuffle' })
  assert(idx >= 0 && idx < 5, 'shuffle 无 state 时降级安全')
}

// ── commitNextIndex 在非 shuffle / 无 state 下是空操作 ──
{
  const shuffleState = freshState()
  commitNextIndex({ mode: 'list', shuffleState })
  assertEqual(shuffleState.position, -1, 'list 模式 commit 不动 position')
  commitNextIndex({ mode: 'shuffle', shuffleState: null })
  commitNextIndex({ mode: 'shuffle' })
  passed++ // 上面两行不抛错即通过
}

console.log(`\n${passed} passed, ${failed} failed${failed ? ' — FAIL' : ' — all good'}`)
process.exitCode = failed ? 1 : 0
