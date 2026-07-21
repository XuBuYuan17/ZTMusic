function isMobileRuntime() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('mobile-runtime')
}

function isAndroidRuntime() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

export function installAndroidHistoryBack(onBack) {
  if (typeof window === 'undefined' || !isAndroidRuntime() || !isMobileRuntime()) return undefined

  const state = { zhetingBackGuard: true }
  history.replaceState(state, '', location.href)
  history.pushState(state, '', location.href)

  const handlePopState = (event) => {
    // forward/后退越过 guard 时，state 里不含标记 → 补一格 guard，避免 onBack 永远失效
    if (!event.state?.zhetingBackGuard) {
      history.pushState(state, '', location.href)
      return
    }
    if (!onBack()) return
    history.pushState(state, '', location.href)
  }

  window.addEventListener('popstate', handlePopState)
  return () => {
    window.removeEventListener('popstate', handlePopState)
    // 卸载时抵消 install 时 push 的那一格，避免残留空历史条目
    if (history.state?.zhetingBackGuard) history.back()
  }
}

export function installAndroidEdgeBack({ hasBackTarget, onBack }) {
  if (typeof window === 'undefined' || !isAndroidRuntime() || !isMobileRuntime()) return undefined

  const edgeWidth = 28
  const triggerDistance = 82
  const maxVerticalDrift = 56
  let startX = 0
  let startY = 0
  let tracking = false
  let triggered = false
  const ignore = (target) => target?.closest?.('input, textarea, select, [contenteditable="true"], .progress-bar, .progress-container, .volume-slider-inline, .home-quick-grid, .home-feature-row, .card-scroll')

  const down = (event) => {
    if (event.pointerType === 'mouse' || event.button !== 0 || !hasBackTarget() || event.clientX > edgeWidth || ignore(event.target)) return
    startX = event.clientX
    startY = event.clientY
    tracking = true
    triggered = false
  }
  const move = (event) => {
    if (!tracking || triggered) return
    const dx = event.clientX - startX
    const dy = Math.abs(event.clientY - startY)
    if (dx < 0 || dy > maxVerticalDrift) {
      tracking = false
      return
    }
    if (dx >= triggerDistance) {
      triggered = true
      tracking = false
      event.preventDefault()
      onBack()
    }
  }
  const stop = () => {
    tracking = false
    triggered = false
  }

  window.addEventListener('pointerdown', down, { passive: true })
  window.addEventListener('pointermove', move, { passive: false })
  window.addEventListener('pointerup', stop, { passive: true })
  window.addEventListener('pointercancel', stop, { passive: true })
  return () => {
    window.removeEventListener('pointerdown', down)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
  }
}