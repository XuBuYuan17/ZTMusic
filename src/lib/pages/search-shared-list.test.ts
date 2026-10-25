/**
 * 搜索页接入共享列表的自检：展示统一、状态保留、旧响应不覆盖。
 * 跑法：node --experimental-strip-types src/lib/pages/search-shared-list.test.ts
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8')
const page = await read('./SearchPage.svelte')

// ── 1) 只统一展示与动作，不重写搜索服务 ──
assert.ok(page.includes("from '../music/service.ts'"), 'still searches through the service')
assert.ok(!page.includes('ncm.cloudsearch') && !page.includes('ncm.search('), 'no raw api call was introduced')
assert.ok(page.includes('async function doSearch()'), 'the page still owns the search flow')
assert.ok(page.includes("import SongList from '../components/SongList.svelte'"), 'songs use the shared list')
assert.ok(page.includes('toSongRows(results.songs)'), 'song results are normalized once')
assert.equal((page.match(/<SongList rows=/g) ?? []).length, 2, 'both the preview and the songs tab use it')
assert.ok(page.includes('rowActions={songActions?.bindRow ?? null}'), 'the shared row menu is kept')
assert.ok(!page.includes('search-song-row'), 'no hand written song rows left')

// ── 2) 搜索词 / 分类 / 过滤 / 请求逻辑保留 ──
assert.ok(page.includes("let keyword = $state(initial?.keyword || '')"), 'keyword survives remounts')
assert.ok(page.includes("let activeCategory = $state<CategoryKey>(initial?.activeCategory || 'all')"), 'category survives remounts')
assert.ok(page.includes('resetResults()'), 'a new search still resets previous results')
assert.ok(page.includes("const searchCategories = $derived"), 'category tabs are unchanged')
assert.ok(page.includes("key: 'playlists'"), 'playlist results are still a category')

// 快照与布局无关（切布局不清空）
assert.ok(page.includes('const initial = searchSnapshot'), 'the snapshot is not gated on the platform')
assert.ok(page.includes('searchSnapshot = { keyword, results: $state.snapshot(results), activeCategory'), 'it stores the keyword and the category')
assert.ok(!page.includes('isMobileDevice'), 'no platform check decides whether state survives')

// ── 3) 旧关键词的慢响应不会覆盖新结果 ──
assert.ok(page.includes('const currentRequest = ++requestId'), 'every search takes a request id')
assert.ok(page.includes('if (currentRequest !== requestId) return'), 'stale responses are dropped before applying')
assert.ok(page.includes('if (currentRequest === requestId) { resetResults(); searchError'), 'stale failures are dropped too')
assert.ok(page.includes('requestId++'), 'leaving the page invalidates in-flight searches')

// ── 4) 现有结果类型仍可访问 ──
for (const category of ['songs', 'artists', 'playlists']) {
  assert.ok(page.includes(`activeCategory === '${category}'`), `${category} tab still renders`)
}
assert.ok(page.includes('onOpenArtist?.(artist.id)'), 'artist results still open artists')
assert.ok(page.includes('onOpenPlaylist?.(pl.id, true, pl)'), 'playlist results still open with preview')

// ── 5) 滚动恢复走统一视口契约 ──
assert.ok(page.includes('const scrollViewport = getScrollViewport()') && page.includes('scrollViewport?.element()'), 'scroll restore no longer guesses a css class')

console.log('search page: shared list, kept state and stale-response guard passed')
