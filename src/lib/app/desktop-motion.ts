import { mobileSheet } from './mobile-interaction.ts'
import { preloadCover } from '../utils/image.ts'

export const motion = { press: 90, release: 280, menu: 220, panel: 320, page: 300, lyrics: 480 } as const

export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function desktopPanel(node: Element, options: { duration?: number } = {}, context: { direction?: 'in' | 'out' | 'both' } = {}) {
  if (document.documentElement.classList.contains('mobile-runtime') && node.matches('.am-more-menu, .am-secondary-sheet')) return mobileSheet(node as HTMLElement, options, context)
  if (document.documentElement.classList.contains('mobile-runtime') || reducedMotion()) return { duration: 0 }
  const isMenu = node.getAttribute('role') === 'menu'
  // WAAPI：避免 Svelte css 补间把 translate/scale 转成 matrix 后与 transform: translateX(-50%) 嵌套合成
  const animation = node.animate(
    [{ opacity: 0, transform: 'translateY(8px) scale(0.97)', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }, { opacity: 1, transform: 'none' }],
    { duration: isMenu ? motion.menu : motion.panel, fill: 'backwards' },
  )
  return { duration: 0, destroy: () => animation.cancel() }
}

export function replaceAnimation() {
  let current: Animation | null = null
  let generation = 0
  return {
    run(node: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions, complete?: () => void) {
      const version = ++generation
      current?.cancel()
      const animation = node.animate(frames, options)
      current = animation
      animation.finished.then(() => {
        if (version !== generation) return
        if (options.fill !== 'forwards') { animation.cancel(); current = null }
        complete?.()
      }).catch(() => {})
    },
    cancel() { generation++; current?.cancel(); current = null },
  }
}

export function pageMotion(node: HTMLElement, value: { identity: string; direction: string }) {
  const animation = replaceAnimation()
  let identity = ''
  function update(next: typeof value) {
    if (next.identity === identity) return
    identity = next.identity
    if (document.documentElement.classList.contains('mobile-runtime')) return
    // 有待飞入的封面时不横移，否则目标 rect 会被 16px 带偏
    const x = freshOrigin() ? 0 : next.direction === 'back' ? -16 : next.direction === 'forward' ? 16 : 0
    animation.run(node, [{ opacity: .3, transform: `translate(${reducedMotion() ? 0 : x}px, 0)` }, { opacity: 1, transform: 'none' }], { duration: reducedMotion() ? 100 : motion.page, easing: 'cubic-bezier(.2,.8,.2,1)' })
  }
  update(value)
  return { update, destroy: () => animation.cancel() }
}

const handledPresses = new WeakSet<Event>()
export function desktopFeedback(node: HTMLElement) {
  let active: HTMLElement | null = null
  const animation = replaceAnimation()
  const targetSelector = 'button:not([disabled]):not(.artist-link):not(.artist-name), [data-motion="card"]'
  function down(event: PointerEvent) {
    if (handledPresses.has(event)) return
    if (event.button !== 0 || reducedMotion() || document.documentElement.classList.contains('mobile-runtime')) return
    const target = (event.target as Element).closest<HTMLElement>(targetSelector)
    if (!target || target.closest('[role="slider"], input, .track-table tbody, .queue-item, .profile-home__track-list, .user-page__tracks') || target.getAttribute('aria-disabled') === 'true') return
    if (active && active !== target) animation.cancel()
    handledPresses.add(event)
    active = target
    animation.run(target, [{ scale: getComputedStyle(target).scale }, { scale: target.dataset.motion === 'card' ? '.98' : '.96' }], { duration: motion.press, fill: 'forwards', easing: 'ease-out' })
  }
  function up(event: PointerEvent) {
    const target = active
    active = null
    if (!target) return
    animation.run(target, [{ scale: getComputedStyle(target).scale }, { scale: event.type === 'pointercancel' ? '1' : '1.015', offset: .55 }, { scale: '1' }], { duration: motion.release, easing: 'ease-out' })
  }
  node.addEventListener('pointerdown', down)
  node.addEventListener('click', rememberCardOrigin, true)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  return { destroy() { animation.cancel(); node.removeEventListener('pointerdown', down); node.removeEventListener('click', rememberCardOrigin, true); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) } }
}

// 卡片 → 详情页封面的共享元素飞入：点击时（捕获阶段，源页面卸载前）记下卡片封面的位置，
// 详情页封面挂载后用 fixed 克隆从源位置飞到目标位置。源 img 保留 data 标记，
// 移动端返回详情时会重新测它的当前位置，把封面反向飞回去。
interface CoverOrigin { rect: DOMRect; src: string; radius: string; at: number; source: HTMLImageElement }
let coverOrigin: CoverOrigin | null = null

function freshOrigin(): CoverOrigin | null {
  return coverOrigin && performance.now() - coverOrigin.at < 800 ? coverOrigin : null
}

export function hasCoverOrigin(): boolean { return !!freshOrigin() }

export function rememberCardOrigin(event: Event) {
  coverOrigin = null
  if (reducedMotion()) return
  if ((event.target as Element).closest('.library-card-play-btn, .library-card-actions')) return
  const card = (event.target as Element).closest<HTMLElement>('[data-motion="card"], .search-playlist-grid > button')
  const img = card?.querySelector<HTMLImageElement>('img')
  if (!img?.complete || !img.naturalWidth) return
  const rect = img.getBoundingClientRect()
  if (!rect.width) return
  const previous = document.querySelector<HTMLElement>('[data-shared-cover-return="true"]')
  if (previous && previous !== img) previous.removeAttribute('data-shared-cover-return')
  img.dataset.sharedCoverReturn = 'true'
  const own = getComputedStyle(img).borderRadius
  const radius = own && own !== '0px' ? own : getComputedStyle(img.parentElement!).borderRadius
  void preloadCover(img.dataset?.coverSource || img.currentSrc || img.src, 640)
  coverOrigin = { rect, src: img.currentSrc || img.src, radius, at: performance.now(), source: img }
}

export function flyCover(target: HTMLElement) {
  const origin = freshOrigin()
  if (!origin) return {}
  target.style.opacity = '0'
  const clone = document.createElement('img')
  clone.className = 'shared-cover-flight'
  clone.src = origin.src
  clone.alt = ''
  clone.setAttribute('aria-hidden', 'true')
  let animation: Animation | null = null
  let done = false
  const finish = () => {
    if (done) return
    done = true
    target.style.opacity = ''
    clone.remove()
  }
  // 等一帧让详情页完成布局（含滚回顶部）再测目标位置
  const frame = requestAnimationFrame(() => {
    if (coverOrigin === origin) coverOrigin = null
    const to = target.getBoundingClientRect()
    if (!to.width) { finish(); return }
    const from = origin.rect
    Object.assign(clone.style, { position: 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, objectFit: 'cover', zIndex: '30', pointerEvents: 'none', transformOrigin: '0 0', boxShadow: 'var(--shadow-lg)' })
    document.body.append(clone)
    const sx = from.width / to.width, sy = from.height / to.height
    const targetRadius = getComputedStyle(target).borderRadius
    const mobile = document.documentElement.classList.contains('mobile-runtime')
    animation = clone.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`, borderRadius: `calc(${origin.radius} / ${sx})` },
      { transform: 'none', borderRadius: targetRadius },
    ], { duration: mobile ? 420 : motion.panel + 60, easing: mobile ? 'cubic-bezier(.2,0,0,1)' : 'cubic-bezier(.22,1.18,.36,1)' })
    animation.finished.then(() => {
      // 真封面未解码完时稍等，避免落位瞬间闪空
      const img = target instanceof HTMLImageElement ? target : null
      Promise.race([img && !img.complete ? img.decode() : Promise.resolve(), new Promise(r => setTimeout(r, 400))]).catch(() => {}).finally(finish)
    }).catch(finish)
  })
  return { destroy() { cancelAnimationFrame(frame); animation?.cancel(); finish() } }
}

const layers: HTMLElement[] = []
const dialogClosers = new Map<HTMLElement, () => void>()
export function dismissTopDialog(): boolean {
  const top = layers.at(-1)
  const close = top && dialogClosers.get(top)
  if (!close) return false
  close()
  return true
}
const mobileIsolation = new Map<HTMLElement, number>()
const bottomPanels = new Map<HTMLElement, () => void>()
export function dialogFocus(node: HTMLElement, close: () => void) {
  const previous = document.activeElement as HTMLElement | null
  const isolated: HTMLElement[] = []
  layers.push(node)
  dialogClosers.set(node, close)
  const mobile = document.documentElement.classList.contains('mobile-runtime')
  if (mobile) document.documentElement.classList.add('mobile-panel-open')
  if (mobile && node.matches('.queue-panel, .song-menu, .sort-sheet, [data-bottom-panel]')) {
    for (const [panel, dismiss] of bottomPanels) { panel.hidden = true; dismiss() }
    bottomPanels.set(node, close)
  }
  const items = () => [...node.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), textarea, select, a[href], [tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[inert]'))
  queueMicrotask(() => {
    if (!node.isConnected || layers.at(-1) !== node) return
    if (document.documentElement.classList.contains('mobile-runtime')) {
      let branch: HTMLElement = node
      while (branch.parentElement && branch !== document.body) {
        for (const sibling of branch.parentElement.children) {
          if (!(sibling instanceof HTMLElement) || sibling === branch || (sibling.inert && !mobileIsolation.has(sibling)) || sibling.matches('script, style, [class*="backdrop"], [class*="scrim"]')) continue
          mobileIsolation.set(sibling, (mobileIsolation.get(sibling) || 0) + 1)
          sibling.inert = true
          isolated.push(sibling)
        }
        branch = branch.parentElement
      }
    }
    ;(items()[0] || node).focus({ preventScroll: true })
  })
  function key(event: KeyboardEvent) {
    if (layers.at(-1) !== node) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close() }
    if (event.key === 'Tab') {
      const list = items(), first = list[0], last = list.at(-1)
      if (!first) { event.preventDefault(); node.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
  }
  window.addEventListener('keydown', key, true)
  return { destroy() {
    const top = layers.at(-1) === node
    const index = layers.indexOf(node)
    if (index >= 0) layers.splice(index, 1)
    dialogClosers.delete(node)
    if (mobile && !layers.length) document.documentElement.classList.remove('mobile-panel-open')
    bottomPanels.delete(node)
    isolated.forEach(element => {
      const owners = (mobileIsolation.get(element) || 1) - 1
      if (owners) mobileIsolation.set(element, owners)
      else { mobileIsolation.delete(element); element.inert = false }
    })
    window.removeEventListener('keydown', key, true)
    if (top && previous?.isConnected) queueMicrotask(() => {
      if (!previous.closest('[inert]')) previous.focus({ preventScroll: true })
    })
  } }
}
