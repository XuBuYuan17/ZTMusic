/**
 * scrollLyricIntoView self-check.
 * Run: node src/lib/utils/scroll-lyric.test.js
 */
import { scrollLyricIntoView } from './scroll-lyric.js'

let passed = 0
let failed = 0
function check(actual, expected, message) {
  if (actual === expected) { passed++ }
  else { console.error(`FAIL: ${message} - expected ${expected}, got ${actual}`); failed++ }
}

function makeContainer(lines, clientHeight) {
  let scrolledTo = null
  return {
    clientHeight,
    querySelectorAll: () => lines,
    scrollTo: (opts) => { scrolledTo = opts },
    get scrolledTo() { return scrolledTo },
  }
}

// index < 0 or missing container => no-op
{
  const c = makeContainer([{ offsetTop: 100, clientHeight: 20 }], 400)
  scrollLyricIntoView(c, -1, '.x')
  check(c.scrolledTo, null, 'negative index no-op')
  scrollLyricIntoView(null, 0, '.x')
  check(true, true, 'null container no throw')
}

// centre ratio 0.5: offset = 300 - 400*0.5 + 30/2 = 115
{
  const c = makeContainer([{ offsetTop: 300, clientHeight: 30 }], 400)
  scrollLyricIntoView(c, 0, '.x', 0.5)
  check(c.scrolledTo.top, 115, 'centre offset')
  check(c.scrolledTo.behavior, 'smooth', 'smooth behavior')
}

// top-biased ratio 0.25: offset = 300 - 400*0.25 + 30/2 = 215
{
  const c = makeContainer([{ offsetTop: 300, clientHeight: 30 }], 400)
  scrollLyricIntoView(c, 0, '.x', 0.25)
  check(c.scrolledTo.top, 215, 'top-biased offset')
}

// clamp to 0 when computed offset is negative
{
  const c = makeContainer([{ offsetTop: 10, clientHeight: 20 }], 400)
  scrollLyricIntoView(c, 0, '.x', 0.5)
  check(c.scrolledTo.top, 0, 'clamped to 0')
}

// missing target line => no-op
{
  const c = makeContainer([], 400)
  scrollLyricIntoView(c, 5, '.x', 0.5)
  check(c.scrolledTo, null, 'missing line no-op')
}

console.log(`\nscrollLyricIntoView: ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
