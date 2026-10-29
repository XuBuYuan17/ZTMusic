import { animate, motionValue, type MotionValue } from 'motion'
import { decideSnap, panToProgress, sampleVelocity, travelRange, type Sample } from '../app/morph-geometry.ts'

export type SurfacePhase = 'closed' | 'dragging' | 'animating' | 'open'
export interface SurfaceState { phase: SurfacePhase; target: 0 | 1 }
interface SpringOptions {
  type: 'spring'
  stiffness: number
  damping: number
  mass: number
  velocity: number
  onComplete: () => void
}
interface ControllerOptions {
  reducedMotion?: () => boolean
  viewportHeight?: () => number
  now?: () => number
  animate?: (value: MotionValue<number>, target: number, options: SpringOptions) => { stop: () => void }
}

export function createPlayerSurfaceController(options: ControllerOptions = {}) {
  const sheetProgress = motionValue(0)
  const reduced = options.reducedMotion ?? (() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const height = options.viewportHeight ?? (() => window.innerHeight)
  const now = options.now ?? (() => performance.now())
  const spring = options.animate ?? ((value, target, settings) => animate(value, target, settings))
  const listeners = new Set<(state: SurfaceState) => void>()
  let phase: SurfacePhase = 'closed'
  let target: 0 | 1 = 0
  let generation = 0
  let disposed = false
  let animation: { stop: () => void } | undefined
  let startY = 0
  let startProgress = 0
  let dragProgress = 0
  let dragTarget: 0 | 1 = 0
  let travel = 1
  let samples: Sample[] = []

  function publish(next: SurfacePhase) {
    phase = next
    for (const listener of listeners) listener({ phase, target })
  }

  function stop() {
    const position = sheetProgress.get()
    generation++
    animation?.stop()
    animation = undefined
    sheetProgress.stop()
    // Motion may sample one final tick when stopped; preserve the last visible frame.
    sheetProgress.set(position)
  }

  function settle(next: 0 | 1, velocity = sheetProgress.getVelocity(), force = false) {
    if (disposed || (!force && ((phase === 'animating' && target === next) || phase === (next ? 'open' : 'closed')))) return
    stop()
    target = next
    const version = generation
    if (reduced()) {
      sheetProgress.jump(next)
      publish(next ? 'open' : 'closed')
      return
    }
    publish('animating')
    animation = spring(sheetProgress, next, {
      type: 'spring', stiffness: 180, damping: 25, mass: 1,
      velocity: Math.max(-10, Math.min(10, velocity)),
      onComplete: () => {
        if (disposed || version !== generation) return
        animation = undefined
        sheetProgress.set(next)
        publish(next ? 'open' : 'closed')
      },
    })
  }

  const controller = {
    sheetProgress,
    get phase() { return phase },
    get target() { return target },
    subscribe(listener: (state: SurfaceState) => void) {
      listeners.add(listener)
      listener({ phase, target })
      return () => { listeners.delete(listener) }
    },
    open() { settle(1) },
    close() { settle(0) },
    beginDrag(y: number, time = now()) {
      if (disposed) return
      dragTarget = target
      stop()
      startY = y
      startProgress = sheetProgress.get()
      dragProgress = startProgress
      travel = travelRange(height())
      samples = [{ y, t: time }]
      publish('dragging')
    },
    dragTo(y: number, time = now()) {
      if (disposed || phase !== 'dragging') return
      dragProgress = panToProgress(startProgress, y - startY, travel)
      if (!reduced()) sheetProgress.set(dragProgress)
      samples.push({ y, t: time })
      if (samples.length > 12) samples.shift()
    },
    release(time = now()) {
      if (disposed || phase !== 'dragging') return
      const velocity = Math.max(-10, Math.min(10, sampleVelocity(samples, time) / travel))
      settle(decideSnap(dragProgress, velocity), velocity)
    },
    cancelDrag() {
      if (phase === 'dragging') settle(dragTarget, 0)
    },
    refresh() {
      if (disposed || phase === 'closed') return
      if (phase === 'dragging') { controller.cancelDrag(); return }
      if (reduced()) {
        const destination = target
        stop()
        sheetProgress.jump(destination)
        publish(destination ? 'open' : 'closed')
      } else if (phase === 'animating') {
        settle(target, sheetProgress.getVelocity(), true)
      }
    },
    destroy() {
      if (disposed) return
      disposed = true
      stop()
      listeners.clear()
      sheetProgress.destroy()
    },
  }
  return controller
}

export type PlayerSurfaceController = ReturnType<typeof createPlayerSurfaceController>
