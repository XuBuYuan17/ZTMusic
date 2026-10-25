/**
 * 组件样式所有权自检：公共组件不再被多个全局文件反复覆盖。
 * 跑法：node src/lib/app/css-ownership.test.js
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = file => readFile(new URL(file, import.meta.url), 'utf8')
const appMobile = await read('../../app-mobile.css')
const exploreCss = await read('../../styles/explore.css')
const responsive = await read('../../styles/mobile/responsive.css')
const desktopSystem = await read('../../styles/desktop-system.css')
const libraryAppearance = await read('../../styles/mobile/library-appearance.css')

const component = name => read(`../components/${name}.svelte`)

// ── 1) 组件自己的几何/外观回到组件 ──
const quick = await component('ProfileQuickEntries')
assert.ok(quick.includes(':global(html.mobile-runtime) .profile-home__quick'), 'quick entries own their mobile geometry')
// 只允许跨组件的手势/触感策略提到这些类，不允许再写几何
// 按规则块切分后逐块判断，避免正则转义
const cssRules = appMobile.split('}').map(rule => rule.trim())
const quickGeometry = cssRules.some(rule => rule.includes('.profile-home__quick') && rule.includes('grid-template-columns'))
const panelPadding = cssRules.some(rule => rule.includes('.profile-home__panel') && rule.includes('padding:'))
assert.equal(quickGeometry, false, 'app-mobile no longer sets quick-entry geometry')
assert.equal(panelPadding, false, 'app-mobile no longer sets profile panel spacing')
assert.ok(!appMobile.includes('.profile-home__social'), 'dead social container rules are gone')

const compact = await component('CompactTrackList')
assert.ok(compact.includes('.profile-home__track-list > button { min-height: 56px'), 'the compact list owns its desktop row height')
assert.ok(!desktopSystem.includes('.profile-home__track-list'), 'desktop-system no longer overrides the shared list')
assert.ok(!desktopSystem.includes('.user-page__tracks'), 'dead user-page track rule removed')

const recent = await component('RecentTracksModule')
const weekly = await component('WeeklyListenModule')
assert.ok(recent.includes('.profile-home__panel') && weekly.includes('.profile-home__panel'), 'panel owners declare their own chrome')

// ── 2) 一个类只由一个样式文件负责 ──
assert.equal(exploreCss.match(/\.music-preview-more/g)?.length, 3, 'explore.css owns the preview-more button (base + hover + mobile)')
assert.ok(!appMobile.includes('music-preview-more'), 'app-mobile does not duplicate it')
assert.ok(!responsive.includes('.search-desktop-album'), 'dead search rule removed')

// 资料库上下文的外观只有 library-appearance 一个来源
assert.equal((appMobile.match(/library-page \.profile-home__quick/g) ?? []).length, 0, 'library quick overrides live in one file')
assert.ok((libraryAppearance.match(/library-page \.profile-home__quick/g) ?? []).length > 0, 'library-appearance owns the library variant')

// ── 3) 没有靠 !important 解决问题 ──
// 既有文件里本来就有 !important（历史遗留）；本批不允许新增——用基线数量卡住
const importantBaseline = new Map([
  ['app-mobile', 9], ['explore', 0], ['responsive', 4], ['desktop-system', 2], ['library-appearance', 0],
])
for (const [name, css] of [['app-mobile', appMobile], ['explore', exploreCss], ['responsive', responsive], ['desktop-system', desktopSystem], ['library-appearance', libraryAppearance]]) {
  const count = css.split(String.fromCharCode(10)).filter(line => line.includes('!important')).length
  assert.equal(count, importantBaseline.get(name), `${name}.css must not add new !important lines (${count} vs ${importantBaseline.get(name)})`)
}
for (const name of ['ProfileQuickEntries', 'CompactTrackList', 'RecentTracksModule', 'WeeklyListenModule', 'PlaylistSection', 'PreviewCard', 'ToplistsModule', 'FeaturedContent', 'SocialPreviewSection']) {
  const source = await component(name)
  assert.equal((source.match(/!important/g) ?? []).length, 0, `${name} adds no !important`)
}

// ── 4) 主题与强调色仍走变量 ──
for (const name of ['ProfileQuickEntries', 'CompactTrackList', 'ToplistsModule', 'FeaturedContent']) {
  const source = await component(name)
  const style = source.slice(source.indexOf('<style>'))
  assert.ok(style.includes('var(--'), `${name} uses design tokens`)
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(style), `${name} hardcodes no colors`)
}

// ── 5) 320px 宽度：组件不声明超宽的最小宽度 ──
for (const name of ['ProfileQuickEntries', 'CompactTrackList', 'RecentTracksModule', 'WeeklyListenModule', 'PlaylistSection', 'PreviewCard', 'ToplistsModule', 'FeaturedContent', 'SocialPreviewSection']) {
  const source = await component(name)
  const style = source.slice(source.indexOf('<style>'))
  for (const match of style.matchAll(/min-width:\s*(\d+)px/g)) {
    assert.ok(Number(match[1]) <= 320, `${name} must not require more than 320px (found ${match[1]}px)`)
  }
}

console.log('css ownership: components own their look, single source per class passed')
