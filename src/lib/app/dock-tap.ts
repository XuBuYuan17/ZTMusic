export function createDockTapActions(single: () => void, double: () => void, delay = 320) {
  let timer: ReturnType<typeof setTimeout> | null = null
  function cancel(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  return {
    tap(keyboard = false): void {
      if (keyboard) { cancel(); single(); return }
      if (timer !== null) { cancel(); double(); return }
      timer = setTimeout(() => { timer = null; single() }, delay)
    },
    cancel,
    destroy: cancel,
  }
}
