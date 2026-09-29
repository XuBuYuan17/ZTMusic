// 移动端滑动时收起底部 chrome（底栏淡出 + 播放条下降到底栏槽位），停手后恢复。

const HIDE_DELAY = 400
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
  return {
    interact(on) { interacting = on },
    scroll(top) {
      clearTimeout(timer)
      // 回到顶部直接恢复，不用等满 delay
      if (top <= TOP_GUARD) return set(false)
      if (interacting) set(true)
      timer = setTimeout(() => set(false), delay)
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
  const onScroll = () => chrome.scroll(node.scrollTop)
  const on = () => chrome.interact(true)
  const off = () => chrome.interact(false)
  const events: [string, EventListener][] = [
    ['pointerdown', on], ['pointerup', off], ['pointercancel', off],
    ['touchstart', on], ['touchend', off], ['touchcancel', off],
    ['wheel', on],
  ]
  node.addEventListener('scroll', onScroll, { passive: true })
  for (const [type, handler] of events) node.addEventListener(type, handler, { passive: true })
  return {
    destroy() {
      node.removeEventListener('scroll', onScroll)
      for (const [type, handler] of events) node.removeEventListener(type, handler)
      chrome.destroy()
      // MobileApp 横屏卸载后 class 不能留在 <html> 上，否则 PC 外壳会带着它
      root.classList.remove(CLASS)
    },
  }
}
