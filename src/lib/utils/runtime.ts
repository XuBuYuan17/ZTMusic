// 抽公共的 Tauri 运行时探测。原本在 4 个文件里重复定义 isTauriRuntime()。
// 统一入口：desktop/mobile 区分、platform 字符串。

type WindowWithTauri = Window & typeof globalThis & { __TAURI_INTERNALS__?: unknown }
type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } }

/** 是否在 Tauri 容器里（任何平台） */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as WindowWithTauri).__TAURI_INTERNALS__
}

/** 拼接 navigator 的平台信息，类比 `native-media.js` 里的 runtimePlatform() */
export function runtimePlatform(): string {
  if (typeof navigator === 'undefined') return ''
  const nav = navigator as NavigatorWithUAData
  return [
    nav.userAgentData?.platform,
    nav.platform,
    nav.userAgent,
  ].filter(Boolean).join(' ')
}

/** Tauri 桌面平台；Android 的 UA 也包含 Linux，需要先排除移动系统。 */
export function isTauriDesktop(): boolean {
  if (!isTauriRuntime()) return false
  const p = runtimePlatform()
  return !/Android|iPhone|iPad|iPod/i.test(p) && /Linux|Win|Mac/i.test(p)
}
