// 横竖屏切换过渡：朝向真的翻转时，给整壳换位包一层 View Transition。
// 判定是纯函数（无 DOM），快照与合成交给浏览器。

export interface LayoutFlipInput {
  wasMobile: boolean
  isMobile: boolean
  prevWidth: number
  prevHeight: number
  width: number
  height: number
  touch: boolean
}

/** 朝向是否真的翻转（横↔竖）。任一尺寸为 0 视为未知，不算翻转。 */
export function orientationFlipped(prevWidth: number, prevHeight: number, width: number, height: number): boolean {
  if (!prevWidth || !prevHeight || !width || !height) return false
  return (prevWidth > prevHeight) !== (width > height)
}

/**
 * 只在触摸设备上、且朝向真的翻转时才动画。
 * 桌面拖拽窗口跨阈值时 touch 为 false，直接换壳不做过渡。
 *
 * ponytail: 带触摸屏的笔记本上拖拽窗口跨阈值也会动画。升级路径是叠加
 * orientationchange / screen.orientation 的一次性标志做二次确认。
 */
export function shouldAnimateLayoutFlip(input: LayoutFlipInput): boolean {
  if (input.wasMobile === input.isMobile) return false
  if (!input.touch) return false
  return orientationFlipped(input.prevWidth, input.prevHeight, input.width, input.height)
}

export function canViewTransition(): boolean {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
}

/**
 * 把 apply 包进一次 View Transition，期间在 <html> 挂 layout-transitioning
 * 供 CSS 作用域动画。apply 必须同步完成 DOM 更新（调用方负责 flushSync）。
 */
export function startLayoutTransition(apply: () => void): void {
  const root = document.documentElement
  const cleanup = () => root.classList.remove('layout-transitioning')
  root.classList.add('layout-transitioning')
  try {
    const transition = document.startViewTransition(apply)
    // ready 与 finished 在过渡被中断时都会 reject —— 旋转过程中视口尺寸还在变是常态，
    // 两个都要接住，否则会冒成 unhandledrejection（dev 端会上报给 Rust）。
    // 被中断只是没有动画，apply 已经跑过，DOM 不会卡在旧外壳上。
    transition.ready.catch(() => {})
    transition.finished.then(cleanup, cleanup)
  } catch {
    // 起不来也必须换壳，否则界面卡在错误的外壳上
    cleanup()
    apply()
  }
}
