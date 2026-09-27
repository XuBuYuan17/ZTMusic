import assert from 'node:assert/strict'
import { replaceAnimation, pageMotion } from './desktop-motion.ts'

const pending: Array<{ finish: () => void; cancelled: boolean }> = []
const node = {
  animate() {
    let finish!: () => void
    const finished = new Promise<void>(resolve => { finish = resolve })
    const entry = { finish, cancelled: false }
    pending.push(entry)
    return { finished, cancel() { entry.cancelled = true } }
  },
} as unknown as HTMLElement
const controller = replaceAnimation()
const calls: string[] = []
controller.run(node, [], { duration: 480 }, () => calls.push('old'))
controller.run(node, [], { duration: 480 }, () => calls.push('new'))
assert.equal(pending[0]!.cancelled, true)
pending[0]!.finish()
await Promise.resolve()
assert.deepEqual([...calls], [], 'replaced completion cannot change current state')
pending[1]!.finish()
await Promise.resolve()
assert.deepEqual([...calls], ['new'])
assert.equal(pending[1]!.cancelled, true, 'completed transient styles are removed')
controller.run(node, [], { duration: 90, fill: 'forwards' })
pending[2]!.finish()
await Promise.resolve()
assert.equal(pending[2]!.cancelled, false, 'press remains until release')
controller.run(node, [], { duration: 280 }, () => calls.push('unmounted'))
controller.cancel()
pending[3]!.finish()
await Promise.resolve()
assert.deepEqual(calls, ['new'], 'unmount prevents late completion')
// ---- pageMotion：导航方向与移动端跳过 ----
const pageFrames: string[][] = []
const pageNode = {
  animate(frames: Keyframe[]) {
    pageFrames.push(frames.map(f => String(f.transform)))
    let finish!: () => void
    const finished = new Promise<void>(resolve => { finish = resolve })
    const entry = { finish, cancelled: false }
    pending.push(entry)
    return { finished, cancel() { entry.cancelled = true } }
  },
} as unknown as HTMLElement

let mobileClass = false
;(globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false }) }
;(globalThis as { document?: unknown }).document = {
  documentElement: { classList: { contains: (name: string) => name === 'mobile-runtime' && mobileClass } },
}

const page = pageMotion(pageNode, { identity: 'a', direction: 'forward' })
assert.equal(pageFrames.length, 1)
assert.match(pageFrames[0]![0]!, /translate\(16px/, 'forward enters from +16px')
page.update({ identity: 'a', direction: 'back' })
assert.equal(pageFrames.length, 1, 'same identity does not replay')
page.update({ identity: 'b', direction: 'back' })
assert.match(pageFrames[1]![0]!, /translate\(-16px/, 'back enters from -16px')
mobileClass = true
page.update({ identity: 'c', direction: 'forward' })
assert.equal(pageFrames.length, 2, 'mobile runtime skips page motion')
page.destroy()

console.log('desktop motion: interruption, completion, hold, cleanup and page direction passed')
