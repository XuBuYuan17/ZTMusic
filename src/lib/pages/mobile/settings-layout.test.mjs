import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const settings = await readFile(new URL('../Settings.svelte', import.meta.url), 'utf8')
const mobileApp = await readFile(new URL('../../components/MobileApp.svelte', import.meta.url), 'utf8')

assert.match(mobileApp, /import SettingsPage from ['"]\.\.\/pages\/Settings\.svelte['"]/, 'mobile shell uses the shared categorized settings page')

assert.match(settings, /settingsFields\(category\)/, 'ordinary settings are rendered from their shared definitions')
assert.doesNotMatch(settings, /m-settings-intro|<details/, 'secondary pages have no slogans or nested developer card')
assert.match(settings, /settingsCategoryGroups\(engine.native === true\)/, 'category grouping respects native capabilities')
assert.match(settings, /onNavigate\?\.\(settingsView\(item.id\)\)/, 'entries use the common settings route mapping')
assert.match(settings, /m-settings-back/, 'every child starts with an explicit category-index return row')
assert.match(settings, /min-height: 52px/, 'rows allow accessible touch targets')
assert.match(settings, /font-size: 1\.0625rem/, 'main text respects font enlargement')
assert.match(settings, /prefers-reduced-motion/, 'switches respect reduced motion')
assert.match(settings, /<SourcePluginSettings mobile/, 'source list explicitly selects the mobile variant')
assert.match(settings, /<AndroidPlayerSettings mobile/, 'Android controls explicitly select the mobile variant')
assert.match(mobileApp, /category=\{settingsCategory\(page.view\)\}/, 'route selects the secondary page')
assert.match(mobileApp, /const position = scrollPositions.get\(key\)/, 'return restores route scroll position')
const desktop = await readFile(new URL('../../components/layout/DesktopPageHost.svelte', import.meta.url), 'utf8')
assert.match(desktop, /router.activeView === 'settings' \|\| settingsCategory/, 'desktop handles mobile subviews')
assert.match(desktop, /import\('\.\.\/\.\.\/pages\/Settings\.svelte'\)/, 'desktop uses the same settings content')
assert.match(desktop, /category=\{settingsCategory\(router.activeView\)\}/, 'desktop keeps the selected child across layout changes')
assert.match(mobileApp, /use:settingsBackGesture/, 'mobile settings routes install edge-swipe back')
const plugins = await readFile(new URL('../../components/SourcePluginSettings.svelte', import.meta.url), 'utf8')
assert.match(plugins, /mobile && addOpen/, 'mobile add form opens in a separate dialog')
assert.match(plugins, /use:dialogFocus/, 'plugin dialog uses existing focus and back handling')
console.log('mobile settings: categories, scalable touch controls, native variants and route integration passed')
