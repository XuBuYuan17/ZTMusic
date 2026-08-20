import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GLOBAL_CSS_FILES } from '../../../scripts/css-files.mjs'

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

console.log(`bootstrap self-check: ${GLOBAL_CSS_FILES.length + 4} assertions passed`)
