import { reducedMotion } from './desktop-motion.ts'

export function placeLyricMenu(anchor: { left: number; right: number; bottom: number }, width: number, height: number, viewportWidth: number, viewportHeight: number, topInset = 0) {
  const margin = 12
  const menuWidth = Math.min(width, Math.max(0, viewportWidth - margin * 2))
  const maxHeight = Math.max(0, viewportHeight - topInset - margin * 2)
  const right = anchor.right + 10
  const left = right + menuWidth <= viewportWidth - margin ? right : anchor.left - menuWidth - 10
  return {
    left: Math.max(margin, Math.min(left, viewportWidth - menuWidth - margin)),
    top: Math.max(topInset + margin, Math.min(anchor.bottom - Math.min(height, maxHeight), viewportHeight - Math.min(height, maxHeight) - margin)),
    width: menuWidth,
    maxHeight,
  }
}

export function menuKeyIndex(key: string, current: number, count: number): number | null {
  if (!count) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return (current + 1) % count
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1
  return null
}

type LyricMenuOptions = { anchor: HTMLElement; close: () => void; width?: number }

export function lyricMenu(node: HTMLElement, { anchor, close, width = 240 }: LyricMenuOptions) {
  const layer = anchor.closest('.pm-focus')
  if (layer) layer.append(node)
  function position() {
    const root = document.documentElement
    const inset = root.classList.contains('desktop-titlebar') ? parseFloat(getComputedStyle(root).getPropertyValue('--titlebar-h')) || 0 : 0
    const rect = placeLyricMenu(anchor.getBoundingClientRect(), width, node.scrollHeight + 2, window.innerWidth, window.innerHeight, inset)
    Object.assign(node.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, maxHeight: `${rect.maxHeight}px` })
  }
  function outside(event: PointerEvent) {
    if (event.target instanceof Node && !node.contains(event.target) && !anchor.contains(event.target)) close()
  }
  function key(event: KeyboardEvent) {
    const items = [...node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const index = menuKeyIndex(event.key, items.indexOf(document.activeElement as HTMLButtonElement), items.length)
    if (index === null) return
    event.preventDefault()
    event.stopPropagation()
    items[index]?.focus({ preventScroll: true })
    items[index]?.scrollIntoView({ block: 'nearest' })
  }
  position()
  const observer = new ResizeObserver(position)
  observer.observe(node)
  window.addEventListener('resize', close)
  document.addEventListener('pointerdown', outside, true)
  node.addEventListener('keydown', key)
  return {
    // 子面板比主菜单宽。内联 width 是这里写进去的，CSS 改不动它，所以只能在这儿跟着改。
    // 只认 width：Svelte 对对象字面量每次都判为「变了」，不做这个判断的话
    // 歌词页 currentTime 每 tick 都会触发一次 getBoundingClientRect 重排。
    // anchor / close 换新值这里不处理（会留下旧闭包），调用方传的都是稳定引用
    update(next: LyricMenuOptions) {
      const nextWidth = next.width ?? 240
      if (nextWidth === width) return
      width = nextWidth
      position()
    },
    destroy() {
      observer.disconnect()
      window.removeEventListener('resize', close)
      document.removeEventListener('pointerdown', outside, true)
      node.removeEventListener('keydown', key)
    },
  }
}

export function lyricMenuTransition(_node: Element) {
  return { duration: reducedMotion() ? 0 : 150, css: (t: number) => `opacity:${t};transform:translateY(${(1 - t) * 4}px)` }
}
