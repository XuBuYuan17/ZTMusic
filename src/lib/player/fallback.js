/**
 * FallbackController — URL 遍历与重试控制。
 *
 * 职责：管理 URL 列表的遍历、重试和 fill-fallback 等待。
 * 不涉及播放引擎、队列或 UI 状态，纯状态机逻辑。
 *
 * ponytail: 同步状态机，无事件发射器 ── caller 通过 next() 返回值决定下一步。
 * 如果需要多个观察者同时监听状态迁移（日志 + metrics + UI），
 * 换成基于事件或 $state 的方案。
 *
 * 用法：
 *   const ctl = createFallbackController(urls)
 *   const r = ctl.next()
 *   if (r.status === 'playing') engine.load(r.url)
 *   // 播放失败时再调 ctl.next() 即可
 */

/**
 * @param {string[]} urls - 初始 URL 列表
 * @returns {{
 *   next: () => { status: 'playing', url: string } | { status: 'waiting' } | { status: 'exhausted' },
 *   updateUrls: (newUrls: string[]) => void,
 *   removeUrl: (badUrl: string) => void,
 *   setFillPending: (pending: boolean) => void,
 *   getState: () => { index: number, total: number, fillPending: boolean },
 * }}
 */
export function createFallbackController(urls) {
  let urlList = Array.isArray(urls) ? [...urls] : []
  let index = -1
  let fillPending = false

  /** 获取下一个可尝试的 URL */
  function next() {
    if (index + 1 < urlList.length) {
      index++
      return { status: 'playing', url: urlList[index] }
    }
    if (fillPending) return { status: 'waiting' }
    return { status: 'exhausted' }
  }

  /** 替换 URL 列表（切歌或 fill 完成），复位到第一个 */
  function updateUrls(newUrls) {
    urlList = Array.isArray(newUrls) ? [...newUrls] : []
    index = -1
    fillPending = false
  }

  /** 从列表中移除一个失败的 URL，自动调整当前索引 */
  function removeUrl(badUrl) {
    const idx = urlList.indexOf(badUrl)
    if (idx < 0) return
    urlList.splice(idx, 1)
    if (idx <= index) index--
    if (index < -1) index = -1
  }

  function setFillPending(pending) { fillPending = pending }
  function cancelFill() { fillPending = false }

  function getState() {
    return { index, total: urlList.length, fillPending, urls: urlList }
  }

  /** 获取当前 URL 列表的副本 */
  function getUrls() {
    return [...urlList]
  }

  return { next, updateUrls, removeUrl, setFillPending, cancelFill, getState, getUrls }
}
