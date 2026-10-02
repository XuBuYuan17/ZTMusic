// 移动端滑动时收起底部 chrome（底栏淡出 + 播放条下降到底栏槽位），停手后恢复。

const HIDE_DELAY = 1000
const TOP_GUARD = 8
const CLASS = 'mobile-chrome-hidden'

export interface ScrollChrome {
  /** 标记用户是否正在触摸 / 滚轮操作 */
  interact(on: boolean): void
  scroll(top: number): void
  destroy(): void
}

/**
 * 纯状态机，不碰 DOM（apply 由调用方决定怎么写）。
 *
 * interact 这道门不是多余状态：滚动容器上的 scroll 事件不全来自用户 ——
 * 滚动位置恢复、点当前标签的平滑滚动都会派发。不区分的话每次返回上一页底栏都会闪一下。
 * 触摸/滚轮期间才隐藏，程序化滚动时 interacting 已是 false（pointerup 早于 click 派发的平滑滚动）。
 *
 * 惯性滚动（touchend 之后）仍持续派发 scroll 事件，恢复定时器每次都被重置，
 * 所以底栏会一直隐到真正停稳 —— 正是想要的。
 */
export function createScrollChrome(apply: (hidden: boolean) => void, delay = HIDE_DELAY): ScrollChrome {
  let timer: ReturnType<typeof setTimeout> | undefined
  let hidden = false
  let interacting = false
  const set = (next: boolean) => {
    if (next === hidden) return
    hidden = next
    apply(next)
  }
  const restore = () => {
    clearTimeout(timer)
    if (!interacting && hidden) timer = setTimeout(() => set(false), delay)
  }
  return {
    interact(on) { interacting = on; restore() },
    scroll(top) {
      clearTimeout(timer)
      // 回到顶部直接恢复，不用等满 delay
      if (top <= TOP_GUARD) return set(false)
      if (interacting) set(true)
      restore()
    },
    destroy() {
      clearTimeout(timer)
      set(false)
    },
  }
}

/** 挂在移动端滚动容器（.mobile-page-content）上。 */
export function scrollChrome(node: HTMLElement) {
  const root = document.documentElement
  const chrome = createScrollChrome((hidden) => root.classList.toggle(CLASS, hidden))
  const onScroll = () => { if (!root.classList.contains('mobile-panel-open')) chrome.scroll(node.scrollTop) }
  const on = () => chrome.interact(true)
  const off = () => chrome.interact(root.classList.contains('mobile-panel-open'))
  let wheelTimer: ReturnType<typeof setTimeout> | undefined
  const wheel = () => {
    if (root.classList.contains('mobile-panel-open')) return
    clearTimeout(wheelTimer)
    chrome.interact(true)
    wheelTimer = setTimeout(off, 80)
  }
  let resetPending = false
  const reset = () => {
    if (root.classList.contains('mobile-panel-open')) { resetPending = true; return }
    resetPending = false
    chrome.interact(false)
    chrome.scroll(0)
  }
  let panelOpen = root.classList.contains('mobile-panel-open')
  const observer = new MutationObserver(() => {
    const next = root.classList.contains('mobile-panel-open')
    if (next !== panelOpen) {
      panelOpen = next
      if (!next && resetPending) reset()
      else chrome.interact(next)
    }
  })
  observer.observe(root, { attributes: true, attributeFilter: ['class'] })
  const events: [string, EventListener][] = [
    ['pointerdown', on], ['pointerup', off], ['pointercancel', off],
    ['touchstart', on], ['touchend', off], ['touchcancel', off],
    ['wheel', wheel],
  ]
  node.addEventListener('scroll', onScroll, { passive: true })
  for (const [type, handler] of events) node.addEventListener(type, handler, { passive: true })
  window.addEventListener('pointerup', off, { passive: true })
  window.addEventListener('pointercancel', off, { passive: true })
  node.addEventListener('mobile-view-change', reset)
  return {
    destroy() {
      clearTimeout(wheelTimer)
      observer.disconnect()
      window.removeEventListener('pointerup', off)
      window.removeEventListener('pointercancel', off)
      node.removeEventListener('mobile-view-change', reset)
      node.removeEventListener('scroll', onScroll)
      for (const [type, handler] of events) node.removeEventListener(type, handler)
      chrome.destroy()
      // MobileApp 横屏卸载后 class 不能留在 <html> 上，否则 PC 外壳会带着它
      root.classList.remove(CLASS)
    },
  }
}
