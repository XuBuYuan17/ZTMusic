import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { createContext, runInContext } from 'node:vm'

const source = await readFile(new URL('./SearchPage.svelte', import.meta.url), 'utf8')
const moduleScript = source.match(/<script module[^>]*>([\s\S]*?)<\/script>/)?.[1] || ''
const instanceScript = source.match(/<script(?! module)[^>]*>([\s\S]*?)<\/script>/)![1]!
const withoutImports = (script: string) => script.replace(/^\s*import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
let passed = 0
async function check(name: string, run: () => void | Promise<void>) {
  try { await run(); passed++ }
  catch (error) { console.error(`FAIL ${name}:`, error); process.exitCode = 1 }
}

function harness() {
  let mobile = false, calls = 0, initializing = false
  let mounted: Array<() => unknown> = [], destroyed: Array<() => unknown> = []
  const scroller = { scrollTop: 0 }
  let search = async () => ({ songs: [{ id: 42, name: 'Result' }], artists: [], playlists: [] })
  const context = createContext({
    $state: Object.assign((value: unknown) => value, { snapshot: (value: unknown) => structuredClone(value) }),
    $derived: (value: unknown) => value, $props: () => ({}), $effect: () => {},
    onMount: (callback: () => unknown) => mounted.push(callback), onDestroy: (callback: () => unknown) => destroyed.push(callback),
    tick: async () => {}, isMobileDevice: () => mobile,
    document: { querySelector: () => scroller },
    getScrollViewport: () => {
      assert.ok(initializing, 'context must only be read during initialization')
      return { element: () => scroller, top: () => 0, entered: () => {} }
    },
    toSongRows: (tracks: Array<Record<string, unknown>>) => tracks.map((source, index) => ({
      id: source.id, source, name: String(source.name ?? ''), artists: [], album: null,
      cover: '', durationMs: 0, durationLabel: '', addedAt: 0, addedLabel: '', addedTitle: '',
      index,
    })),
    musicService: { search: () => { calls++; return search() } },
    router: { prefetchPlaylists() {} }, setTimeout: () => 0,
  })
  runInContext(stripTypeScriptTypes(withoutImports(moduleScript)), context)
  function mountPage() {
    mounted = []; destroyed = []
    initializing = true
    const page = runInContext(stripTypeScriptTypes(`(() => { ${withoutImports(instanceScript)}
      return { setQuery: value => keyword = value, setCategory: value => activeCategory = value, search: doSearch,
        view: () => JSON.parse(JSON.stringify({ keyword, activeCategory, results, loading, searchError })) }
    })()`), context) as {
      setQuery: (value: string) => void; setCategory: (value: string) => void; search: () => Promise<void>
      view: () => { keyword: string; activeCategory: string; results: { songs: Array<{ id: number }> }; loading: boolean; searchError: string }
    }
    initializing = false
    const mounts = mounted, destroys = destroyed
    return { ...page,
      mount: async () => { for (const callback of mounts) await callback(); await new Promise<void>(resolve => setImmediate(resolve)) },
      destroy: () => { for (const callback of destroys) callback() },
    }
  }
  return { mountPage, scroller, calls: () => calls, mobile: (value: boolean) => { mobile = value },
    search: (callback: typeof search) => { search = callback } }
}

await check('desktop playlist host connects pagination and manual retry', async () => {
  const host = await readFile(new URL('../components/layout/DesktopPageHost.svelte', import.meta.url), 'utf8')
  const playlist = host.slice(host.indexOf('{#await loadPlaylistPage()}'), host.indexOf("{:else if router.activeView === 'search'}"))
  assert.match(playlist, /hasMore=\{router\.playlistHasMore\}/)
  assert.match(playlist, /onLoadMore=\{router\.loadMorePlaylist\}/)
})

await check('desktop return restores query, category, results and scroll without repeating search', async () => {
  const runtime = harness()
  const page = runtime.mountPage(); await page.mount()
  page.setQuery('私人的查询'); await page.search(); page.setCategory('songs')
  runtime.scroller.scrollTop = 420
  page.destroy()
  runtime.scroller.scrollTop = 0
  const returned = runtime.mountPage(); await returned.mount()
  assert.equal(returned.view().keyword, '私人的查询')
  assert.equal(returned.view().activeCategory, 'songs')
  assert.deepEqual(Array.from(returned.view().results.songs, track => track.id), [42])
  assert.equal(runtime.scroller.scrollTop, 420)
  assert.equal(runtime.calls(), 1)
})

await check('layout switch keeps the same search session instead of clearing it', async () => {
  const runtime = harness()
  const desktop = runtime.mountPage(); await desktop.mount()
  desktop.setQuery('desktop query'); await desktop.search(); desktop.setCategory('songs'); desktop.destroy()
  runtime.mobile(true)
  const mobile = runtime.mountPage(); await mobile.mount()
  // 快照与布局无关：换到窄屏仍带着搜索词与分类
  assert.equal(mobile.view().keyword, 'desktop query')
  assert.equal(mobile.view().activeCategory, 'songs')
  mobile.setQuery('mobile query'); await mobile.search(); mobile.destroy()
  runtime.mobile(false)
  const returned = runtime.mountPage(); await returned.mount()
  assert.equal(returned.view().keyword, 'mobile query', 'the same session is shared by both layouts')
})

await check('returning during an unfinished search restarts it instead of showing empty completed results', async () => {
  const runtime = harness()
  let resolve!: (value: { songs: Array<{ id: number; name: string }>; artists: never[]; playlists: never[] }) => void
  const pending = new Promise<{ songs: Array<{ id: number; name: string }>; artists: never[]; playlists: never[] }>(yes => { resolve = yes })
  runtime.search(() => pending)
  const page = runtime.mountPage(); await page.mount()
  page.setQuery('pending query'); const searching = page.search(); page.destroy()
  runtime.search(async () => ({ songs: [{ id: 77, name: 'Fresh' }], artists: [], playlists: [] }))
  const returned = runtime.mountPage(); await returned.mount()
  assert.equal(returned.view().keyword, 'pending query')
  assert.deepEqual(Array.from(returned.view().results.songs, track => track.id), [77])
  resolve({ songs: [{ id: 42, name: 'Old' }], artists: [], playlists: [] }); await searching
  assert.deepEqual(Array.from(returned.view().results.songs, track => track.id), [77])
})

await check('an async return that is left again cannot scroll the newly opened page', async () => {
  const runtime = harness()
  type Result = { songs: Array<{ id: number; name: string }>; artists: never[]; playlists: never[] }
  let resolveFirst!: (value: Result) => void, resolveReturn!: (value: Result) => void
  const first = new Promise<Result>(resolve => { resolveFirst = resolve })
  const second = new Promise<Result>(resolve => { resolveReturn = resolve })
  runtime.search(() => first)
  const page = runtime.mountPage(); await page.mount()
  page.setQuery('pending query'); const searching = page.search()
  runtime.scroller.scrollTop = 420; page.destroy()
  runtime.search(() => second)
  const returning = runtime.mountPage(); const mounting = returning.mount()
  returning.destroy(); runtime.scroller.scrollTop = 900
  resolveReturn({ songs: [], artists: [], playlists: [] }); await mounting
  resolveFirst({ songs: [], artists: [], playlists: [] }); await searching
  assert.equal(runtime.scroller.scrollTop, 900)
})

await check('a failed search keeps its retry state when returning', async () => {
  const runtime = harness()
  runtime.search(async () => { throw new Error('offline') })
  const page = runtime.mountPage(); await page.mount()
  page.setQuery('retry query'); await page.search(); page.destroy()
  const returned = runtime.mountPage(); await returned.mount()
  assert.equal(returned.view().keyword, 'retry query')
  assert.equal(returned.view().searchError, '搜索失败，请重试')
  assert.equal(runtime.calls(), 1)
})

console.log(`search session and desktop wiring: ${passed} passed${process.exitCode ? ', failed' : ', 0 failed'}`)
