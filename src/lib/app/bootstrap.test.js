import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const main = await readFile(new URL('../../main.js', import.meta.url), 'utf8')

assert.ok(!main.includes('MIN_SPLASH_DURATION = 3800'), 'startup should not impose the old 3.8 second delay')
assert.ok(main.includes("import('./App.svelte')"), 'application code should still be loaded dynamically')
assert.ok(main.indexOf("import('./App.svelte')") < main.indexOf('await loadLayoutCss()'), 'application code and layout CSS should load in parallel')
assert.ok(main.includes('minimumDuration = reduceMotion ? 0 : 1100'), 'reduced motion should skip the artificial splash delay')

console.log('bootstrap self-check: 4 assertions passed')
