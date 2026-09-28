type Loose = Record<string, unknown>

function rec(value: unknown): Loose | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Loose : null
}

/** 'valid' 登录有效 / 'expired' 服务端明确说失效 / 'unknown' 这次没问出来 */
export type LoginStatusVerdict = 'valid' | 'expired' | 'unknown'

/**
 * 判定 /login/status 的响应。
 *
 * 只有服务端「明确」说失效才算 expired：
 *   - code 301 / 302：需要登录（沿用 client.ts isAuthError 的口径）
 *   - anonimousUser：服务端把这次请求当匿名（登录态下 code 仍可能是 200）
 *
 * 其余一律 unknown —— 网关 502 错误信封、body 不是 JSON 时 client.ts 填的 code:-1、
 * 字段缺失都属此类。把 unknown 当 expired 会让一次网关抖动把用户登出，
 * 而 client.ts 的 isProxyBadGateway 正说明这个网关会抖。
 */
export function classifyLoginStatus(res: unknown): LoginStatusVerdict {
  const root = rec(res)
  const data = rec(root?.data)
  // code 可能在外层也可能在 data 内层，两处都要认
  const codes = [root?.code, data?.code].map(Number)
  const isAnon = rec(root?.account)?.anonimousUser === true || rec(data?.account)?.anonimousUser === true
  // 失效优先于有效：未登录时网易云返回的是 code:200 + account.anonimousUser:true
  if (isAnon || codes.includes(301) || codes.includes(302)) return 'expired'
  if (codes.includes(200)) return 'valid'
  return 'unknown'
}
