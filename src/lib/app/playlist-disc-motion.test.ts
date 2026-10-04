import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import {
  PLAYLIST_DISC_RESET_MS,
  PLAYLIST_DISC_SPIN_MS,
  createPlaylistDiscMotion,
  playlistDiscAngle,
} from './playlist-disc-motion.ts'

assert.equal(playlistDiscAngle(0), 0)
assert.equal(playlistDiscAngle(PLAYLIST_DISC_SPIN_MS / 4), 90)
assert.equal(playlistDiscAngle(PLAYLIST_DISC_SPIN_MS + PLAYLIST_DISC_SPIN_MS / 2), 180)

const classes = new Set<string>()
const styles = new Map<string, string>()
const animations: Array<{
  frames: Keyframe[]
  options: KeyframeAnimationOptions
  currentTime: number
  cancelled: boolean
  resolve: () => void
}> = []

const node = {
  classList: {
    add(value: string) { classes.add(value) },
    remove(value: string) { classes.delete(value) },
    toggle(value: string, force?: boolean) {
      const enabled = force ?? !classes.has(value)
      if (enabled) classes.add(value)
      else classes.delete(value)
      return enabled
    },
  },
  style: {
    setProperty(name: string, value: string) { styles.set(name, value) },
    removeProperty(name: string) { styles.delete(name) },
  },
  animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
    let resolve!: () => void
    const finished = new Promise<void>((done) => { resolve = done })
    const record = { frames, options, currentTime: 0, cancelled: false, resolve }
    animations.push(record)
    return {
      get currentTime() { return record.currentTime },
      set currentTime(value) { record.currentTime = Number(value || 0) },
      finished,
      cancel() { record.cancelled = true },
    } as unknown as Animation
  },
} as unknown as HTMLElement

const motion = createPlaylistDiscMotion(node, { reduced: false, morphDelay: 0 })
motion.update({ active: true, playing: true })
assert.equal(classes.has('is-disc'), true, 'playing playlist cover becomes a record')
assert.equal(animations.length, 1, 'playing starts one continuous spin animation')
assert.deepEqual(animations[0]!.frames, [{ rotate: '0deg' }, { rotate: '360deg' }])
assert.equal(animations[0]!.options.duration, PLAYLIST_DISC_SPIN_MS)
assert.equal(animations[0]!.options.iterations, Infinity)

animations[0]!.currentTime = PLAYLIST_DISC_SPIN_MS / 4
motion.update({ active: true, playing: false })
assert.equal(classes.has('is-disc'), false, 'pausing restores the rectangular cover shape')
assert.equal(animations[0]!.cancelled, true, 'pause stops the endless spin')
assert.equal(animations.length, 2, 'pause creates a return-to-zero animation')
assert.deepEqual(animations[1]!.frames, [{ rotate: '90deg' }, { rotate: '360deg' }])
assert.equal(animations[1]!.options.duration, PLAYLIST_DISC_RESET_MS)

animations[1]!.resolve()
await setImmediate()
assert.equal(styles.get('rotate'), '0deg', 'paused cover settles at the canonical upright angle')

motion.update({ active: true, playing: true })
assert.equal(classes.has('is-disc'), true, 'resuming morphs the cover back into a record')
assert.equal(animations.length, 3, 'resuming from upright starts spinning again immediately')

motion.update({ active: false, playing: true })
assert.equal(classes.has('is-disc'), false, 'leaving the active playlist clears record styling')
assert.equal(styles.get('rotate'), '0deg', 'inactive playlist cover is reset immediately')

const reducedAnimations = [...animations]
const reduced = createPlaylistDiscMotion(node, { reduced: true, morphDelay: 0 })
reduced.update({ active: true, playing: true })
assert.equal(classes.has('is-disc'), true, 'reduced motion still exposes the record shape while playing')
assert.equal(animations.length, reducedAnimations.length, 'reduced motion does not spin the cover')
reduced.update({ active: true, playing: false })
assert.equal(classes.has('is-disc'), false, 'reduced motion pause also restores the rectangular cover')
reduced.destroy()
motion.destroy()

console.log('playlist disc motion: playing record, pause rectangle, resume, deactivate and reduced-motion checks passed')
