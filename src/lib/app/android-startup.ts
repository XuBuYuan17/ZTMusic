import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime, runtimePlatform } from '../utils/runtime.ts'

const android = (): boolean => isTauriRuntime() && /Android/i.test(runtimePlatform())
let frameAnnounced = false
let revealed = false
let ambientShown = false
let canAnimate = true
let nativeTheme: 'light' | 'dark' | undefined

export function initialAndroidTheme(): 'light' | 'dark' {
  return nativeTheme ?? (android() && !matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark')
}

/** Read only local Activity configuration before App mounts; no playback or network work. */
export async function prepareAndroidStartup(): Promise<void> {
  if (!android()) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      invoke<{ theme: string }>('plugin:zt-player|execute', { payload: { action: 'startupTheme', data: {} } }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('startupTheme timeout')), 1500) }),
    ])
    nativeTheme = result.theme === 'dark' ? 'dark' : 'light'
  } catch (error) {
    console.warn('[android-startup] 使用本地主题继续启动', error)
    nativeTheme = initialAndroidTheme()
  } finally { clearTimeout(timer) }
  let theme = nativeTheme
  try {
    const saved = localStorage.getItem('zheting-theme')
    if (saved === 'dark' || saved === 'light') theme = saved
  } catch { /* The native theme remains usable when local storage is unavailable. */ }
  const color = theme === 'dark' ? '#111113' : '#ffffff'
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  root.style.backgroundColor = color
  document.body.style.backgroundColor = color
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
}

export function syncAndroidTheme(theme: string): void {
  if (!android()) return
  void invoke('plugin:zt-player|execute', { payload: { action: 'appTheme', data: { theme } } }).catch(() => {})
}

/** Called from the mounted mobile shell, including its local placeholders; never from data loaders. */
export function announceAndroidFrame(_node?: HTMLElement): void {
  if (!android() || frameAnnounced) return
  frameAnnounced = true
  performance.mark('ztmusic:first-shell-frame')
  const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  void invoke('plugin:zt-player|execute', { payload: { action: 'startupReady', data: { theme, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches } } })
    .catch(() => { document.documentElement.classList.remove('android-startup-pending') })
}

function animateAmbient(node: HTMLElement): void {
  if (document.querySelector('[data-startup-splash]')) return
  if (ambientShown || !canAnimate || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  ambientShown = true
  node.animate([{ opacity: 0 }, { opacity: 1 }], { delay: 140, duration: 500, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' })
}

export function androidAmbientReveal(node: HTMLElement): void {
  if (android() && revealed) animateAmbient(node)
}

export function installAndroidStartup(): void {
  if (!android()) return
  const root = document.documentElement
  root.classList.add('android-startup-pending')
  window.addEventListener('ztmusic:android-reveal', (event) => {
    if (revealed) return
    revealed = true
    canAnimate = (event as CustomEvent<{ animate?: boolean }>).detail?.animate !== false
    performance.mark('ztmusic:system-splash-exit')
    root.classList.remove('android-startup-pending')
    if (canAnimate && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.querySelector('[data-startup-splash]')) {
      performance.mark('ztmusic:startup-content-animation')
      // Animate content, never the Activity window or a full-screen scale/position clone.
      for (const node of document.querySelectorAll<HTMLElement>('.mobile-page-bar, .mobile-page-content__inner, .mobile-tab-bar, .mobile-mini-player')) {
        node.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' })
      }
      const background = document.querySelector<HTMLElement>('.wallpaper-layer')
      if (background) animateAmbient(background)
    }
  }, { once: true })
}
