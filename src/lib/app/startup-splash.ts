export const MIN_SPLASH_MS = 2200
export const MAX_SPLASH_MS = 6000

type Clock = {
  now(): number
  schedule(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  cancel(timer: ReturnType<typeof setTimeout>): void
}

export function createSplashGate(finish: (timedOut: boolean) => void, clock: Clock = {
  now: () => performance.now(),
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: timer => clearTimeout(timer),
}) {
  let startedAt: number | undefined
  let ready = false
  let settled = false
  let minimum: ReturnType<typeof setTimeout> | undefined
  let maximum: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    if (minimum !== undefined) clock.cancel(minimum)
    if (maximum !== undefined) clock.cancel(maximum)
  }
  const settle = (timedOut: boolean) => {
    if (settled) return
    settled = true
    cancel()
    finish(timedOut)
  }
  const check = () => {
    if (settled || !ready || startedAt === undefined) return
    const remaining = MIN_SPLASH_MS - (clock.now() - startedAt)
    if (remaining <= 0) settle(false)
    else if (minimum === undefined) minimum = clock.schedule(() => settle(false), remaining)
  }
  return {
    start() {
      if (settled || startedAt !== undefined) return
      startedAt = clock.now()
      maximum = clock.schedule(() => settle(true), MAX_SPLASH_MS)
      check()
    },
    ready() { ready = true; check() },
    skip() { settle(true) },
    destroy() { settled = true; cancel() },
  }
}
