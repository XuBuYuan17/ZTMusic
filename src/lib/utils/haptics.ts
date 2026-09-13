let lastPulseAt = 0

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function hapticTap(duration: number = 8): boolean {
  if (!canVibrate()) return false
  const now = Date.now()
  if (now - lastPulseAt < 45) return false
  lastPulseAt = now
  try {
    navigator.vibrate(duration)
    return true
  } catch {
    return false
  }
}

interface HapticElement {
  closest?(selector: string): HapticElement | null
  disabled?: boolean
  getAttribute?(name: string): string | null
}

export function shouldHapticTarget(target: EventTarget | null | undefined): boolean {
  const source = target as HapticElement | null | undefined
  const el = source?.closest?.('button, a, [role="button"], input, select, textarea, [data-haptic]')
  if (!el) return false
  if (el.closest?.('[data-haptic="off"]')) return false
  if (el.disabled || el.getAttribute?.('aria-disabled') === 'true') return false
  return true
}
