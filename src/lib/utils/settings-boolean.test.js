/**
 * 布尔设置项的取值契约。
 * Run: node src/lib/utils/settings-boolean.test.js
 *
 * 背景：setBooleanSetting 返回归一化后的**字符串**（'true'/'false'），
 * 而 'false' 是 truthy。曾因移动端设置页漏写 === 'true' 而导致
 * 关闭歌词模糊开关后 UI 仍显示"开"（PC 端写了，两边漂移）。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

const { getBooleanSetting, getSetting, setBooleanSetting, setSetting } = await import('./settings.js')

let passed = 0
const check = (cond, msg) => { assert.ok(cond, msg); passed++ }

// setBooleanSetting 返回字符串，不能直接当布尔用
assert.equal(setBooleanSetting('lyrics_blur_effect', false), 'false')
assert.equal(setBooleanSetting('lyrics_blur_effect', true), 'true')
passed += 2

// 这就是那个 bug：字符串 'false' 是 truthy
check(setBooleanSetting('lyrics_blur_effect', false) === 'false', "returns the string 'false'")
check(!!'false' === true, "the string 'false' is truthy — must compare, not coerce")

// 正确用法：=== 'true' 之后才是真布尔
setBooleanSetting('lyrics_blur_effect', false)
check(getBooleanSetting('lyrics_blur_effect') === false, 'getBooleanSetting returns a real boolean')
setBooleanSetting('lyrics_blur_effect', true)
check(getBooleanSetting('lyrics_blur_effect') === true, 'round-trips true')

assert.equal(setSetting('accent_theme', 'violet'), 'violet')
assert.equal(getSetting('accent_theme'), 'violet')
assert.equal(setSetting('accent_theme', 'invalid'), 'red')
passed += 3

// 设置页必须用 === 'true' 收敛 setBooleanSetting 的返回值，否则开关显示会反
const composable = await readFile(new URL('../composables/useSettings.svelte.js', import.meta.url), 'utf8')
for (const fn of ['handleRestoreSession', 'handleLyricsBlur', 'handleLyricsTextBlur']) {
  const body = composable.slice(composable.indexOf(`function ${fn}(`))
  const line = body.slice(0, body.indexOf('\n', body.indexOf('setBooleanSetting')))
  check(line.includes("=== 'true'"), `${fn} must coerce setBooleanSetting via === 'true'`)
}

console.log(`settings boolean contract: ${passed} assertions passed`)
