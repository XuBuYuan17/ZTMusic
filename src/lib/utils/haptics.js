let lastPulseAt = 0

export function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function hapticTap(duration = 8) {
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

export function shouldHapticTarget(target) {
  const el = target?.closest?.('button, a, [role="button"], input, select, textarea, [data-haptic]')
  if (!el) return false
  if (el.closest?.('[data-haptic="off"]')) return false
  if (el.disabled || el.getAttribute?.('aria-disabled') === 'true') return false
  return true
}
