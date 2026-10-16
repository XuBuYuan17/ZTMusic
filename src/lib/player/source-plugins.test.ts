import {
  SOURCE_PLUGIN_STORAGE_KEY,
  createSourcePlugin,
  listSourcePlugins,
  moveSourcePlugin,
  removeSourcePlugin,
  resolveWithSourcePlugins,
  updateSourcePlugin,
  saveSourcePlugins,
} from './source-plugins.ts'

let passed = 0
let failed = 0

function assert(condition: unknown, message: string) {
  if (condition) passed++
  else { failed++; console.error('FAIL:', message) }
}

function equal(actual: unknown, expected: unknown, message: string) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, String(value)),
    removeItem: (key: string) => memory.delete(key),
    clear: () => memory.clear(),
  },
})

memory.clear()
equal(listSourcePlugins().length, 0, 'no third-party source is bundled by default')

const first = createSourcePlugin({ name: 'Home Resolver', endpoint: 'https://music.example.test/resolve' })
equal(first.enabled, true, 'new plugin enabled')
equal(listSourcePlugins()[0]?.endpoint, 'https://music.example.test/resolve', 'endpoint stored')

const second = createSourcePlugin({ name: 'Backup Resolver', endpoint: 'http://127.0.0.1:47632/resolve' })
equal(listSourcePlugins().length, 2, 'second plugin stored')
moveSourcePlugin(second.id, -1)
equal(listSourcePlugins()[0]?.id, second.id, 'plugin priority can be reordered')
updateSourcePlugin(second.id, { enabled: false })
equal(listSourcePlugins()[0]?.enabled, false, 'plugin can be disabled')
removeSourcePlugin(second.id)
equal(listSourcePlugins().length, 1, 'plugin can be removed')

let rejectedUnsafe = false
try {
  createSourcePlugin({ name: 'Unsafe', endpoint: 'javascript:alert(1)' })
} catch {
  rejectedUnsafe = true
}
assert(rejectedUnsafe, 'unsafe endpoint scheme rejected')

const requests: Array<{ url: string; body: unknown }> = []
const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
  requests.push({ url: String(input), body: JSON.parse(String(init?.body || '{}')) })
  return new Response(JSON.stringify({
    url: 'https://cdn.example.test/song.flac',
    level: 'lossless',
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

const candidates = await resolveWithSourcePlugins({
  providerId: 'netease',
  sourceId: 123,
  quality: 'lossless',
  title: 'Example Song',
  artists: ['Example Artist'],
}, { fetchImpl })

equal(candidates.length, 1, 'resolver returns plugin candidate')
equal(candidates[0]?.url, 'https://cdn.example.test/song.flac', 'resolver normalizes URL')
equal(candidates[0]?.cacheable, false, 'external result is not persistently cached')
equal(requests.length, 1, 'enabled plugin called once')
const requestBody = requests[0]?.body as { protocol?: string; version?: number; track?: { sourceId?: number } }
equal(requestBody.protocol, 'zt-playback-resolver', 'protocol marker sent')
equal(requestBody.version, 1, 'protocol version sent')
equal(requestBody.track?.sourceId, 123, 'track identity sent')

localStorage.setItem(SOURCE_PLUGIN_STORAGE_KEY, JSON.stringify([
  { id: 'bad', name: 'Bad', endpoint: 'file:///tmp/a', enabled: true, priority: 0, timeoutMs: 10 },
]))
equal(listSourcePlugins().length, 0, 'invalid persisted plugin ignored safely')


function throws(fn: () => unknown, message: string) {
  let rejected = false
  try { fn() } catch { rejected = true }
  assert(rejected, message)
}

for (const endpoint of ['file:///tmp/song', 'https://user:password@example.test/resolve', 'ftp://example.test/a']) {
  throws(() => createSourcePlugin({ name: 'Unsafe', endpoint }), 'rejects unsafe endpoint: ' + endpoint)
}
saveSourcePlugins([first])
const beforeInvalidUpdate = memory.get(SOURCE_PLUGIN_STORAGE_KEY)
throws(() => updateSourcePlugin(first.id, { endpoint: 'file:///bad' }), 'invalid update fails')
equal(memory.get(SOURCE_PLUGIN_STORAGE_KEY), beforeInvalidUpdate, 'invalid update preserves original record')
localStorage.setItem(SOURCE_PLUGIN_STORAGE_KEY, JSON.stringify([null, 7, {}, { ...first, enabled: 'false' }, first, first]))
equal(listSourcePlugins().length, 1, 'bad or duplicate persisted records do not hide valid plugins')
const store = localStorage
const originalSet = store.setItem
store.setItem = () => { throw new Error('quota') }
throws(() => updateSourcePlugin(first.id, { enabled: false }), 'storage write failure is reported')
equal(listSourcePlugins()[0]?.enabled, true, 'failed write preserves enabled flag')
store.setItem = originalSet
const originalGet = store.getItem
store.getItem = () => { throw new Error('denied') }
throws(() => createSourcePlugin({ name: 'New', endpoint: first.endpoint }), 'read failure prevents overwriting configuration')
store.getItem = originalGet
Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('denied') } })
throws(() => saveSourcePlugins([first]), 'unavailable storage fails rather than claiming success')
equal((await resolveWithSourcePlugins({ providerId: 'netease', sourceId: 1, quality: 'standard' }, { fetchImpl })).length, 0, 'unavailable storage does not break playback')
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store })
const backup = { ...first, id: 'plugin-backup', name: 'Backup', endpoint: 'https://backup.example.test/resolve' }
saveSourcePlugins([first, backup])
const request = { providerId: 'netease', sourceId: 1, quality: 'standard' }
let calls = 0
const multiFetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
  calls++
  equal(init?.credentials, 'omit', 'plugin request omits credentials')
  equal(init?.cache, 'no-store', 'plugin request bypasses HTTP cache')
  equal(init?.redirect, 'error', 'plugin request rejects redirects')
  return Response.json({ urls: ['javascript:alert(1)', 'https://user:pass@example.test/song', 'file:///song', 7, 'https://cdn.example.test/song', 'https://cdn.example.test/song', 'http://cdn.example.test/backup'] })
}) as typeof fetch
const multi = await resolveWithSourcePlugins(request, { fetchImpl: multiFetch, stopAfterFirst: false })
equal(multi.length, 2, 'valid URLs are deduplicated within and across plugins')
equal(calls, 2, 'background mode calls plugins in sequence')
calls = 0
await resolveWithSourcePlugins(request, { fetchImpl: multiFetch })
equal(calls, 1, 'foreground stops at first successful plugin')
updateSourcePlugin(first.id, { enabled: false })
calls = 0
await resolveWithSourcePlugins(request, { fetchImpl: multiFetch })
equal(calls, 1, 'disabled plugin is skipped')
updateSourcePlugin(first.id, { enabled: true, timeoutMs: 500 })
for (const failure of ['http', 'json', 'network', 'timeout']) {
  const order: string[] = []
  const failingFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    order.push(String(input))
    if (String(input) === first.endpoint) {
      if (failure === 'http') return new Response('', { status: 500 })
      if (failure === 'json') return new Response('{broken', { status: 200 })
      if (failure === 'network') throw new Error('offline')
      return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))
    }
    return Response.json({ url: 'https://cdn.example.test/backup' })
  }) as typeof fetch
  const result = await resolveWithSourcePlugins(request, { fetchImpl: failingFetch })
  equal(result[0]?.pluginId, backup.id, failure + ' skips to backup')
  equal(order.join(','), [first.endpoint, backup.endpoint].join(','), failure + ' respects configured order')
}
const cancelled = new AbortController()
cancelled.abort()
calls = 0
await resolveWithSourcePlugins(request, { fetchImpl: multiFetch, signal: cancelled.signal })
equal(calls, 0, 'already cancelled request never calls fetch')
const duringFetch = new AbortController()
let childAborted = false
calls = 0
const cancelFetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
  calls++
  duringFetch.abort()
  childAborted = Boolean(init?.signal?.aborted)
  return Response.json({ url: 'https://cdn.example.test/late' })
}) as typeof fetch
equal((await resolveWithSourcePlugins(request, { fetchImpl: cancelFetch, signal: duringFetch.signal, stopAfterFirst: false })).length, 0, 'cancelled fetch result is discarded')
assert(childAborted, 'parent cancellation aborts child request')
equal(calls, 1, 'cancellation prevents next plugin request')
const duringJson = new AbortController()
const jsonFetch = (async () => {
  const response = Response.json({ url: 'https://cdn.example.test/late' })
  response.json = async () => { duringJson.abort(); return { url: 'https://cdn.example.test/late' } }
  return response
}) as typeof fetch
equal((await resolveWithSourcePlugins(request, { fetchImpl: jsonFetch, signal: duringJson.signal })).length, 0, 'cancellation during body parsing discards result')
let stale = false
calls = 0
const staleFetch = (async () => { calls++; stale = true; return Response.json({ url: 'https://cdn.example.test/stale' }) }) as typeof fetch
equal((await resolveWithSourcePlugins(request, { fetchImpl: staleFetch, isStale: () => stale, stopAfterFirst: false })).length, 0, 'stale request discards result')
equal(calls, 1, 'stale request does not call next plugin')

console.log(`\n${passed} passed, ${failed} failed${failed ? ' — FAIL' : ' — all good'}`)
process.exitCode = failed ? 1 : 0
