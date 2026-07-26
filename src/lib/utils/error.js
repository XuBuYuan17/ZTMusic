/**
 * 统一错误处理工具
 *
 * 用法：
 *   import { AppError, handleError } from '../utils/error.js'
 *
 *   catch (err) {
 *     return handleError('Player', err, '操作失败')
 *   }
 */

import { toast } from '../stores/toast.svelte.js'
import { ERROR_KIND, classifyError } from './error-core.js'

export { debugLog, swallowError } from './logging.js'
export { AppError, ERROR_KIND, classifyError, createErrorSnapshot, normalizeError } from './error-core.js'
/**
 * 统一处理错误并返回标准错误对象
 * @param {string} context - 错误上下文标识，如 'Player' / 'URLResolver'
 * @param {Error|unknown} err - 原始错误
 * @param {string} [userMessage] - 面向用户的错误消息
 * @returns {{ error: true, message: string, detail: string, kind: string }}
 */
export function handleError(context, err, userMessage) {
  const detail = err?.message || String(err || '未知错误')
  const kind = classifyError(err)
  console.error(`[${context}]`, err)
  return {
    error: true,
    kind,
    message: userMessage || detail || '未知错误',
    detail,
  }
}

/**
 * 分类错误并显示对应 toast。
 */
export function handleErrorWithToast(fallbackMessage, err) {
  const kind = classifyError(err)
  const msg = err?.message || fallbackMessage
  if (!toast) {
    console.error('[error]', err)
    return
  }
  switch (kind) {
    case ERROR_KIND.NETWORK:
      toast.error('网络连接失败，请检查网络')
      break
    case ERROR_KIND.TIMEOUT:
      toast.warning('请求超时，请重试')
      break
    case ERROR_KIND.AUTH:
      toast.warning('登录已过期，请重新登录')
      break
    case ERROR_KIND.TRIAL:
      toast.warning('该歌曲需要 VIP')
      break
    case ERROR_KIND.NO_URL:
      toast.error('无法获取播放地址')
      break
    default:
      toast.error(msg || fallbackMessage)
  }
}
