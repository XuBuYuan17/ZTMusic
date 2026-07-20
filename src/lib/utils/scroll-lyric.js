/**
 * scrollLyricIntoView — centre the active lyric line within its container.
 *
 * Both players scroll the highlighted line into view with a smooth animation;
 * they only differ in which line element to target and how high to place it
 * (PC centres at 0.5, the mobile Apple-Music view biases to 0.25 from the top).
 *
 * @param {HTMLElement} container scrollable lyrics container
 * @param {number} index highlighted line index (<0 = no-op)
 * @param {string} selector CSS selector for lyric line elements
 * @param {number} [ratio=0.5] vertical anchor: 0 = top, 0.5 = centre
 */
export function scrollLyricIntoView(container, index, selector, ratio = 0.5) {
  if (!container || index < 0) return
  const target = container.querySelectorAll(selector)[index]
  if (!target) return
  const offset = target.offsetTop - container.clientHeight * ratio + target.clientHeight / 2
  container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
}
