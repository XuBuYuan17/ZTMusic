import { isMobileDevice } from '../utils/responsive.ts'

const ROOT_TRANSITION_CLASSES = [
  'layout-transitioning',
  'accent-color-transitioning',
] as const

const SHELL_TRANSITION_CLASSES = [
  'theme-view-transitioning',
  'theme-transitioning',
] as const

/**
 * Android WebView can suspend while a View Transition / theme transition is in
 * progress. When the surface is restored, stale transition classes may keep a
 * snapshot/composited layer around even though the real Svelte tree is alive.
 * Clear only transient classes; never reload or remount the application.
 */
export function clearInterruptedMobileTransitions(
  root: Pick<Element, 'classList'>,
  shell?: Pick<Element, 'classList'> | null,
): void {
  for (const className of ROOT_TRANSITION_CLASSES) root.classList.remove(className)
  if (!shell) return
  for (const className of SHELL_TRANSITION_CLASSES) shell.classList.remove(className)
}

/**
 * Reconcile the mobile shell after returning from the background and force one
 * compositor invalidation. The near-opaque one-frame animation is intentionally
 * visually imperceptible; its purpose is to make Android WebView redraw the
 * existing DOM surface without destroying navigation/player state.
 */
export function recoverMobileSurface(doc: Document = document, win: Window = window): boolean {
  if (!isMobileDevice()) return false

  const root = doc.documentElement
  const shell = doc.querySelector('.app-shell')
  clearInterruptedMobileTransitions(root, shell)
  root.classList.add('mobile-runtime')

  const app = doc.getElementById('app')
  if (!app) return false

  // Force style/layout to be committed before asking the compositor for a frame.
  void app.offsetHeight

  if (typeof app.animate === 'function') {
    try {
      const animation = app.animate(
        [{ opacity: 0.9999 }, { opacity: 1 }],
        { duration: 16, easing: 'linear' },
      )
      animation.finished.catch(() => {})
    } catch {
      // Old Android System WebView builds may expose animate() incompletely.
    }
  } else {
    // Reading layout above is still useful on older WebViews without WAAPI.
    void win.innerWidth
  }

  return true
}

/** Install once during bootstrap. Returns a cleanup function for tests/HMR. */
export function installMobileResumeGuard(doc: Document = document, win: Window = window): () => void {
  let wasBackgrounded = doc.visibilityState === 'hidden'
  let frame = 0

  const scheduleRecover = () => {
    if (frame) win.cancelAnimationFrame(frame)
    frame = win.requestAnimationFrame(() => {
      frame = 0
      recoverMobileSurface(doc, win)
    })
  }

  const onVisibilityChange = () => {
    if (doc.visibilityState === 'hidden') {
      wasBackgrounded = true
      return
    }
    if (!wasBackgrounded) return
    wasBackgrounded = false
    scheduleRecover()
  }

  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) scheduleRecover()
  }

  doc.addEventListener('visibilitychange', onVisibilityChange)
  win.addEventListener('pageshow', onPageShow)

  return () => {
    if (frame) win.cancelAnimationFrame(frame)
    doc.removeEventListener('visibilitychange', onVisibilityChange)
    win.removeEventListener('pageshow', onPageShow)
  }
}
