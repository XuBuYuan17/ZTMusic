import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime, runtimePlatform } from '../utils/runtime.ts'

const android = (): boolean => isTauriRuntime() && /Android/i.test(runtimePlatform())
let frameAnnounced = false
let revealed = false
let ambientShown = false
let canAnimate = true

export function initialAndroidTheme(): 'light' | 'dark' {
  return android() && !matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark'
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
  void invoke('plugin:zt-player|execute', { payload: { action: 'startupReady', data: { theme } } })
    .catch(() => { document.documentElement.classList.remove('android-startup-pending') })
}

function animateAmbient(node: HTMLElement): void {
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
    if (canAnimate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      performance.mark('ztmusic:startup-content-animation')
      // Animate content, never the Activity window or a full-screen scale/position clone.
      for (const node of document.querySelectorAll<HTMLElement>('.mobile-page-bar, .mobile-page-content__inner, .mobile-tab-bar, .mobile-mini-player')) {
        node.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 280, easing: 'cubic-bezier(.4,0,.2,1)' })
      }
      const background = document.querySelector<HTMLElement>('.wallpaper-layer')
      if (background) animateAmbient(background)
    }
  }, { once: true })
}
