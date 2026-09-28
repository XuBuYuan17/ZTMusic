/**
 * scrollLyricIntoView — centre the active lyric line within its container.
 *
 * Both players scroll the highlighted line into view with a smooth animation;
 * they only differ in which line element to target and how high to place it
 * (PC centres at 0.5, the mobile Apple-Music view biases to 0.25 from the top).
 */

/** 只需这三项的最小结构，HTMLElement 与测试桩都满足 */
export interface ScrollContainer {
  clientHeight: number
  scrollTop: number
  querySelectorAll(selector: string): ArrayLike<{ offsetTop: number; clientHeight: number }>
  scrollTo(options: ScrollToOptions): void
}

// 每容器一个 rAF 句柄：新调用先取消旧补间，避免多次 scrollTo 叠加追赶
const rafByContainer = new WeakMap<ScrollContainer, number>()

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

export function scrollLyricIntoView(
  container: ScrollContainer | null | undefined,
  index: number,
  selector: string,
  ratio: number = 0.5,
  behavior: ScrollBehavior = 'smooth',
): void {
  if (!container || index < 0) return
  const target = container.querySelectorAll(selector)[index]
  if (!target) return
  const top = Math.max(0, target.offsetTop - container.clientHeight * ratio + target.clientHeight / 2)

  const cancelPending = (): void => {
    const pending = rafByContainer.get(container)
    if (pending !== undefined) cancelAnimationFrame(pending)
    rafByContainer.delete(container)
  }

  // rAF 补间：免浏览器内核差异（WebView / 旧 Chromium smooth 行为不一致）。
  if (behavior !== 'smooth') {
    cancelPending()
    container.scrollTo({ top, behavior: 'instant' })
    return
  }

  // ponytail: 不用 getScrollAnimations()（Chrome 115+ 才有），WebView 内核不确定，手动补间可控性更好。
  const start = container.scrollTop ?? 0
  const delta = top - start
  const duration = 320
  const t0 = performance.now()
  cancelPending()

  // 位移极小：跳过补间，直接到位（避免 rAF 循环空转一帧）
  if (Math.abs(delta) < 1) {
    container.scrollTo({ top })
    return
  }

  const step = (now: number): void => {
    const t = Math.min(1, (now - t0) / duration)
    container.scrollTo({ top: start + delta * easeOutCubic(t) })
    if (t < 1) {
      rafByContainer.set(container, requestAnimationFrame(step))
    } else {
      rafByContainer.delete(container)
    }
  }
  rafByContainer.set(container, requestAnimationFrame(step))
}
