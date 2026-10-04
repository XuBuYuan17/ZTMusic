import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('./action-panels.css', import.meta.url), 'utf8')
const polish = await readFile(new URL('./interaction-polish.css', import.meta.url), 'utf8')
const main = await readFile(new URL('../../main.js', import.meta.url), 'utf8')

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
assert.match(polish, /\.mobile-more-header\s*\{\s*display:\s*none;/, 'mobile player more menu does not waste a row on a redundant title and close button')
assert.ok(polish.includes('.am-more-menu[data-bottom-panel] .am-more-body'), 'player more actions scroll independently below the drag handle')

console.log('mobile action panels: floating position, safe viewport, compact density and menu coverage passed')
