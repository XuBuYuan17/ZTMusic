/**
 * 运行时探测自检。
 * 跑法：node --experimental-strip-types src/lib/utils/runtime.test.ts
 * 退出码：0 = 过，1 = 挂。
 */
import assert from 'node:assert/strict'
import { isTauriAndroid, isTauriDesktop, isTauriRuntime, runtimePlatform } from './runtime.ts'

type RuntimeWindow = (Window & typeof globalThis) & { __TAURI_INTERNALS__?: unknown }

// 备份原始 navigator 状态
const originalWindow = globalThis.window
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

function setRuntime({ hasTauri = false, platform = '', userAgent = '' } = {}): void {
  globalThis.window = { __TAURI_INTERNALS__: hasTauri ? {} : undefined } as unknown as RuntimeWindow
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform, userAgent },
    configurable: true,
    writable: true,
  })
}

function restore(): void {
  globalThis.window = originalWindow
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor)
  }
}

// ── 纯浏览器：isTauriRuntime = false ──
{
  setRuntime({ hasTauri: false, platform: 'Linux x86_64', userAgent: 'Mozilla/5.0' })
  assert.equal(isTauriRuntime(), false, 'browser: not Tauri')
  assert.equal(isTauriDesktop(), false, 'browser: not Tauri desktop')
  assert.equal(isTauriAndroid(), false, 'browser: not Tauri Android')
  assert.equal(runtimePlatform(), 'Linux x86_64 Mozilla/5.0')
}

// ── Tauri Linux 桌面 ──
{
  setRuntime({ hasTauri: true, platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
  assert.equal(isTauriRuntime(), true, 'Tauri Linux: is Tauri')
  assert.equal(isTauriDesktop(), true, 'Tauri Linux: is desktop')
  assert.equal(isTauriAndroid(), false, 'Tauri Linux: not Android')
}

// ── Tauri Windows 桌面 ──
{
  setRuntime({ hasTauri: true, platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows)' })
  assert.equal(isTauriRuntime(), true)
  assert.equal(isTauriDesktop(), true, 'Tauri Win: is desktop')
  assert.equal(isTauriAndroid(), false)
}

// ── Tauri macOS 桌面 ──
{
  setRuntime({ hasTauri: true, platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' })
  assert.equal(isTauriRuntime(), true)
  assert.equal(isTauriDesktop(), true, 'Tauri macOS: is desktop')
}

// ── Tauri Android ──
{
  setRuntime({ hasTauri: true, platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 13)' })
  assert.equal(isTauriRuntime(), true)
  assert.equal(isTauriDesktop(), false, 'Tauri Android: NOT desktop')
  assert.equal(isTauriAndroid(), true, 'Tauri Android: is Android')
}

// ── 浏览器在 Android UA 上（不是 Tauri） ──
{
  setRuntime({ hasTauri: false, platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 13)' })
  assert.equal(isTauriRuntime(), false, 'browser Android: not Tauri')
  assert.equal(isTauriDesktop(), false, 'browser Android: not Tauri desktop')
  assert.equal(isTauriAndroid(), false, 'browser Android: not Tauri Android')
}

// ── navigator 缺失（SSR / node 环境） ──
{
  globalThis.window = { __TAURI_INTERNALS__: undefined } as unknown as RuntimeWindow
  Object.defineProperty(globalThis, 'navigator', {
    value: undefined,
    configurable: true,
    writable: true,
  })
  assert.equal(isTauriRuntime(), false, 'no navigator: not Tauri')
  assert.equal(runtimePlatform(), '', 'no navigator: empty platform')
  assert.equal(isTauriDesktop(), false)
}

restore()
console.log('runtime detection: 18 assertions passed')
