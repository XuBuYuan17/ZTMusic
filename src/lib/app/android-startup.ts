import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime, runtimePlatform } from '../utils/runtime.ts'

const android = (): boolean => isTauriRuntime() && /Android/i.test(runtimePlatform())
let frameAnnounced = false

export function initialAndroidTheme(): 'light' | 'dark' {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyStartupTheme(theme: 'light' | 'dark'): void {
  const color = theme === 'dark' ? '#111113' : '#ffffff'
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  root.style.backgroundColor = color
  document.body.style.backgroundColor = color
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
}

/**
 * Apply a usable theme synchronously from WebView-local state. Startup must never wait
 * for native IPC before mounting the app; the JS shell and native playback hydration can
 * proceed in parallel.
 */
export function prepareAndroidStartup(): void {
  let theme = initialAndroidTheme()
  try {
    const saved = localStorage.getItem('zheting-theme')
    if (saved === 'dark' || saved === 'light') theme = saved
  } catch { /* System preference remains a safe fallback when storage is unavailable. */ }
  applyStartupTheme(theme)
}

export function syncAndroidTheme(theme: string): void {
  if (!android()) return
  void invoke('plugin:zt-player|execute', { payload: { action: 'appTheme', data: { theme } } }).catch(() => {})
}

/** Called once the mounted mobile shell can draw; this immediately releases Android's system launch screen. */
export function announceAndroidFrame(_node?: HTMLElement): void {
  if (!android() || frameAnnounced) return
  frameAnnounced = true
  performance.mark('ztmusic:first-shell-frame')
  const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  void invoke('plugin:zt-player|execute', { payload: { action: 'startupReady', data: { theme } } }).catch(() => {})
}
