export type ErrorKind =
  | 'unknown'
  | 'no_url'
  | 'network'
  | 'timeout'
  | 'auth'
  | 'trial'
  | 'media_not_supported'
  | 'media_aborted'
  | 'playback'

export const ERROR_KIND = {
  UNKNOWN: 'unknown',
  NO_URL: 'no_url',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  AUTH: 'auth',
  TRIAL: 'trial',
  MEDIA_NOT_SUPPORTED: 'media_not_supported',
  MEDIA_ABORTED: 'media_aborted',
  PLAYBACK: 'playback',
} as const satisfies Record<string, ErrorKind>

const MEDIA_ERROR_KIND: Record<number, ErrorKind> = {
  1: ERROR_KIND.MEDIA_ABORTED,
  2: ERROR_KIND.NETWORK,
  3: ERROR_KIND.PLAYBACK,
  4: ERROR_KIND.MEDIA_NOT_SUPPORTED,
}

export interface AppErrorOptions {
  kind?: ErrorKind
  code?: number
  retryable?: boolean
  detail?: string
  context?: string
  cause?: unknown
}

/**
 * 统一应用错误类
 * 标准化 Tauri 字符串错误 和 浏览器 Error 对象
 */
export class AppError extends Error {
  kind: ErrorKind
  code: number
  retryable: boolean
  detail: string
  context: string

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message)
    this.name = 'AppError'
    this.kind = options.kind || ERROR_KIND.UNKNOWN
    this.code = options.code || 0
    this.retryable = options.retryable !== false
    this.detail = options.detail || ''
    this.context = options.context || ''

    // 保持原始堆栈
    if (options.cause instanceof Error) {
      this.cause = options.cause
      this.stack = options.cause.stack
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      code: this.code,
      retryable: this.retryable,
      detail: this.detail,
      context: this.context,
    }
  }
}

function asRecord(err: unknown): Record<string, unknown> | null {
  if (err && typeof err === 'object') return err as Record<string, unknown>
  return null
}

/**
 * 将任意错误转换为标准化 AppError
 * @param err - Error 对象 / 字符串 / 数字
 * @param context - 错误上下文
 * @param defaultMessage - 默认消息
 */
export function normalizeError(err: unknown, context: string = '', defaultMessage: string = '未知错误'): AppError {
  if (err instanceof AppError) {
    if (!err.context) err.context = context
    return err
  }

  if (err instanceof Error) {
    return new AppError(err.message, {
      cause: err,
      kind: classifyError(err),
      context,
    })
  }

  // Tauri 返回的字符串错误
  if (typeof err === 'string') {
    return new AppError(err, {
      kind: classifyError({ message: err }),
      detail: err,
      context,
    })
  }

  return new AppError(defaultMessage, {
    kind: classifyError(err),
    detail: String(err),
    context,
  })
}

function errorText(err: unknown): string {
  const rec = asRecord(err)
  const name = rec && typeof rec.name === 'string' ? rec.name : ''
  const code = rec && (typeof rec.code === 'string' || typeof rec.code === 'number') ? String(rec.code) : ''
  const message = rec && typeof rec.message === 'string' ? rec.message : ''
  return `${name} ${code} ${message}`.toLowerCase()
}

function isTimeoutError(err: unknown): boolean {
  const text = errorText(err)
  return text.includes('timeout') || text.includes('timed out') || text.includes('aborterror')
}

function isNetworkError(err: unknown): boolean {
  const text = errorText(err)
  return text.includes('network') || text.includes('fetch') || text.includes('failed to fetch')
}

/**
 * 归类播放/请求错误，供 UI 提示和调试日志使用。
 */
export function classifyError(err: unknown): ErrorKind {
  if (!err) return ERROR_KIND.UNKNOWN
  const rec = asRecord(err)
  if (rec && typeof rec.kind === 'string' && Object.values(ERROR_KIND).includes(rec.kind as ErrorKind)) {
    return rec.kind as ErrorKind
  }
  if (rec && typeof rec.code === 'number' && MEDIA_ERROR_KIND[rec.code]) return MEDIA_ERROR_KIND[rec.code]!
  if (isTimeoutError(err)) return ERROR_KIND.TIMEOUT
  if (isNetworkError(err)) return ERROR_KIND.NETWORK
  return ERROR_KIND.UNKNOWN
}

/**
 * 创建最近错误快照，避免散落 console 难以追踪。
 */
export function createErrorSnapshot(
  context: string,
  err: unknown,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const rec = asRecord(err)
  const message = rec && typeof rec.message === 'string' && rec.message
    ? rec.message
    : String(err || '未知错误')
  return {
    context,
    kind: classifyError(err),
    message,
    time: Date.now(),
    ...extra,
  }
}
