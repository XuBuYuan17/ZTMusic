/**
 * 页面滚动视口契约。
 *
 * 外壳（DesktopPageHost / MobileApp）提供，页面只消费；页面不再靠
 * `html.mobile-runtime` class 或 `.content-scroll` / `.mobile-page-content`
 * 去猜自己长在哪、谁在滚。
 *
 * 只暴露页面真正需要的信息：滚动容器本身、可见区域上沿（吸顶阈值）、
 * 以及「我进来了」这一事件（是否复位滚动由外壳决定）。
 */
import { getContext, setContext } from 'svelte'

export interface ScrollViewport {
  /** 滚动容器元素；外壳挂载完成前为 null */
  element(): HTMLElement | null
  /** 可见区域上沿（client 坐标，即容器 rect.top），吸顶判断用 */
  top(): number
  /** 页面刚进入时通知外壳；是否把滚动位置复位由外壳负责 */
  entered(): void
  /** 外壳已按路由记录并恢复滚动，页面不再重复接管 */
  restoresScroll?: boolean
}

const KEY = Symbol('scroll-viewport')

export function setScrollViewport(viewport: ScrollViewport): void {
  setContext(KEY, viewport)
}

/** 没有外壳提供时返回 null，页面需自行降级（不抛错） */
export function getScrollViewport(): ScrollViewport | null {
  return getContext<ScrollViewport | null>(KEY) ?? null
}

/**
 * 按 key 记住滚动位置（例如「返回后回到原来的位置」）。
 *
 * 页面在初始化时取得 viewport，挂载时调用 `trackScrollTop(key, viewport)`，它自己监听滚动并记录；
 * 返回该页面时调用 `restoreScrollTop(key, viewport)` 复位。key 由页面自己定，
 * 通常就是视图名 + 资源标识。
 */
const scrollPositions = new Map<string, number>()

export function trackScrollTop(key: string, viewport: ScrollViewport | null): () => void {
  if (viewport?.restoresScroll) return () => {}
  const element = viewport?.element()
  if (!element) return () => {}
  let frame = 0
  const onScroll = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      scrollPositions.set(key, element.scrollTop)
    })
  }
  element.addEventListener('scroll', onScroll, { passive: true })
  return () => {
    element.removeEventListener('scroll', onScroll)
    if (frame) cancelAnimationFrame(frame)
  }
}

export function restoreScrollTop(key: string, viewport: ScrollViewport | null): () => void {
  if (viewport?.restoresScroll) return () => {}
  const top = scrollPositions.get(key)
  if (top === undefined) return () => {}
  const apply = () => {
    const element = viewport?.element()
    if (element) element.scrollTop = top
  }
  apply()
  const frame = requestAnimationFrame(apply)
  return () => cancelAnimationFrame(frame)
}
