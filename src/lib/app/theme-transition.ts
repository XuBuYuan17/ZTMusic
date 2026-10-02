interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

interface TransitionGeometry {
  x: number
  y: number
  radius: number
}

export function getThemeTransitionGeometry(rect: RectLike | null | undefined, viewportWidth: number, viewportHeight: number): TransitionGeometry {
  const x = rect ? rect.left + rect.width / 2 : viewportWidth / 2
  const y = rect ? rect.top + rect.height / 2 : viewportHeight / 2
  const radius = Math.ceil(Math.hypot(
    Math.max(x, viewportWidth - x),
    Math.max(y, viewportHeight - y),
  ))
  return { x, y, radius }
}

interface PendingViewTransition {
  ready: Promise<unknown>
  finished: Promise<unknown>
  skipTransition?: () => void
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => Promise<void> | void) => PendingViewTransition
}

interface ThemeTransitionOptions {
  getTheme: () => string
  setTheme: (theme: string) => void
  tick: () => Promise<unknown> | unknown
}

export function createThemeTransition({ getTheme, setTheme, tick }: ThemeTransitionOptions): (event?: MouseEvent, theme?: string) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let activeTransition: PendingViewTransition | null = null
  let mobileGeneration = 0

  return function toggleTheme(event?: MouseEvent, theme?: string): void {
    const shell = document.querySelector('.app-shell')
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const nextTheme = theme ?? (getTheme() === 'dark' ? 'light' : 'dark')
    if (nextTheme === getTheme()) return
    clearTimeout(timer)
    activeTransition?.skipTransition?.()

    const root = document.documentElement
    if (root.classList.contains('mobile-runtime')) {
      const generation = ++mobileGeneration
      root.classList.add('mobile-theme-switching')
      setTheme(nextTheme)
      Promise.resolve(tick()).then(() => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (generation === mobileGeneration) root.classList.remove('mobile-theme-switching')
        }))
      })
      return
    }

    const currentTarget = event?.currentTarget as { getBoundingClientRect?: () => RectLike } | null
    const rect = currentTarget?.getBoundingClientRect?.()
    const { x, y, radius } = getThemeTransitionGeometry(rect, window.innerWidth, window.innerHeight)

    const doc = document as DocumentWithViewTransition
    if (!reduceMotion && doc.startViewTransition && typeof root.animate === 'function') {
      const transition = doc.startViewTransition(async () => {
        setTheme(nextTheme)
        await tick()
      })!
      activeTransition = transition
      shell?.classList.add('theme-view-transitioning')

      transition.ready.then(() => {
        const animation = root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: 520,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        )
        animation.finished.catch(() => {})
      }).catch(() => {})

      const cleanup = () => {
        if (activeTransition !== transition) return
        activeTransition = null
        shell?.classList.remove('theme-view-transitioning')
        clearTimeout(timer)
      }
      transition.finished.then(cleanup, cleanup)
      timer = setTimeout(cleanup, 700)
      return
    }

    shell?.classList.add('theme-transitioning')
    setTheme(nextTheme)
    timer = setTimeout(() => shell?.classList.remove('theme-transitioning'), reduceMotion ? 0 : 320)
  }
}
