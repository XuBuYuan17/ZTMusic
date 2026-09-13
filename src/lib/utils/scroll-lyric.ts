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
  querySelectorAll(selector: string): ArrayLike<{ offsetTop: number; clientHeight: number }>
  scrollTo(options: ScrollToOptions): void
}

export function scrollLyricIntoView(
  container: ScrollContainer | null | undefined,
  index: number,
  selector: string,
  ratio: number = 0.5,
): void {
  if (!container || index < 0) return
  const target = container.querySelectorAll(selector)[index]
  if (!target) return
  const offset = target.offsetTop - container.clientHeight * ratio + target.clientHeight / 2
  container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
}
