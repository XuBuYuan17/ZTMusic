/**
 * 统一的返回决策。
 *
 * 页面返回按钮、外壳返回、Escape、Android 返回都走这里，顺序固定：
 *   最上层弹层 → 外壳浮层（导航抽屉 / 底部面板 / 播放队列）→ 页面历史
 *
 * 页面历史由外壳注入（`popPage`），弹层关闭由 `dismissDialog` 注入，
 * 这样这条规则可以在没有 DOM 的环境里被测试。
 */

export interface BackLayers {
  /** 导航抽屉，返回 true 表示这次返回被它消费 */
  drawer?: () => boolean
  /** 底部面板 */
  sheet?: () => boolean
  /** 播放队列面板 */
  queue?: () => boolean
}

export interface BackNavigationConfig {
  /** 关掉最上层弹层；返回是否真的有弹层被关掉 */
  dismissDialog?: () => boolean
  /** 退一级页面历史（不处理根视图兜底之外的逻辑） */
  popPage?: () => void
}

let dismissDialog: (() => boolean) | null = null
let popPage: (() => void) | null = null
let layers: BackLayers = {}

export function configureBackNavigation(config: BackNavigationConfig): void {
  if (config.dismissDialog) dismissDialog = config.dismissDialog
  if (config.popPage) popPage = config.popPage
}

export function registerBackLayers(next: BackLayers): void {
  layers = next
}

/**
 * 执行一次返回。返回 true 表示这次返回被处理了（调用方不需要再做别的）。
 * 页面历史为空时由 `popPage` 自己回退到根视图——它不会直接退出应用。
 */
export function requestBack(): boolean {
  try {
    if (dismissDialog?.()) return true
    if (layers.drawer?.()) return true
    if (layers.sheet?.()) return true
    if (layers.queue?.()) return true
    popPage?.()
    return popPage !== null
  } catch (error) {
    // 返回键不应该因为某层抛错就失效
    console.error('[back-navigation]', error)
    return false
  }
}
