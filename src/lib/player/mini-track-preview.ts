import { getNextIndex, getPrevIndex, type CompactTrack, type ShuffleState } from './queue.ts'
import type { PlayMode } from '../types/player.ts'

export function miniTrackPreview(
  queue: readonly CompactTrack[],
  currentIndex: number,
  currentId: unknown,
  mode: PlayMode,
  shuffleState: ShuffleState,
  native: boolean,
  direction: 1 | -1,
): CompactTrack | null {
  if (queue.length < 2 || currentIndex < 0 || currentIndex >= queue.length || String(queue[currentIndex]?.id) !== String(currentId)) return null
  // ponytail: Media3 的随机顺序不在当前快照中；需要原生暴露相邻索引后才能显示准确曲目。
  if (native && mode !== 'list') return null
  if (mode === 'shuffle' && direction === 1 && (shuffleState.order.length !== queue.length || shuffleState.position >= queue.length - 1)) return null
  const options = { currentIndex, queueLength: queue.length, mode, shuffleState }
  const index = direction === 1 ? getNextIndex(options) : getPrevIndex(options)
  return queue[index] ?? null
}
