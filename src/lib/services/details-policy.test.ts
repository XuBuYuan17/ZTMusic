import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./details.ts', import.meta.url), 'utf8')

assert.match(
  source,
  /const INITIAL_PLAYLIST_DETAIL_LIMIT = 100\b/,
  'large playlists must keep a bounded 100-track first-open window',
)
assert.match(
  source,
  /const LOAD_MORE_BATCH_SIZE = 100\b/,
  'scroll pagination must stay bounded so one observer hit cannot fetch hundreds of rows repeatedly',
)
assert.match(
  source,
  /activeDetail\.tracksPartial = activeDetail\.tracks\.length < trackIds\.length/,
  'tracksPartial must turn false after the final page is actually loaded',
)

console.log('playlist loading policy: bounded first page, bounded pagination and final-page completion passed')
