import assert from 'node:assert/strict'
import { miniTrackPreview } from './mini-track-preview.ts'
import { compactQueue, createShuffleState } from './queue.ts'

const queue = compactQueue([{ id: 1, name: '一' }, { id: 2, name: '二' }, { id: 3, name: '三' }])
const emptyShuffle = createShuffleState()
assert.equal(miniTrackPreview(queue, 0, 1, 'list', emptyShuffle, false, 1)?.id, 2)
assert.equal(miniTrackPreview(queue, 0, 1, 'list', emptyShuffle, true, -1)?.id, 3)
assert.equal(miniTrackPreview(queue, 0, 999, 'list', emptyShuffle, false, 1), null)
assert.equal(miniTrackPreview(queue, 0, 1, 'shuffle', emptyShuffle, false, 1), null)
assert.deepEqual(emptyShuffle.order, [], 'preview does not initialize or change shuffle order')
const shuffle = { order: [0, 2, 1], position: 0 }
assert.equal(miniTrackPreview(queue, 0, 1, 'shuffle', shuffle, false, 1)?.id, 3)
assert.equal(miniTrackPreview(queue, 0, 1, 'shuffle', shuffle, true, 1), null)
assert.equal(miniTrackPreview(queue, 1, 2, 'repeat', shuffle, false, 1)?.id, 2)
assert.equal(miniTrackPreview(queue, 1, 2, 'repeat', shuffle, true, 1), null)
console.log('mini track preview: queue boundaries, shuffle and native uncertainty passed')
