/**
 * 响应式设备检测工具
 * 委托给 layout-mode.js 作为唯一真相源
 */

import { layoutMode, shouldUseMobileLayout } from './layout-mode.js'

const isBrowser = typeof window !== 'undefined'

export function isMobileDevice() {
  if (!isBrowser) return false
  return shouldUseMobileLayout(window.innerWidth, window.innerHeight)
}

export function isTouchDevice() {
  if (!isBrowser) return false
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

/**
 * 全局响应式状态（兼容旧代码，内部委托 layoutMode）
 */
export const responsive = {
  subscribe(fn) {
    return layoutMode.subscribe(state => {
      fn({
        ...state,
        isTouch: isTouchDevice()
      })
    })
  }
}
