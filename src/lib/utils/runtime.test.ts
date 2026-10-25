/**
 * 运行时探测自检。
 * 跑法：node --experimental-strip-types src/lib/utils/runtime.test.ts
 * 退出码：0 = 过，1 = 挂。
 */
import assert from 'node:assert/strict'
import { isAndroidRuntime, isTauriDesktop, isTauriRuntime, runtimePlatform } from './runtime.ts'

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
  assert.equal(runtimePlatform(), 'Linux x86_64 Mozilla/5.0')
}

// ── Tauri Linux 桌面 ──
{
  setRuntime({ hasTauri: true, platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
  assert.equal(isTauriRuntime(), true, 'Tauri Linux: is Tauri')
  assert.equal(isTauriDesktop(), true, 'Tauri Linux: is desktop')
}

// ── Tauri Windows 桌面 ──
{
  setRuntime({ hasTauri: true, platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows)' })
  assert.equal(isTauriRuntime(), true)
  assert.equal(isTauriDesktop(), true, 'Tauri Win: is desktop')
}

// ── Tauri macOS 桌面 ──
{
  setRuntime({ hasTauri: true, platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' })
  assert.equal(isTauriRuntime(), true)
  assert.equal(isTauriDesktop(), true, 'Tauri macOS: is desktop')
}

// ── Android UA 包含 Linux，但不能启用桌面标题栏 ──
{
  setRuntime({ hasTauri: true, platform: 'Linux aarch64', userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36' })
  assert.equal(isTauriRuntime(), true, 'Android still uses Tauri IPC')
  assert.equal(isTauriDesktop(), false, 'Android is not a Linux desktop')
  assert.equal(isAndroidRuntime(), true, 'Android native container is detected by platform, not by window size')
}

// ── Android 识别只看平台：横屏宽窗口不改变结论 ──
{
  setRuntime({ hasTauri: true, platform: 'Linux aarch64', userAgent: 'Mozilla/5.0 (Linux; Android 15)' })
  Object.defineProperty(globalThis, 'innerWidth', { value: 1280, configurable: true })
  Object.defineProperty(globalThis, 'innerHeight', { value: 720, configurable: true })
  assert.equal(isAndroidRuntime(), true, 'Android keeps platform capability in landscape')
}

// ── 桌面不是 Android ──
{
  setRuntime({ hasTauri: true, platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows)' })
  assert.equal(isAndroidRuntime(), false, 'Windows desktop is not Android')
}

// ── 浏览器不是 Android 原生容器 ──
{
  setRuntime({ hasTauri: false, platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome' })
  assert.equal(isAndroidRuntime(), false, 'browser on Android is not the native container')
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
