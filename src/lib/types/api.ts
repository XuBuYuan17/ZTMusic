/**
 * API 链路的共享类型。浏览器走 fetch + Vite proxy，Tauri 走 invoke('api_request')，
 * 两条链路共用这里的请求/响应模型。
 */

export type ApiProviderId = string

export type HttpMethod = 'GET' | 'POST'

/** query / 表单参数：null / undefined 在拼装时跳过 */
export type RequestParamValue = string | number | boolean | null | undefined
export interface RequestParams {
  [key: string]: RequestParamValue
}

export interface ApiRequestOptions {
  provider?: ApiProviderId
  /** 跳过 cookie 注入（默认注入当前会话 cookie） */
  noCookie?: boolean
  /** 注入随机国内 IP 参数，默认 true */
  randomCNIP?: boolean
  /** 跳过读缓存、强制重新请求 */
  refresh?: boolean
  /** 非 2xx 也解析响应体（登录等接口把错误码放在 body 里） */
  allowErrorBody?: boolean
  saveCookie?: boolean
  /** 浏览器链路的 fetch credentials */
  browserCredentials?: RequestCredentials
  signal?: AbortSignal
  /** 缓存开关 / 自定义 TTL（毫秒，0 = 不缓存） */
  cache?: boolean
  cacheTtl?: number
}

/**
 * invoke('api_request') 的请求载荷。
 * 字段必须与 src-tauri/src/api.rs 反序列化的结构保持一致。
 */
// 与 src-tauri/src/lib.rs 的 ApiRequest（camelCase）对齐：
// provider / cookie / body / allowErrorBody 在 Rust 端都是 Option
export interface ApiRequestPayload {
  provider?: ApiProviderId
  base: string
  endpoint: string
  params: RequestParams
  method: HttpMethod
  body: RequestParams | null
  cookie: string
  allowErrorBody: boolean
}

/** invoke 返回值的外层包装，与 Rust 端 ApiResponse 对齐 */
export interface ApiInvokeResult {
  data: ApiResponse
  cookie: string
}

/** 网易云风格响应信封：HTTP 恒 200，成败看 body.code；部分接口没有 code */
export interface ApiResponse {
  code: number
  message?: string
  msg?: string
  [key: string]: unknown
}

export interface ApiSession {
  getBase(): string
  setBase(base: string): void
  getCookie(): string
  setCookie(cookie: string): void
  clearCookie(): void
  saveCookieFromResponse(data: unknown, rawCookie?: string): void
}

/** createApiCacheKey 的输入；cookie 参与 hash，避免跨账号串缓存 */
export interface ApiCacheKeyInput {
  base: string
  endpoint: string
  params: RequestParams | null
  body: RequestParams | null
  cookie: string
  ttl: number
}

/** (endpoint, method, options) => TTL 毫秒，0 表示不缓存 */
export type CacheTtlResolver = (
  endpoint: string,
  method: HttpMethod,
  options?: ApiRequestOptions,
) => number
