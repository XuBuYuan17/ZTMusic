import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('./action-panels.css', import.meta.url), 'utf8')
const main = await readFile(new URL('../../main.js', import.meta.url), 'utf8')

assert.match(main, /styles\/mobile\/action-panels\.css/, 'mobile action panel layer is loaded after the base mobile styles')

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

console.log('mobile action panels: floating position, compact density and menu coverage passed')
