/**
 * 请求取消 / 竞态条件处理工具
 *
 * 当连续发起异步请求而只需要最新结果时（如切歌、搜索），
 * 使用 withCancel 自动忽略过期请求的回调。
 *
 * 用法：
 *   import { withCancel } from '../utils/request.ts'
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
const _abortControllers = new Map<number, AbortController>()

type CancelledError = Error & { __cancelled: true }

/**
 * 包装异步函数，自动忽略过期（被取消）的请求结果。
 * 请求过期时 resolve 为 undefined（与原实现一致）。
 */
export async function withCancel<T>(
  asyncFn: (isStale: () => boolean, signal: AbortSignal) => Promise<T>,
): Promise<T | undefined> {
  const reqId = ++currentRequestId
  const controller = new AbortController()
  _abortControllers.set(reqId, controller)
  const isStale = () => currentRequestId !== reqId

  try {
    const result = await asyncFn(isStale, controller.signal)
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
  } finally {
    _abortControllers.delete(reqId)
  }
}

export function abortAllRequests(): void {
  for (const controller of _abortControllers.values()) {
    try { controller.abort() } catch { /* ignore */ }
  }
  _abortControllers.clear()
}

/** 创建一个标记为"已取消"的错误 */
function createCancelledError(): CancelledError {
  const err = new Error('请求已取消') as CancelledError
  err.__cancelled = true
  return err
}

function isCancelledError(err: unknown): err is CancelledError {
  return !!err && typeof err === 'object' && (err as { __cancelled?: unknown }).__cancelled === true
}
