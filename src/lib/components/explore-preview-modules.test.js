/**
 * 发现页预览模块自检：数据/动作由页面提供，播放与跳转不变，截断可解释。
 * 跑法：node src/lib/components/explore-preview-modules.test.js
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = file => readFile(new URL(file, import.meta.url), 'utf8')
const explore = await read('../pages/pc/Explore.svelte')
const songs = await read('./NewSongsModule.svelte')
const albums = await read('./NewAlbumsModule.svelte')
const playlists = await read('./RecommendedPlaylistsModule.svelte')
const card = await read('./PreviewCard.svelte')

// ── 1) 三个模块都接受数据与动作，不自己请求 ──
for (const [name, source] of [['songs', songs], ['albums', albums], ['playlists', playlists]]) {
  assert.ok(!source.includes('ncm.'), `${name} module must not call the api`)
  assert.ok(!source.includes('loadExploreData'), `${name} module must not load page data`)
  assert.ok(!source.includes('loadToplistsData'), `${name} module must not load page data`)
  assert.ok(source.includes('$props()'), `${name} module takes props`)
}

// ── 2) 播放与详情跳转保持原样 ──
assert.ok(songs.includes('onclick={() => onPlaySong?.(song)}'), 'mobile song row keeps playing the row it shows')
assert.ok(songs.includes('onclick={() => onPlaySong?.(song)}'), 'desktop song card keeps playing its track')
assert.ok(songs.includes('bindSongRow?.(song).oncontextmenu(event)'), 'the more button still opens the same row menu')
assert.ok(songs.includes('<ArtistNames artists={artistsOf(song)}'), 'desktop songs still render clickable artists')
assert.ok(albums.includes('onSelect={() => onOpenAlbum?.(album.id)}'), 'albums keep opening by id')
assert.ok(playlists.includes('onSelect={() => onOpenPlaylist?.(playlist)}'), 'playlists keep carrying the preview object')
assert.equal((explore.match(/onOpenPlaylist\?\.\(playlist\.id as SongId, true, playlist\)/g) ?? []).length, 2, 'both playlist blocks still push with the preview object')

// ── 3) 两端共用同一批数据（模块只拿页面已加载的数据） ──
for (const state of ['songs={songs}', 'albums={exploreNewAlbums}', 'playlists={primaryPlaylists}', 'playlists={secondaryPlaylists}']) {
  assert.ok(explore.includes(state), `page passes ${state}`)
}
assert.equal((explore.match(/<NewSongsModule/g) ?? []).length, 1, 'one shared songs module')
assert.equal((explore.match(/<NewAlbumsModule/g) ?? []).length, 1, 'one shared albums module')
assert.equal((explore.match(/<RecommendedPlaylistsModule/g) ?? []).length, 2, 'one playlist module for primary and one for secondary')

// ── 4) 截断可解释：说明数量并给出展开入口 ──
for (const [name, source] of [['songs', songs], ['albums', albums], ['playlists', playlists]]) {
  assert.ok(source.includes('expanded'), `${name} module can expand`)
  assert.ok(source.includes('aria-expanded'), `${name} module exposes the expanded state`)
  assert.ok(/展开全部 \$\{/.test(source), `${name} module states how many items are hidden`)
  assert.ok(source.includes('.slice(0, limit)'), `${name} module truncates explicitly`)
}

// ── 5) 封面回退不塌陷 ──
assert.ok(card.includes('visibility = \'hidden\''), 'broken covers keep their box')
assert.ok(card.includes('music-cover-placeholder') && card.includes('mobile-cover-fallback'), 'missing cover has a fallback in both layouts')

console.log('explore preview modules: data/actions, playback and truncation passed')
