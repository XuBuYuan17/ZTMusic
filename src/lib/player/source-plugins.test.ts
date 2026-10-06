import {
  SOURCE_PLUGIN_STORAGE_KEY,
  createSourcePlugin,
  listSourcePlugins,
  moveSourcePlugin,
  removeSourcePlugin,
  resolveWithSourcePlugins,
  updateSourcePlugin,
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

console.log(`\n${passed} passed, ${failed} failed${failed ? ' — FAIL' : ' — all good'}`)
process.exitCode = failed ? 1 : 0
