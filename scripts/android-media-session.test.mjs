import assert from 'node:assert/strict'
import { parseNativeMediaSession } from './browser/android-playback.mjs'

const appId = 'com.zheting.music.androidtest'
for (const [format, state] of [['2', 2], ['PAUSED(2)', 2], ['3', 3], ['PLAYING(3)', 3], ['BUFFERING(6)', 6]]) {
  const dump = `package=com.android.server.telecom
    state=null
package=${appId}
    active=true
    state=PlaybackState {state=${format}, position=9186, speed=0.0, active item id=1, error=null}
    metadata: size=6, description=Native startup test 910002, CI, Local PCM
package=com.google.android.bluetooth
    state=PlaybackState {state=ERROR(7), active item id=-1}
`
  const parsed = parseNativeMediaSession(dump, appId)
  assert.equal(parsed.state, state, format)
  assert.equal(parsed.index, 1)
  assert.ok(parsed.session.includes('description=Native startup test 910002'))
}
const absent = parseNativeMediaSession('package=com.android.server.telecom\nstate=null', appId)
assert.ok(Number.isNaN(absent.state))
assert.ok(Number.isNaN(absent.index))
console.log('Android MediaSession: numeric and named playback states, active queue index and missing session passed')
