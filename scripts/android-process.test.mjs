import assert from 'node:assert/strict'
import { waitForProcess } from './browser/android-process.mjs'
let time = 0, reads = 0
const clock = { now: () => time, pause: async ms => { time += ms }, timeout: 600, interval: 150 }
assert.equal(await waitForProcess(() => {
  reads++
  if (reads === 1) throw Object.assign(new Error('pidof empty'), { status: 1 })
  return reads < 3 ? '' : '1234\n'
}, clock), 1234)
assert.equal(time, 300)
assert.equal(reads, 3)
await assert.rejects(waitForProcess(() => '', clock), /within 600ms/)
await assert.rejects(waitForProcess(() => { throw Object.assign(new Error('adb disconnected'), { status: 127 }) }, clock), /disconnected/)
console.log('Android process polling: delayed PID, bounded timeout and adb errors passed')
