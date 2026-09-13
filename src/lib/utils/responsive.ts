/**
 * 响应式设备检测工具
 * 委托给 layout-mode.ts 作为唯一真相源
 */

import { layoutMode, shouldUseMobileLayout, type LayoutState } from './layout-mode.ts'

type Unsubscriber = () => void

const isBrowser = typeof window !== 'undefined'

export function isMobileDevice(): boolean {
  if (!isBrowser) return false
  return shouldUseMobileLayout(window.innerWidth, window.innerHeight)
}

export function isTouchDevice(): boolean {
  if (!isBrowser) return false
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

export interface ResponsiveState extends LayoutState {
  isTouch: boolean
}

/**
 * 全局响应式状态（兼容旧代码，内部委托 layoutMode）
 */
export const responsive = {
  subscribe(fn: (state: ResponsiveState) => void): Unsubscriber {
    return layoutMode.subscribe(state => {
      fn({
        ...state,
        isTouch: isTouchDevice()
      })
    })
  }
}
