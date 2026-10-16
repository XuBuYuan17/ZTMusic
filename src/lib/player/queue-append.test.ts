import assert from 'node:assert/strict'
import { appendQueueState, compactQueue, getPrevIndex, type ShuffleState } from './queue.ts'

const queue = compactQueue(Array.from({ length: 5 }, (_, id) => ({ id })))
const shuffle: ShuffleState = { order: [2, 0, 4, 1, 3], position: 1 }
const appended = appendQueueState(queue, shuffle, [{ id: 5 }, { id: 6 }], 0)
assert.deepEqual(appended.queue.map(track => track.id), [0, 1, 2, 3, 4, 5, 6])
assert.equal(appended.queueIndex, 0)
assert.deepEqual(appended.shuffleState.order.slice(0, 2), [2, 0], 'played prefix survives background append')
assert.equal(appended.shuffleState.position, 1)
assert.deepEqual(appended.shuffleState.order.filter(index => index < 5), [2, 0, 4, 1, 3], 'existing future order is retained')
assert.equal(new Set(appended.shuffleState.order).size, 7)
assert.equal(getPrevIndex({ currentIndex: 0, queueLength: 7, mode: 'shuffle', shuffleState: appended.shuffleState }), 2)
assert.deepEqual(shuffle.order, [2, 0, 4, 1, 3], 'input shuffle state remains unchanged')

const full = compactQueue(Array.from({ length: 500 }, (_, id) => ({ id })))
const capped = appendQueueState(full, { order: [], position: -1 }, [{ id: 501 }], 499)
assert.equal(capped.queue.length, 500)
assert.equal(capped.queue[499]?.id, 499)
assert.equal(capped.queueIndex, 499)
const fresh = appendQueueState(queue, { order: [], position: -1 }, [{ id: 5 }], 4)
assert.deepEqual(fresh.shuffleState, { order: [], position: -1 }, 'uninitialized shuffle stays lazy')
const peeked = appendQueueState(queue, { order: [1, 2, 0, 3, 4], position: -1 }, [{ id: 5 }], 0)
assert.notEqual(peeked.shuffleState.order[0], 0, 'adding tracks cannot introduce an immediate current-track repeat')
assert.equal(appendQueueState([], { order: [], position: -1 }, [], -1).queueIndex, -1)
console.log('queue append: capacity, current selection, shuffle history, future order and lazy initialization passed')
