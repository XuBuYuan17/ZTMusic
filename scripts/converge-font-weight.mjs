/**
 * 把 CSS 里的 font-weight 收敛到 HarmonyOS Sans SC 实际打包的 3 档：400 / 500 / 700。
 *
 * 用法：
 *   node scripts/converge-font-weight.mjs --dry   # 预览
 *   node scripts/converge-font-weight.mjs         # 写入
 *
 * 为什么必须收敛：只打包了 Regular/Medium/Bold 三个字面，其余字重浏览器要么
 * 舍入到最近档、要么合成"假粗体"（synthetic bold，笔画糊、字距乱）。
 * 与其让浏览器随机决定，不如显式写清楚。
 *
 * 映射不是就近取整，而是按字重在设计里承担的角色：
 *   600            → 500  小字号 UI 文本（导航/按钮/标签，11~16px），
 *                          HarmonyOS Medium 在这些尺寸已足够醒目，700 会过重
 *   650 ~ 860      → 700  全是标题类，统一到 Bold
 *
 * 副作用（有意接受）：760/780/800/820/850 之间原有的细微层级会消失。
 * 层级改由 font-size + color 承担，这比依赖 5 档难以分辨的字重更稳。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GLOBAL_CSS_FILES } from './css-files.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** 全部含 CSS 的文件：全局样式表 + 组件 <style> 块 + index.html 内联样式 */
function targets() {
  const found = [...GLOBAL_CSS_FILES, 'index.html']
  const walk = (dir) => {
    for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(rel)
      else if (entry.name.endsWith('.svelte')) found.push(rel)
    }
  }
  walk('src')
  return found
}

/** 打包的字面。改这里必须同步改 app.css 的 @font-face 和 font-weight.test.js */
export const PACKED_WEIGHTS = [400, 500, 700]

/** 字重 → 打包档位。语义映射，非就近取整。 */
export function convergeWeight(weight) {
  if (weight <= 400) return 400
  if (weight <= 600) return 500
  return 700
}

/**
 * 开屏 logotype 例外：index.html 的内联样式在 webfont 加载**之前**就渲染，
 * 用的是系统回退字体（拉丁文 "ZT"/"Music"，190px 展示级字号）。
 * 它不受 HarmonyOS 3 档限制，收敛只会让 logo 变细，故排除。
 */
const SKIP = [/index\.html$/]

const dryRun = process.argv.includes('--dry')
let totalChanged = 0

for (const file of targets()) {
  if (SKIP.some((re) => re.test(file))) continue
  const path = resolve(root, file)
  const css = readFileSync(path, 'utf8')
  const hits = new Map()

  const out = css.replace(/font-weight:\s*(\d+)/g, (full, digits) => {
    const from = Number.parseInt(digits, 10)
    const to = convergeWeight(from)
    if (from === to) return full
    hits.set(`${from}→${to}`, (hits.get(`${from}→${to}`) || 0) + 1)
    totalChanged++
    return full.replace(digits, String(to))
  })

  if (hits.size) {
    const detail = [...hits].sort().map(([k, n]) => `${k}×${n}`).join('  ')
    console.log(`${file}\n  ${detail}`)
  }
  if (!dryRun && out !== css) writeFileSync(path, out)
}

console.log(`\n合计改动 ${totalChanged} 处${dryRun ? '（--dry：未写入）' : '，已写入'}`)
