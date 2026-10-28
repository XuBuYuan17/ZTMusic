/**
 * 歌单分区/卡片自检：普通展示卡不能带管理动作，网格与列表必须吃同一份资源数据。
 * 跑法：node src/lib/components/playlist-card-surface.test.js
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const card = await readFile(new URL('./PlaylistCoverCard.svelte', import.meta.url), 'utf8')
const section = await readFile(new URL('./PlaylistSection.svelte', import.meta.url), 'utf8')
const home = await readFile(new URL('../pages/pc/Home.svelte', import.meta.url), 'utf8')
const library = await readFile(new URL('../pages/pc/Library.svelte', import.meta.url), 'utf8')

// ── 普通展示卡只认展示数据，不承接管理动作 ──
for (const banned of ['onEdit', 'onDelete', 'onUnsubscribe', 'onOptions', 'onQueue', 'managed', 'owned', 'liked']) {
  assert.ok(!card.includes(banned), `display card must not carry ${banned}`)
}
assert.ok(card.includes('aspect-ratio: 1'), 'cover keeps a square aspect ratio')
assert.ok(card.includes('playlist-card__fallback'), 'missing cover has a fallback')

// ── 分区：标题、辅助说明与更多入口 ──
assert.ok(section.includes('kicker') && section.includes('moreLabel') && section.includes('onMore'), 'section owns the title/helper/more entry')
assert.ok(section.includes("variant === 'group'"), 'library grouping reuses the same section')
assert.ok(section.includes('library-mobile-section'), 'group variant keeps the global library classes')

// ── 两个页面都走同一套组件，网格/分组吃同一份数据 ──
assert.ok(home.includes("import PlaylistCoverCard from '../../components/PlaylistCoverCard.svelte'"))
assert.ok(home.includes('PlaylistSection') && library.includes('library-playlists'))
assert.ok((home.match(/<PlaylistCoverCard/g) ?? []).length === 2, 'both home grids use the same card')
assert.ok(home.includes('createdPlaylists') && home.includes('recommendPlaylists'), 'grids read the same normalized playlists')
assert.ok(!home.includes('onEdit') && !home.includes('onDelete'), 'home cards expose no management actions')

// ── 预览截断但保留完整入口 ──
assert.ok(home.includes("moreLabel=\"全部歌单\"") && home.includes("onMore={() => onNavigate?.('library')}"), 'created preview links to the full library')
assert.ok(home.includes("moreLabel=\"更多推荐\"") && home.includes("onMore={() => onNavigate?.('explore')}"), 'recommend preview links to explore')
assert.ok(home.includes('slice(0, 6)'), 'previews stay truncated, the full entry is the way out')

// ── 资料库卡片继续提供按归属区分的管理操作 ──
assert.ok(library.includes('openOptions(item.pl, item.kind') && library.includes('libraryPlaylistActions(selected.kind)'), 'library cards retain ownership-aware management')
assert.ok(library.includes("kind: 'owned'") && library.includes("kind: 'saved'"), 'ownership comes from data, not layout')

console.log('playlist card surface: display card, section and truncation passed')
