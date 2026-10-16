import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const sessionSource = readFileSync(new URL('./session.ts', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
const clientSource = readFileSync(new URL('./client.ts', import.meta.url), 'utf8')
  .replace(/^import(?: type)?[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace(/^export \{.*\}\r?\n/gm, '').replace(/^export /gm, '')
const script = stripTypeScriptTypes(sessionSource + '\n' + clientSource)

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function within(promise) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('cancellation did not stop waiting')), 100) })])
  } finally { clearTimeout(timer) }
}

function harness(mode, transport, { timeout = 15000, stale = null, cacheRead } = {}) {
  const storage = new Map()
  const writes = []
  const delays = []
  const context = {
    URL, URLSearchParams, AbortController, DOMException,
    window: { location: { hostname: 'example.invalid', origin: 'https://example.invalid' } },
    getStorage: (key, fallback) => storage.get(key) ?? fallback,
    setStorage: (key, value) => storage.set(key, value), removeStorage: key => storage.delete(key),
    isTauriRuntime: () => mode === 'invoke', normalizeError: error => error,
    getApiCacheTtl: () => 1000, createApiCacheKey: () => 'cache-key',
    readApiCache: cacheRead ?? (async (_key, options) => options?.allowExpired ? stale : null),
    writeApiCache: async (_key, value) => { writes.push(value) }, isCacheableResponse: () => true,
    setTimeout: (callback, delay) => {
      delays.push(delay)
      return setTimeout(callback, delay === 15000 ? timeout : 0)
    },
    clearTimeout,
    fetch: async (url, options) => {
      const result = await transport({ endpoint: new URL(url).pathname, ...options })
      return { ok: (result.status ?? 200) < 400, status: result.status ?? 200, json: result.json ?? (async () => result.data) }
    },
    mockInvoke: async (_command, { request }) => {
      const result = await transport(request)
      return { data: result.data, cookie: result.cookie ?? '' }
    },
  }
  runInNewContext(script + '\nif (isTauriRuntime()) tauriInvokePromise = Promise.resolve(mockInvoke); globalThis.api = { request, ncm, apiSession }', context)
  return { ...context.api, storage, writes, delays }
}

let passed = 0, failed = 0
async function test(name, run) {
  try {
    await run()
    passed++
    console.log(`PASS: ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL: ${name}: ${error.message}`)
  }
}

for (const mode of ['fetch', 'invoke']) {
  for (const change of ['login', 'clear', 'logout', 'base']) {
    await test(`${mode}: a late ${change} response cannot overwrite the current session cookie`, async () => {
      const started = deferred(), reply = deferred()
      const runtime = harness(mode, async () => { started.resolve(); return reply.promise })
      runtime.apiSession.setCookie('MUSIC_U=account-a')
      const pending = runtime.request(change === 'logout' ? '/logout' : '/user/detail')
      await started.promise
      if (change === 'clear') runtime.apiSession.clearCookie()
      else if (change === 'base') runtime.apiSession.setBase('https://other.invalid')
      else runtime.apiSession.setCookie('MUSIC_U=account-b')
      const expected = runtime.apiSession.getCookie()
      const cookie = change === 'logout' ? 'MUSIC_U=' : 'MUSIC_U=late-a'
      reply.resolve({ data: { code: 200, cookie }, cookie })
      await pending
      assert.equal(runtime.apiSession.getCookie(), expected)
    })
  }

  await test(`${mode}: ordinary parallel response cookies are merged in the same session`, async () => {
    const replies = [deferred(), deferred()], started = deferred()
    let calls = 0
    const { request, apiSession } = harness(mode, async () => {
      const index = calls++
      if (calls === 2) started.resolve()
      return replies[index].promise
    })
    apiSession.setCookie('MUSIC_U=account-a')
    const pending = [request('/user/detail'), request('/user/level')]
    await started.promise
    replies[0].resolve({ data: { code: 200, cookie: '__csrf=first' }, cookie: '__csrf=first' })
    await pending[0]
    replies[1].resolve({ data: { code: 200, cookie: 'NMTID=second' }, cookie: 'NMTID=second' })
    await pending[1]
    assert.equal(apiSession.getCookie(), 'MUSIC_U=account-a; __csrf=first; NMTID=second; os=pc')
  })

  await test(`${mode}: response token refresh does not invalidate another legitimate response`, async () => {
    const replies = [deferred(), deferred()], started = deferred()
    let calls = 0
    const { request, apiSession } = harness(mode, async () => {
      const index = calls++
      if (calls === 2) started.resolve()
      return replies[index].promise
    })
    apiSession.setCookie('MUSIC_U=account-a')
    const version = apiSession.getVersion()
    const pending = [request('/user/detail'), request('/user/level')]
    await started.promise
    replies[0].resolve({ data: { code: 200, cookie: 'MUSIC_U=rotated' }, cookie: 'MUSIC_U=rotated' })
    await pending[0]
    replies[1].resolve({ data: { code: 200, cookie: '__csrf=second' }, cookie: '__csrf=second' })
    await pending[1]
    assert.equal(apiSession.getCookie(), 'MUSIC_U=rotated; __csrf=second; os=pc')
    assert.equal(apiSession.getVersion(), version)
  })

  for (const endpoint of ['/playlist/create', '/playlist/delete', '/follow', '/comment', '/send/text']) {
    await test(`${mode}: ${endpoint} is never retried after an uncertain gateway failure`, async () => {
      let calls = 0
      const { request } = harness(mode, async () => {
        calls++
        if (calls === 1) throw mode === 'invoke' ? 'API error: 502 Bad Gateway' : new Error('API error: 502')
        return { data: { code: 200 } }
      })
      await assert.rejects(request(endpoint, {}, endpoint.startsWith('/send') || endpoint === '/comment' ? 'POST' : 'GET', {}))
      assert.equal(calls, 1)
    })
  }

  await test(`${mode}: a read performed with POST retains two gateway retries and backoff`, async () => {
    let calls = 0
    const { request, delays } = harness(mode, async () => {
      if (++calls < 3) throw mode === 'invoke' ? 'API error: 502 Bad Gateway' : new Error('API error: 502')
      return { data: { code: 200 } }
    })
    await request('/user/account', {}, 'POST', {})
    assert.equal(calls, 3)
    assert.deepEqual(delays.filter(delay => delay !== 15000), [200, 400])
  })

  await test(`${mode}: cancellation prevents late cookie/cache writes and returns no stale cache`, async () => {
    const started = deferred(), reply = deferred()
    const runtime = harness(mode, async () => { started.resolve(); return reply.promise }, { stale: { code: 200, stale: true } })
    runtime.apiSession.setCookie('MUSIC_U=current')
    const controller = new AbortController()
    const pending = runtime.request('/user/detail', {}, 'GET', null, { signal: controller.signal })
    const rejection = assert.rejects(pending, error => error?.name === 'AbortError')
    await started.promise
    controller.abort()
    try { await within(rejection) } finally {
      reply.resolve({ data: { code: 200, cookie: 'MUSIC_U=late' }, cookie: 'MUSIC_U=late' })
    }
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(runtime.apiSession.getCookie(), 'MUSIC_U=current; os=pc')
    assert.equal(runtime.writes.length, 0)
  })

  await test(`${mode}: cancellation while a gateway error arrives prevents retry`, async () => {
    const started = deferred(), reply = deferred()
    let calls = 0
    const { request } = harness(mode, async () => { calls++; started.resolve(); return reply.promise })
    const controller = new AbortController()
    const pending = request('/user/detail', {}, 'GET', null, { signal: controller.signal })
    const rejection = assert.rejects(pending, error => error?.name === 'AbortError')
    await started.promise
    controller.abort()
    reply.reject(new Error('502 Bad Gateway'))
    await rejection
    assert.equal(calls, 1)
  })

  await test(`${mode}: an already canceled request does not reach the transport`, async () => {
    let calls = 0
    const { request } = harness(mode, async () => { calls++; return { data: { code: 200 } } })
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(request('/user/detail', {}, 'GET', null, { signal: controller.signal }), error => error?.name === 'AbortError')
    assert.equal(calls, 0)
  })

  await test(`${mode}: cancellation during cache read rejects instead of returning cached data`, async () => {
    const started = deferred(), cached = deferred()
    let calls = 0
    const { request } = harness(mode, async () => { calls++; return { data: { code: 200 } } }, {
      cacheRead: async () => { started.resolve(); return cached.promise },
    })
    const controller = new AbortController()
    const pending = request('/user/detail', {}, 'GET', null, { signal: controller.signal })
    const rejection = assert.rejects(pending, error => error?.name === 'AbortError')
    await started.promise
    controller.abort()
    cached.resolve({ code: 200, cached: true })
    await rejection
    assert.equal(calls, 0)
  })
}

await test('fetch: cancellation remains active while JSON is being read', async () => {
  const started = deferred(), body = deferred()
  let fetchSignal
  const runtime = harness('fetch', async ({ signal }) => {
    fetchSignal = signal
    return { json: () => { started.resolve(); return body.promise } }
  })
  const controller = new AbortController()
  const pending = runtime.request('/user/detail', {}, 'GET', null, { signal: controller.signal })
  const rejection = assert.rejects(pending, error => error?.name === 'AbortError')
  await started.promise
  controller.abort()
  try { await within(rejection) } finally { body.resolve({ code: 200, cookie: 'MUSIC_U=late' }) }
  assert.equal(fetchSignal.aborted, true)
  assert.equal(runtime.writes.length, 0)
})

await test('fetch: timeout includes JSON reading and does not disguise cancellation as invalid JSON', async () => {
  const started = deferred(), body = deferred()
  let fetchSignal
  const runtime = harness('fetch', async ({ signal }) => {
    fetchSignal = signal
    return { json: () => { started.resolve(); return body.promise } }
  }, { timeout: 10 })
  const pending = runtime.request('/user/detail')
  const rejection = assert.rejects(pending, error => error?.message === 'API request timeout')
  await started.promise
  await new Promise(resolve => setTimeout(resolve, 20))
  body.resolve({ code: 200 })
  await rejection
  assert.equal(fetchSignal.aborted, true)
  assert.equal(runtime.writes.length, 0)
})

await test('invoke: timeout stops waiting and ignores the eventual native response', async () => {
  const reply = deferred()
  const runtime = harness('invoke', () => reply.promise, { timeout: 10 })
  const pending = runtime.request('/user/detail')
  const rejection = assert.rejects(pending, error => error?.message === 'API request timeout')
  await new Promise(resolve => setTimeout(resolve, 20))
  reply.resolve({ data: { code: 200, cookie: 'MUSIC_U=late' }, cookie: 'MUSIC_U=late' })
  await rejection
  assert.equal(runtime.apiSession.getCookie(), '')
  assert.equal(runtime.writes.length, 0)
})

await test('fetch: malformed JSON still returns the explicit invalid-response envelope', async () => {
  const { request } = harness('fetch', async () => ({ json: async () => { throw new SyntaxError('invalid JSON') } }))
  const response = await request('/user/detail')
  assert.equal(response.code, -1)
  assert.equal(response.message, 'API response not JSON: 200')
})

console.log(`\nAPI request sessions: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
