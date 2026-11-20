import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('./action-panels.css', import.meta.url), 'utf8')
const polish = await readFile(new URL('./interaction-polish.css', import.meta.url), 'utf8')
const main = await readFile(new URL('../../main.js', import.meta.url), 'utf8')
const playerMenu = await readFile(new URL('../../lib/components/PlayerMoreMenu.svelte', import.meta.url), 'utf8')
const nestedSheet = await readFile(new URL('../../lib/components/NestedActionSheet.svelte', import.meta.url), 'utf8')
const songMenu = await readFile(new URL('../../lib/components/SongContextMenu.svelte', import.meta.url), 'utf8')
const player = await readFile(new URL('../../lib/components/AppleMusicPlayer.svelte', import.meta.url), 'utf8')

assert.match(main, /styles\/mobile\/action-panels\.css/, 'mobile action panel layer is loaded after the base mobile styles')
assert.match(main, /styles\/mobile\/interaction-polish\.css/, 'interaction polish runs after the shared action-panel layer')

for (const selector of [
  '.am-more-menu[data-bottom-panel]',
  '.song-menu',
  '.playlist-action-sheet.mobile-choice-sheet',
  '.queue-panel.queue-panel-mobile-visible',
  '.mobile-choice-sheet',
  '.am-secondary-sheet[data-bottom-panel]',
]) {
  assert.ok(css.includes(selector), `${selector} participates in the unified mobile action panel system`)
}

assert.match(css, /--mobile-action-panel-gap:\s*14px/, 'floating panels keep horizontal breathing room')
assert.match(css, /bottom:\s*var\(--mobile-action-panel-bottom\)/, 'panels share one safe-area aware lower-screen anchor')
assert.match(css, /max-height:\s*min\(62dvh,\s*520px\)/, 'ordinary action panels stay below full-screen height')
assert.match(css, /min-height:\s*44px/, 'action rows use compact touch-friendly density')
assert.match(css, /border-radius:\s*var\(--radius-xl\)/, 'floating panels use the shared large radius token')
assert.match(css, /background:\s*var\(--md-container\)/, 'floating panels use an opaque tonal surface')

assert.ok(polish.includes('var(--mobile-viewport-height, 100dvh) - var(--mobile-action-panel-bottom)'), 'playlist sheet height accounts for the live viewport and bottom safe anchor')
assert.ok(polish.includes('.playlist-action-sheet.mobile-choice-sheet .mobile-choice-body'), 'playlist actions get their own scroll container')
assert.match(playerMenu, /<header class="am-more-track">[\s\S]*?<\/header>\s*<div class="am-more-body">/, 'track information is outside the scrolling player actions')
assert.match(css, /:is\(\.song-menu__body, \.am-more-body\)\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/, 'both song action lists can shrink and scroll inside their sheets')
assert.match(nestedSheet, /use:dialogFocus=\{onBack\} in:mobileSheet out:mobileSheet/, 'child sheets use the top dialog for back handling and vertical motion')
assert.ok(!nestedSheet.includes('data-bottom-panel'), 'a child must not claim the exclusive top-level bottom panel')
assert.match(playerMenu, /<div class="am-more-body">[\s\S]*?\{@render nested\?\.\(\)\}/, 'the nested layer is mounted with the original player actions')
assert.ok(player.includes('showItems={$responsive.isMobile || !playlistTrack}') && songMenu.includes('{#if $responsive.isMobile || playlistMode === \'menu\'}'), 'mobile parent action lists stay mounted while a child is open')

console.log('mobile action panels: floating position, safe viewport, compact density and menu coverage passed')
