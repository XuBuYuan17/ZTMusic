import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { GLOBAL_CSS_FILES } from '../../../scripts/maintenance/css-files.mjs'

const main = await readFile(new URL('../../main.js', import.meta.url), 'utf8')

assert.ok(!main.includes('MIN_SPLASH_DURATION = 3800'), 'startup should not impose the old 3.8 second delay')
assert.ok(main.includes("import('./App.svelte')"), 'application code should still be loaded dynamically')
assert.ok(main.includes('minimumDuration = reduceMotion ? 0 : 420'), 'reduced motion should skip the short splash transition')

// 布局 CSS 必须静态导入：Vite 生产构建无法静态分析变量路径，动态导入的布局 CSS
// 不会进包，曾导致生产版 app-pc.css 丢失、歌词页空白。
for (const file of GLOBAL_CSS_FILES) {
  const css = file.replace(/^src\//, './')
  assert.ok(main.includes(`import '${css}'`), `${css} should be imported statically`)
}
assert.ok(!/import\(\s*[^)]*app-(pc|mobile)\.css/.test(main), 'layout CSS must not be loaded via dynamic import()')
assert.ok(!main.includes('loadLayoutCss'), 'layout CSS should not go through a runtime loader')

const index = await readFile(new URL('../../../index.html', import.meta.url), 'utf8')
const startupScript = [...index.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('function showStartupError'))
assert.ok(startupScript, 'startup diagnostics must load before the module entry')
for (const [event, payload] of [
  ['ztmusic:startup-error', { detail: new Error('<img src=x onerror=alert(1)>') }],
  ['ztmusic:startup-error', { detail: Object.assign(new SyntaxError('Unexpected token'), { stack: 'parseModule@[native code]' }) }],
  ['unhandledrejection', { reason: new Error('Safari initialization failed') }],
  ['error', { target: { tagName: 'SCRIPT', src: '/src/main.js' } }],
]) {
  const handlers = new Map()
  let splashVisible = true
  const app = { textContent: '', children: [], appendChild(node) { this.children.push(node) } }
  const document = {
    getElementById(id) { return id === 'app' ? app : id === 'splash' && splashVisible ? { remove() { splashVisible = false } } : null },
    createElement(tagName) { return { tagName, style: {}, textContent: '', children: [], setAttribute() {}, append(...nodes) { this.children.push(...nodes) } } },
  }
  const window = { addEventListener(name, handler) { handlers.set(name, handler) }, location: { reload() {} } }
  runInNewContext(startupScript, { document, window })
  handlers.get(event)(payload)
  assert.equal(splashVisible, false, `${event} must dismiss the splash`)
  assert.equal(app.children[0].children[0].textContent, '哲听加载失败')
  assert.ok(app.children[0].children[1].textContent.includes(event === 'error' ? '/src/main.js' : payload.detail?.message || payload.reason.message))
  handlers.get(event)(payload)
  assert.equal(app.children.length, 1, 'runtime errors after splash dismissal must not replace the page')
}
console.log('bootstrap self-check: CSS imports, startup timing and visible failure diagnostics passed')
