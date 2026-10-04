import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const settings = await readFile(new URL('./Settings.svelte', import.meta.url), 'utf8')
const mobileApp = await readFile(new URL('../../components/MobileApp.svelte', import.meta.url), 'utf8')

assert.match(mobileApp, /import SettingsPage from ['"]\.\.\/pages\/mobile\/Settings\.svelte['"]/, 'mobile shell uses the dedicated settings page')

for (const section of ['外观', '播放与歌词', '应用', '数据与账号', '高级', '关于']) {
  assert.match(settings, new RegExp(`>${section}<`), `mobile settings keeps the ${section} section`)
}

assert.doesNotMatch(settings, /Preferences/, 'mobile settings does not duplicate the page title with a desktop-style kicker')
assert.match(settings, /width:\s*42px;[\s\S]*height:\s*24px;/, 'mobile switches stay compact')
assert.match(settings, /\.m-accent-picker button\s*\{[\s\S]*width:\s*28px;[\s\S]*height:\s*28px;/, 'accent choices stay visually restrained')
assert.match(settings, /AndroidPlayerSettings/, 'native Android controls remain available')
assert.match(settings, /desktop-lyrics-card\)[\s\S]*background:\s*transparent;/, 'Android settings are flattened into the mobile hierarchy')

console.log('mobile settings: dedicated hierarchy, compact controls and restrained Android styling passed')
