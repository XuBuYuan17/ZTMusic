/**
 * 统一错误处理工具
 *
 * 用法：
 *   import { AppError, handleError } from '../utils/error.ts'
 *
 *   catch (err) {
 *     return handleError('Player', err, '操作失败')
 *   }
 */

import { toast } from '../stores/toast.svelte.ts'
import { ERROR_KIND, classifyError } from './error-core.ts'

export { debugLog, swallowError, describeError } from './logging.ts'
export { AppError, ERROR_KIND, classifyError, createErrorSnapshot, normalizeError } from './error-core.ts'
export type { ErrorKind, AppErrorOptions } from './error-core.ts'

export interface HandledError {
  error: true
  message: string
  detail: string
  kind: string
}

/**
 * 统一处理错误并返回标准错误对象
 * @param context - 错误上下文标识，如 'Player' / 'URLResolver'
 * @param err - 原始错误
 * @param userMessage - 面向用户的错误消息
 */
export function handleError(context: string, err: unknown, userMessage?: string): HandledError {
  const rec = err && typeof err === 'object' ? err as { message?: unknown } : null
  const detail = rec && typeof rec.message === 'string' && rec.message
    ? rec.message
    : String(err || '未知错误')
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
export function handleErrorWithToast(fallbackMessage: string, err: unknown): void {
  const kind = classifyError(err)
  const msg = err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
    ? (err as { message: string }).message
    : fallbackMessage
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
