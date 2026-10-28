/**
 * 其余独立页面审查的守卫：特殊交互不被公共手势影响、平台能力不按布局判断。
 * 跑法：node --experimental-strip-types src/lib/pages/page-audit.test.ts
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8')

const report = await read('./pc/ListeningReport.svelte')
const messages = await read('./pc/Messages.svelte')
const chat = await read('../components/messages/ChatDialog.svelte')
const local = await read('./LocalMusicPage.svelte')
const about = await read('./AboutPage.svelte')
const settings = await read('./Settings.svelte')
const settingsNav = await read('./settings-navigation.ts')
const shortcuts = await read('../app/keyboard-shortcuts.ts')

// ── 1) 保留独立的页面：没有共享列表/卡片，也没有真实的重复点 ──
for (const [name, page] of [['report', report], ['messages', messages], ['local', local], ['about', about], ['settings', settings]] as const) {
  assert.ok(!page.includes("import SongList from"), `${name} does not need the shared song list`)
  assert.ok(!page.includes('toSongRows('), `${name} has no song rows to normalize`)
}

// 统计页是图表，不是列表
assert.ok(report.includes('wall-weekdays') || report.includes('report-'), 'report renders charts')
assert.ok(!report.includes('player.'), 'report has no playback action to share')

// ── 2) 消息输入不被全局快捷键劫持 ──
assert.ok(chat.includes('<textarea'), 'the composer is a textarea')
assert.ok(chat.includes('onkeydown={handleComposerKeydown}'), 'the composer owns its own key handling')
assert.ok(chat.includes('onsubmit={(e) => { e.preventDefault(); void send() }}'), 'sending stays a form submit')
assert.ok(shortcuts.includes('function isEditableTarget'), 'global shortcuts have an editable guard')
assert.ok(shortcuts.includes("tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'"), 'text fields are excluded')
assert.ok(shortcuts.includes('isContentEditable'), 'contenteditable is excluded too')

// ── 3) 本地文件导入不受共享手势影响 ──
assert.ok(local.includes('type="file"'), 'local import uses native file inputs')
assert.ok(local.includes('bind:this={fileInput}') && local.includes('bind:this={folderInput}'), 'both file and folder inputs exist')
assert.ok(!local.includes('SongList'), 'no shared list long-press applies to local rows')
assert.ok(!local.includes('mobileLongPress'), 'local rows do not use the shared long-press')
assert.ok(local.includes('type="password"'), 'webdav credentials stay a normal form field')

// ── 4) 平台能力有明确状态，且不按布局判断 ──
assert.ok(settings.includes('settingsCategoryGroups(engine.native === true)') && settings.includes("category !== 'android' || engine.native"), 'android settings are gated on the platform capability')
assert.ok(settingsNav.includes("android || !('requires' in item)"), 'the android category is filtered by the capability flag')
for (const [name, page] of [['report', report], ['messages', messages], ['local', local], ['about', about], ['settings', settings]] as const) {
  assert.ok(!page.includes('isMobileDevice'), `${name} must not gate capability on the layout`)
}
// 统计页只把 mobile-runtime 用在横向滚动定位上，不参与能力判断
assert.ok(/classList\.contains\('mobile-runtime'\)\)\s*node\.scrollLeft/.test(report), 'the report only uses the runtime class for scroll positioning')
// 样式里按 mobile-runtime 调布局是允许的；脚本与模板里不许拿它当能力开关
const withoutStyle = (src: string) => src.replace(/<style>[\s\S]*?<\/style>/g, '')
for (const [name, page] of [['messages', messages], ['local', local], ['about', about], ['settings', settings]] as const) {
  assert.ok(!withoutStyle(page).includes('mobile-runtime'), `${name} must not branch logic on the mobile runtime class`)
}

// ── 5) 死页：listeningStats 两端加载的都是同一份实现 ──
const host = await read('../components/layout/DesktopPageHost.svelte')
const mobile = await read('../components/MobileApp.svelte')
assert.ok(host.includes("import('../../pages/pc/ListeningReport.svelte')"), 'desktop loads the report page')
assert.ok(mobile.includes("import ListeningReportPage from '../pages/pc/ListeningReport.svelte'"), 'mobile loads the same report page')

console.log('page audit: standalone pages, input guards and platform states passed')
