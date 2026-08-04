import { createLyricsLoader } from './lyrics-loader.js'

let passed = 0
let failed = 0

function assertEqual(actual, expected, message) {
  if (actual === expected) passed++
  else {
    console.error(`FAIL: ${message} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  }
}

let resolveFetch
let calls = 0
const loader = createLyricsLoader(() => {
  calls++
  return new Promise((resolve) => { resolveFetch = resolve })
}, 2)

const first = loader.load(1)
const duplicate = loader.load(1)
assertEqual(first, duplicate, 'shares the in-flight request for the same track')
assertEqual(calls, 1, 'fetches the same track once while pending')

resolveFetch({ lrc: { lyric: '[00:01.00] First line' }, tlyric: { lyric: '[00:01.00] 第一行' } })
const lines = await first
assertEqual(lines.length, 1, 'parses lyric response into display lines')
assertEqual(lines[0].text, 'First line', 'normalizes the lyric text')
assertEqual(lines[0].translation, '第一行', 'keeps translated text')

const cached = await loader.load(1)
assertEqual(cached, lines, 'returns the cached array for repeat consumers')
assertEqual(calls, 1, 'does not refetch a cached track')

console.log(`\n${passed} passed, ${failed} failed${failed ? ' - FAIL' : ' - all good'}`)
process.exit(failed ? 1 : 0)
