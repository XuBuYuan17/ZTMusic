export function createThemeTransition({ getTheme, setTheme, tick }) {
  let timer

  return function toggleTheme(event) {
    const shell = document.querySelector('.app-shell')
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const nextTheme = getTheme() === 'dark' ? 'light' : 'dark'
    clearTimeout(timer)

    if (event?.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect?.()
      const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
      const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
      const root = document.documentElement
      root.style.setProperty('--theme-x', x + 'px')
      root.style.setProperty('--theme-y', y + 'px')
      root.style.setProperty('--theme-radius', Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))) + 'px')
    }

    shell?.classList.add('theme-transitioning')

    if (!reduceMotion && document.startViewTransition) {
      const transition = document.startViewTransition(async () => {
        setTheme(nextTheme)
        await tick()
      })
      // 单一定时器：外层 920ms 是唯一真源，避免 finished reject/finally 叠一个 860ms 造成闪烁
      timer = setTimeout(() => shell?.classList.remove('theme-transitioning'), 920)
      // 快速连点会中止上一个过渡，ready/finished 随之 reject；吞掉以免未捕获错误
      transition.ready.catch(() => {})
      transition.finished.catch(() => {})
      return
    }

    setTheme(nextTheme)
    timer = setTimeout(() => shell?.classList.remove('theme-transitioning'), 860)
  }
}