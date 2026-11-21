import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { GLOBAL_CSS_FILES } from '../../../scripts/maintenance/css-files.mjs'

const main = await readFile(new URL('../../main.js', import.meta.url), 'utf8')

assert.ok(main.includes("import('./App.svelte')"), 'application code should still be loaded dynamically')
assert.ok(!main.includes('minimumDuration'), 'startup must not impose an artificial minimum duration')
assert.ok(!main.includes('hideSplash'), 'startup must not coordinate an animated splash')
assert.ok(!main.includes('bootstrapStartedAt'), 'startup should mount as soon as modules are ready')
assert.ok(main.includes("window.dispatchEvent(new Event('ztmusic:startup-ready'))"), 'successful mount must close the startup error window')

// 布局 CSS 必须静态导入：Vite 生产构建无法静态分析变量路径，动态导入的布局 CSS
// 不会进包，曾导致生产版 app-pc.css 丢失、歌词页空白。
for (const file of GLOBAL_CSS_FILES) {
  const css = file.replace(/^src\//, './')
  assert.ok(main.includes(`import '${css}'`), `${css} should be imported statically`)
}
assert.ok(!/import\(\s*[^)]*app-(pc|mobile)\.css/.test(main), 'layout CSS must not be loaded via dynamic import()')
assert.ok(!main.includes('loadLayoutCss'), 'layout CSS should not go through a runtime loader')

const index = await readFile(new URL('../../../index.html', import.meta.url), 'utf8')
assert.ok(!index.includes('id="splash"'), 'the HTML shell must not render a splash screen')
assert.ok(!index.includes('splash-hero') && !index.includes('@keyframes splash'), 'splash animation assets must be removed from the HTML shell')
assert.ok(index.includes("localStorage.getItem('zheting-theme')"), 'the shell should pre-apply the saved theme to avoid a startup flash')

const startupScript = [...index.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('function showStartupError'))
assert.ok(startupScript, 'startup diagnostics must load before the module entry')
assert.ok(index.indexOf('function showStartupError') < index.indexOf('type="module" src="/src/main.js"'), 'startup diagnostics must be registered before main.js')

function startupHarness() {
  const handlers = new Map()
  const app = { textContent: '', children: [], appendChild(node) { this.children.push(node) } }
  const document = {
    getElementById(id) { return id === 'app' ? app : null },
    createElement(tagName) { return { tagName, style: {}, textContent: '', setAttribute() {} } },
  }
  const window = { addEventListener(name, handler) { handlers.set(name, handler) } }
  runInNewContext(startupScript, { document, window })
  return { handlers, app }
}

for (const [event, payload, expected] of [
  ['ztmusic:startup-error', { detail: new Error('<img src=x onerror=alert(1)>') }, '<img src=x onerror=alert(1)>'],
  ['ztmusic:startup-error', { detail: Object.assign(new SyntaxError('Unexpected token'), { stack: 'parseModule@[native code]' }) }, 'parseModule@[native code]'],
  ['unhandledrejection', { reason: new Error('Safari initialization failed') }, 'Safari initialization failed'],
  ['error', { target: { tagName: 'SCRIPT', src: '/src/main.js' } }, '/src/main.js'],
]) {
  const { handlers, app } = startupHarness()
  handlers.get(event)(payload)
  assert.equal(app.children.length, 1, `${event} must show one startup diagnostic`)
  assert.ok(app.children[0].textContent.startsWith('哲听启动失败'))
  assert.ok(app.children[0].textContent.includes(expected))
  handlers.get(event)(payload)
  assert.equal(app.children.length, 1, 'a second startup error must not replace or duplicate the diagnostic')
}

{
  const { handlers, app } = startupHarness()
  handlers.get('ztmusic:startup-ready')({})
  handlers.get('ztmusic:startup-error')({ detail: new Error('late runtime error') })
  assert.equal(app.children.length, 0, 'runtime errors after a successful mount must not replace the app')
}

console.log('bootstrap self-check: static CSS, immediate mount, theme preflight and startup diagnostics passed')
