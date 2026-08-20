import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ROOT = new URL('../../../', import.meta.url)

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => Number.parseInt(value, 16) / 255)
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

function contrast(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background))
  const dark = Math.min(luminance(foreground), luminance(background))
  return (light + 0.05) / (dark + 0.05)
}

const appCss = await readFile(new URL('src/app.css', ROOT), 'utf8')
const darkTheme = appCss.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const darkSurface = darkTheme.match(/--bg-surface:\s*(#[a-f\d]{6})/i)?.[1]
const darkTertiary = darkTheme.match(/--text-tertiary:\s*(#[a-f\d]{6})/i)?.[1]

assert.ok(darkSurface && darkTertiary, '暗色主题必须声明表面色和三级文字色')
assert.ok(contrast(darkTertiary, darkSurface) >= 4.5, '暗色三级文字在表面色上至少达到 WCAG AA 对比度')

const shellCss = await readFile(new URL('src/styles/shell.css', ROOT), 'utf8')
const radiusDeclaration = 'border-' + 'radius'
assert.match(shellCss, new RegExp(`\\.global-search-btn\\s*\\{[\\s\\S]*?${radiusDeclaration}:\\s*var\\(--radius-sm\\)`))

const searchCss = await readFile(new URL('src/styles/search-overlay.css', ROOT), 'utf8')
assert.match(searchCss, new RegExp(`\\.so-tabs button\\s*\\{[\\s\\S]*?${radiusDeclaration}:\\s*var\\(--radius-sm\\)`))

const playerCss = await readFile(new URL('src/styles/player-bar.css', ROOT), 'utf8')
const genericAction = playerCss.indexOf('.action-btn {')
const desktopMobileNextGuard = playerCss.indexOf('.player-bar .action-btn--mobile-next { display: none; }')
assert.ok(desktopMobileNextGuard > genericAction, '桌面隐藏规则必须位于通用 action 按钮规则之后')

console.log('UI harmony self-check: contrast, radii and desktop player controls are consistent')
