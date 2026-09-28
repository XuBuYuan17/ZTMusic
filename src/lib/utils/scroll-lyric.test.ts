/**
 * scrollLyricIntoView self-check.
 * Run: node --experimental-strip-types src/lib/utils/scroll-lyric.test.ts
 */
import { scrollLyricIntoView, type ScrollContainer } from './scroll-lyric.ts'

let passed = 0
let failed = 0
function check(actual: unknown, expected: unknown, message: string) {
  if (actual === expected) { passed++ }
  else { console.error(`FAIL: ${message} - expected ${expected}, got ${actual}`); failed++ }
}

interface FakeLine {
  offsetTop: number
  clientHeight: number
}

function makeContainer(lines: FakeLine[], clientHeight: number): ScrollContainer & { scrolledTo: ScrollToOptions | null; scrollTop: number } {
  let scrolledTo: ScrollToOptions | null = null
  const container = {
    clientHeight,
    scrollTop: 0,
    querySelectorAll: () => lines,
    scrollTo(opts: ScrollToOptions) {
      scrolledTo = opts
      if (opts.top !== undefined) container.scrollTop = opts.top
    },
    get scrolledTo() { return scrolledTo },
  }
  return container
}

// index < 0 or missing container => no-op
{
  const c = makeContainer([{ offsetTop: 100, clientHeight: 20 }], 400)
  scrollLyricIntoView(c, -1, '.x')
  check(c.scrolledTo, null, 'negative index no-op')
  scrollLyricIntoView(null, 0, '.x')
  check(true, true, 'null container no throw')
}

// 手动 rAF 驱动器：测试环境无浏览器，用同步循环走完所有补间帧
let rafQueue: FrameRequestCallback[] = []
let rafTime = 0
;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: FrameRequestCallback) => { rafQueue.push(cb); return rafQueue.length }
;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => {}
;(globalThis as { performance?: unknown }).performance = { now: () => rafTime }

function runRaf(): void {
  // 从当前帧开始，逐帧消费队列（step 里会 push 下一帧）
  while (rafQueue.length > 0) {
    const cb = rafQueue.shift()!
    cb(rafTime)
    rafTime += 16
  }
}

// centre ratio 0.5: offset = 300 - 400*0.5 + 30/2 = 115
{
  const c = makeContainer([{ offsetTop: 300, clientHeight: 30 }], 400)
  scrollLyricIntoView(c, 0, '.x', 0.5)
  runRaf()
  check(c.scrolledTo?.top, 115, 'centre offset')
  check(c.scrolledTo?.behavior, undefined, 'smooth uses rAF tween, not scroll-behavior')
}

// top-biased ratio 0.25: offset = 300 - 400*0.25 + 30/2 = 215
{
  const c = makeContainer([{ offsetTop: 300, clientHeight: 30 }], 400)
  scrollLyricIntoView(c, 0, '.x', 0.25)
  runRaf()
  check(c.scrolledTo?.top, 215, 'top-biased offset')
}

// clamp to 0 when computed offset is negative
{
  const c = makeContainer([{ offsetTop: 10, clientHeight: 20 }], 400)
  scrollLyricIntoView(c, 0, '.x', 0.5)
  runRaf()
  check(c.scrolledTo?.top, 0, 'clamped to 0')
}

// missing target line => no-op
{
  const c = makeContainer([], 400)
  scrollLyricIntoView(c, 5, '.x', 0.5)
  check(c.scrolledTo, null, 'missing line no-op')
}

{
  const c = makeContainer([{ offsetTop: 300, clientHeight: 30 }], 400)
  scrollLyricIntoView(c, 0, '.x', 0.5, 'instant')
  check(c.scrolledTo?.top, 115, 'instant centering keeps the same geometry')
  check(c.scrolledTo?.behavior, 'instant', 'resize and reduced-motion centering is immediate')
}

console.log(`\nscrollLyricIntoView: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
