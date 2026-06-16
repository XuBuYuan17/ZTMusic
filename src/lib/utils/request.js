/**
 * 请求取消 / 竞态条件处理工具
 *
 * 当连续发起异步请求而只需要最新结果时（如切歌、搜索），
 * 使用 withCancel 自动忽略过期请求的回调。
 *
 * 用法：
 *   import { withCancel } from '../utils/request.js'
 *
 *   const result = await withCancel(async (isStale) => {
 *     for (const item of items) {
 *       if (isStale()) return null
 *       const data = await fetch(item)
 *       if (data) return data
 *     }
 *     return null
 *   })
 */

let currentRequestId = 0

/**
 * 包装异步函数，自动忽略过期（被取消）的请求结果
 * @template T
 * @param {(isStale: () => boolean) => Promise<T>} asyncFn
 * @returns {Promise<T>}
 */
export async function withCancel(asyncFn) {
  const reqId = ++currentRequestId
  const isStale = () => currentRequestId !== reqId

  try {
    const result = await asyncFn(isStale)
    if (isStale()) {
      throw createCancelledError()
    }
    return result
  } catch (err) {
    if (isStale() && isCancelledError(err)) {
      // 已取消，静默忽略
      return undefined
    }
    throw err
  }
}

/**
 * 创建一个标记为"已取消"的错误
 * @returns {Error & { __cancelled: true }}
 */
function createCancelledError() {
  const err = new Error('请求已取消')
  err.__cancelled = true
  return err
}

function isCancelledError(err) {
  return err?.__cancelled === true
}
