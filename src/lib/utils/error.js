/**
 * 统一错误处理工具
 *
 * 用法：
 *   import { handleError } from '../utils/error.js'
 *
 *   catch (err) {
 *     return handleError('Player', err, '操作失败')
 *   }
 */

/**
 * 统一处理错误并返回标准错误对象
 * @param {string} context - 错误上下文标识，如 'Player' / 'URLResolver'
 * @param {Error|unknown} err - 原始错误
 * @param {string} [userMessage] - 面向用户的错误消息
 * @returns {{ error: true, message: string, detail: string }}
 */
export function handleError(context, err, userMessage) {
  const detail = err?.message || String(err || '未知错误')
  console.error(`[${context}]`, err)
  return {
    error: true,
    message: userMessage || detail || '未知错误',
    detail,
  }
}

/**
 * 静默处理错误（仅打印日志，不返回）
 * @param {string} context
 * @param {unknown} err
 */
export function swallowError(context, err) {
  if (err) {
    console.warn(`[${context}] (swallowed)`, err?.message || String(err))
  }
}
