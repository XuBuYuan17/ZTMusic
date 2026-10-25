/**
 * 榜单模块自检：两端可用、按需加载不重复、失败不外溢。
 * 跑法：node src/lib/pages/toplists.test.js
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = file => readFile(new URL(file, import.meta.url), 'utf8')
const explore = await read('./pc/Explore.svelte')
const module = await read('../components/ToplistsModule.svelte')
const cacheTtl = await read('../api/cache-ttl.ts')

// ── 1) 两端都能看到并打开榜单 ──
assert.equal((explore.match(/<ToplistsModule/g) ?? []).length, 1, 'one shared template renders the toplist module')
assert.ok(explore.includes('<ToplistsModule {mobile}'), 'the module receives the layout flag so both ends get it')
assert.ok(module.includes('aria-label="榜单"'), 'mobile section is labelled')
assert.ok(module.includes('music-toplist-panel'), 'desktop section keeps its class')
assert.ok((module.match(/onOpenPlaylist\?\.\(chart\)/g) ?? []).length, 'cards open the chart playlist')
assert.ok(explore.includes('onOpenPlaylist={(chart) => onOpenPlaylist?.(chart.id, true, chart)}'), 'the page keeps the original open action with preview')

// ── 2) 按需加载不依赖宽屏，且不重复 ──
const loadEffect = explore.match(/\$effect\(\(\) => \{ if \([^)]*\) loadToplists\(\) \}\)/)
assert.ok(loadEffect, 'the load effect exists')
assert.ok(!/mobile/.test(loadEffect[0]), 'loading must not be gated on the wide layout')
assert.ok(loadEffect[0].includes('!toplistsLoaded'), 'loading waits for the first successful load')
assert.ok(loadEffect[0].includes('!toplistsLoading'), 'concurrent loads are not duplicated')
assert.ok(explore.includes('toplistsSnapshotAt') && explore.includes('SNAPSHOT_TTL'), 'a fresh snapshot skips the request')
assert.ok(cacheTtl.includes("'/toplist': 60 * MINUTE"), 'still reuses the existing api cache')

// ── 3) 失败只影响自己 ──
assert.ok(!/catch \(e\) \{ if \(!toplistsSnapshot\.length && !error\) error = errorMessage\(e\) \}/.test(explore), 'toplist failure must not write the page error')
assert.ok(explore.includes('toplistsError = errorMessage(e)'), 'failure goes to a module-scoped state')
assert.ok(explore.includes('error={toplistsError}'), 'the module receives its own error')
assert.ok(module.includes('榜单加载失败') && module.includes('onRetry'), 'the module explains the failure and offers a retry')
assert.ok(module.includes('const failed = $derived(Boolean(error) && !toplists.length)'), 'failure only replaces the list when nothing was loaded')
assert.ok(!module.includes('ncm.'), 'the module never fetches by itself')

// ── 4) 截断仍可解释 ──
assert.ok(module.includes('展开全部 ${toplists.length} 个'), 'truncation states how many charts exist')
assert.ok(module.includes('aria-expanded'), 'the expand state is exposed')

console.log('toplists: both layouts, on-demand loading and isolated failure passed')
