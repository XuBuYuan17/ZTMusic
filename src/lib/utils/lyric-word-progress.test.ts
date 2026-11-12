import assert from 'node:assert/strict'
import { wordProgress } from './lyric-word-progress.ts'

const word = { time: 10, duration: 2 }
assert.equal(wordProgress(word, 9), 0)
assert.equal(wordProgress(word, 10), 0)
assert.equal(wordProgress(word, 11), 50)
assert.equal(wordProgress(word, 13), 100)
assert.equal(wordProgress(word, 10, true), 100)
assert.equal(wordProgress({ time: 10, duration: 0 }, 10), 100)
assert.equal(wordProgress(word, Number.NaN), 0)
console.log('Lyric word progress: timing, seek boundaries and reduced motion passed')
