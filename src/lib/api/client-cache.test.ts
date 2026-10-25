/**
 * API 缓存去重自检：同一账号的重复调用应只发一次网络请求，换账号必须重新请求。
 * 跑法：node --experimental-strip-types src/lib/api/client-cache.test.ts
 * 退出码：0 = 过，1 = 挂。
 *
 * 这里用真实的 client.ts + 打桩 fetch 记录**网络请求次数**，
 * 而不是数调用点——两个调用点可能共用一个缓存，也可能真的打两次。
 */
import assert from 'node:assert/strict'

const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)) },
  removeItem: (key: string) => { store.delete(key) },
} as unknown as Storage

let fetches: string[] = []
const originalFetch = globalThis.fetch
globalThis.fetch = (async (url: unknown) => {
  fetches.push(String(url))
  return {
    ok: true,
    status: 200,
    json: async () => ({ code: 200, profile: { nickname: 'n', avatarUrl: '' } }),
  } as unknown as Response
}) as typeof fetch

const { ncm } = await import('./client.ts')
const { apiSession } = await import('./session.ts')

apiSession.setBase('https://api.test')
apiSession.setCookie('MUSIC_A_T=aaa; MUSIC_U=u1')

// ── 同一账号：重复调用只发一次网络请求 ──
fetches = []
await ncm.userDetail(42)
await ncm.userDetail(42)
assert.equal(fetches.length, 1, 'userDetail must be served from cache on the second call')

fetches = []
await ncm.userPlaylist(42)
await ncm.userPlaylist(42)
assert.equal(fetches.length, 1, 'userPlaylist already dedupes through the cache')

// ── 换账号：缓存键含 cookie，必须重新请求，不能读上一账号的缓存 ──
fetches = []
apiSession.setCookie('MUSIC_A_T=bbb; MUSIC_U=u2')
await ncm.userDetail(42)
assert.equal(fetches.length, 1, 'another account must fetch again instead of reusing the previous account cache')

// ── 同一账号但参数不同：不能命中 ──
fetches = []
await ncm.userDetail(43)
assert.equal(fetches.length, 1, 'different uid must not reuse the cached response')

globalThis.fetch = originalFetch
console.log('api cache dedupe: same-account dedupe and account isolation passed')
