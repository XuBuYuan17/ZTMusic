/**
 * 发现页模块集合自检：两端同一份内容模板，业务能力不随布局被排除。
 * 跑法：node src/lib/pages/explore-modules.test.js
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = file => readFile(new URL(file, import.meta.url), 'utf8')
const source = await read('./pc/Explore.svelte')

// ── 1) 不再用 mobile 排除业务能力 ──
const gated = source.match(/if \(!mobile[^)]*\)[^}]*load\w+\(/g) ?? []
assert.equal(gated.length, 0, 'no capability load may be skipped on mobile')
assert.ok(!/!mobile\s*&&\s*!toplistsLoaded/.test(source), 'toplists must load on both ends')
assert.ok(source.includes('loadToplists()'), 'toplists still load at all')

// ── 2) 只有一份内容模板：模块各自接收 mobile，而不是页面写两套分支 ──
assert.ok(!/^\{#if mobile\}$/m.test(source), 'the page no longer branches the whole template on mobile')
assert.equal((source.match(/<FeaturedContent/g) ?? []).length, 1, 'one featured module')
assert.equal((source.match(/<NewSongsModule/g) ?? []).length, 1, 'one songs module')
assert.equal((source.match(/<NewAlbumsModule/g) ?? []).length, 1, 'one albums module')
assert.equal((source.match(/<RecommendedPlaylistsModule/g) ?? []).length, 2, 'primary and secondary playlists')
assert.equal((source.match(/<ToplistsModule/g) ?? []).length, 1, 'one toplist module')
assert.equal((source.match(/<DiscoveryPlaylists/g) ?? []).length, 1, 'one login recommendations module')

for (const tag of ['<NewSongsModule {mobile}', '<NewAlbumsModule {mobile}', '<ToplistsModule {mobile}', '<RecommendedPlaylistsModule {mobile}', '<DiscoveryPlaylists {mobile}']) {
  assert.ok(source.includes(tag), `${tag} receives the layout flag`)
}
assert.ok(source.includes("layout={mobile ? 'rail' : 'hero'}"), 'the featured module switches its own layout')

// ── 3) 数据都在页面里，模块不重复请求 ──
for (const state of ['banners=', 'songs=', 'toplists=', 'albums={exploreNewAlbums}', 'playlists={primaryPlaylists}', 'playlists={secondaryPlaylists}']) {
  assert.ok(source.includes(state), `page passes ${state}`)
}
for (const file of ['NewSongsModule.svelte', 'NewAlbumsModule.svelte', 'RecommendedPlaylistsModule.svelte', 'ToplistsModule.svelte']) {
  const module = await read(`../components/${file}`)
  assert.ok(!module.includes('ncm.'), `${file} must not fetch`)
}

// ── 4) 没有把页面改成配置驱动 ──
assert.ok(!source.includes('moduleSchema'), 'no config-driven module schema was introduced')
assert.ok(!source.includes('renderModule('), 'no generic module renderer was introduced')

console.log('explore modules: one template, one module set, no mobile gate passed')
