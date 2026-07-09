/**
 * 响应式设备检测工具
 */

import { shouldUseMobileLayout } from './layout-mode.js'

// 检查是否在浏览器环境
const isBrowser = typeof window !== 'undefined';

/**
 * 检测是否为移动端
 * @returns {boolean}
 */
export function isMobileDevice() {
  if (!isBrowser) return false;
  return shouldUseMobileLayout(window.innerWidth, window.innerHeight);
}

/**
 * 检测是否为触摸设备
 * @returns {boolean}
 */
export function isTouchDevice() {
  if (!isBrowser) return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * 创建响应式 store
 */
export function createResponsiveStore() {
  if (!isBrowser) {
    return {
      subscribe: (fn) => {
        fn({ isMobile: false, isTouch: false, width: 0, height: 0 });
        return () => {};
      }
    };
  }

  let current = {
    isMobile: isMobileDevice(),
    isTouch: isTouchDevice(),
    width: window.innerWidth,
    height: window.innerHeight
  };

  const subscribers = new Set();

  function update() {
    const next = {
      isMobile: isMobileDevice(),
      isTouch: isTouchDevice(),
      width: window.innerWidth,
      height: window.innerHeight
    };
    if (next.isMobile !== current.isMobile || 
        next.width !== current.width || 
        next.height !== current.height) {
      current = next;
      subscribers.forEach(fn => fn(current));
    }
  }

  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  window.addEventListener('layout-mode-change', update);

  return {
    subscribe(fn) {
      fn(current);
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }
  };
}

// 全局响应式状态
export const responsive = createResponsiveStore();
