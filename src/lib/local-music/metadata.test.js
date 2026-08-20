import assert from 'node:assert/strict'
import { createLocalTrackId, fallbackMetadata, isSupportedAudioFile, parseId3Metadata } from './metadata.js'

function synchsafe(value) {
  return [(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f]
}

function textFrame(id, value) {
  const text = new TextEncoder().encode(value)
  const body = new Uint8Array(1 + text.length)
  body[0] = 3
  body.set(text, 1)
  const frame = new Uint8Array(10 + body.length)
  frame.set(new TextEncoder().encode(id), 0)
  frame.set([0, 0, 0, body.length], 4)
  frame.set(body, 10)
  return frame
}

const frames = [
  textFrame('TIT2', '本地标题'),
  textFrame('TPE1', '本地歌手'),
  textFrame('TALB', '本地专辑'),
]
const frameSize = frames.reduce((sum, frame) => sum + frame.length, 0)
const tag = new Uint8Array(10 + frameSize)
tag.set(new TextEncoder().encode('ID3'), 0)
tag.set([3, 0, 0], 3)
tag.set(synchsafe(frameSize), 6)
let offset = 10
for (const frame of frames) { tag.set(frame, offset); offset += frame.length }

assert.deepEqual(parseId3Metadata(tag), { title: '本地标题', artist: '本地歌手', album: '本地专辑' })
assert.deepEqual(parseId3Metadata(new Uint8Array([1, 2, 3])), {})
assert.deepEqual(fallbackMetadata('歌手 - 歌曲.flac'), { artist: '歌手', title: '歌曲', album: '' })
assert.deepEqual(fallbackMetadata('纯音乐.wav'), { artist: '未知歌手', title: '纯音乐', album: '' })
assert.equal(isSupportedAudioFile({ name: 'track.FLAC', type: '' }), true)
assert.equal(isSupportedAudioFile({ name: 'track.bin', type: 'audio/mpeg' }), true)
assert.equal(isSupportedAudioFile({ name: 'cover.png', type: 'image/png' }), false)

const sample = { name: 'track.mp3', size: 1234, lastModified: 5678 }
assert.equal(createLocalTrackId(sample), createLocalTrackId(sample))
assert.notEqual(createLocalTrackId(sample), createLocalTrackId({ ...sample, size: 1235 }))

console.log('local music metadata: 9 assertions passed')
