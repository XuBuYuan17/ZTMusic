/**
 * 原生外壳守卫：仅在 Tauri 打包环境启用，抹去浏览器专属行为。
 *
 * - 屏蔽刷新/查找/打印/缩放等浏览器快捷键（F5、Ctrl+R/F/P/G、Ctrl±）
 * - 屏蔽空白区域的浏览器右键菜单（应用内自定义菜单自行 stopPropagation 即可保留）
 * - 打上 html.native-shell 类，激活对应的原生化 CSS
 *
 * 浏览器开发环境（无 __TAURI_INTERNALS__）下 install() 直接空转，不影响调试。
 */

const BLOCKED_CTRL_KEYS = new Set(['r', 'f', 'p', 'g', '+', '-', '='])

export function isNativeShell() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

function onKeyDown(e) {
  const k = e.key.toLowerCase()
  // F5 及其修饰组合（Shift+F5 = 硬刷新）都拦；F3 仅在 Ctrl 组合时拦（避免误伤自定义无修饰快捷键）
  if (k === 'f5') {
    e.preventDefault()
    return
  }
  if (k === 'f3' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    return
  }
  if ((e.ctrlKey || e.metaKey) && BLOCKED_CTRL_KEYS.has(k)) {
    e.preventDefault()
  }
}

function onContextMenu(e) {
  // 自定义菜单会 stopPropagation，冒泡到这里的都是空白/原生区域
  e.preventDefault()
}

/**
 * 安装原生外壳守卫。
 * @returns {() => void} 卸载函数
 */
export function installNativeShell() {
  if (!isNativeShell()) return () => {}

  document.documentElement.classList.add('native-shell')
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('contextmenu', onContextMenu)

  return () => {
    document.documentElement.classList.remove('native-shell')
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('contextmenu', onContextMenu)
  }
}
