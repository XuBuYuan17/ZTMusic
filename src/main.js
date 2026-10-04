import './app.css'
import './styles/shell.css'
import './styles/wallpaper.css'
import './styles/search-overlay.css'
import './styles/player-bar.css'
import './styles/theme-transition.css'
import './styles/loading.css'
import './styles/home.css'
import './styles/library.css'
import './styles/content.css'
import './styles/lyrics.css'
import './styles/explore.css'
import './styles/lyrics/player.css'
import './styles/lyrics/context.css'
import './styles/lyrics/controls.css'
import './styles/lyrics/mobile.css'
import './app-pc.css'
import './styles/product-polish.css'
import './styles/desktop-system.css'
import './app-mobile.css'
import './styles/mobile/lyrics.css'
import './styles/mobile/responsive.css'
import './styles/mobile/search.css'
import './styles/mobile/artist.css'
import './styles/mobile/playlist-motion.css'
import './styles/mobile/action-panels.css'
import { isMobileDevice } from './lib/utils/responsive.ts'
import { installNativeShell } from './lib/app/native-shell.ts'
import { installMobileResumeGuard } from './lib/app/mobile-resume.ts'
import { installPlaylistDiscMotion } from './lib/app/playlist-disc-motion.ts'

installNativeShell()
installMobileResumeGuard()
installPlaylistDiscMotion()

const viewport = document.querySelector('meta[name="viewport"]')
viewport?.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover')

function serializeClientError(value) {
  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack || '',
    }
  }
  return {
    message: typeof value === 'string' ? value : JSON.stringify(value),
    stack: '',
  }
}

async function installDevErrorReporter() {
  if (!(import.meta.env.DEV || import.meta.env.VITE_APP_CHANNEL === 'dev') || !window.__TAURI_INTERNALS__) return
  let invoke
  try {
    ;({ invoke } = await import('@tauri-apps/api/core'))
  } catch {
    return
  }

  console.info('[build]', {
    channel: import.meta.env.VITE_APP_CHANNEL || 'local',
    commit: import.meta.env.VITE_BUILD_SHA || 'local',
  })
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'F12' && !(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'i')) return
    event.preventDefault()
    invoke('dev_open_devtools').catch(error => console.warn('[devtools]', error))
  })

  const report = (level, value, source = '') => {
    const serialized = serializeClientError(value)
    invoke('dev_report_client_error', {
      log: {
        level,
        message: serialized.message,
        stack: serialized.stack,
        source,
      },
    }).catch(() => {})
  }

  window.addEventListener('error', (event) => {
    report('error', event.error || event.message, event.filename || '')
  })
  window.addEventListener('unhandledrejection', (event) => {
    report('unhandledrejection', event.reason)
  })

  const originalError = console.error.bind(console)
  console.error = (...args) => {
    originalError(...args)
    report('console.error', args.map((arg) => serializeClientError(arg).message).join(' '))
  }
}

installDevErrorReporter()

// 首帧同步一次，消除 FOUC 窗口。之后的切换由 App.svelte 独占 —— 它要把 class 切换
// 和 Svelte 渲染一起包进 View Transition 回调，第二个订阅者会抢在旧快照之前改 DOM。
document.documentElement.classList.toggle('mobile-runtime', isMobileDevice())

;(async () => {
  try {
    const [{ mount }, { default: App }] = await Promise.all([
      import('svelte'),
      import('./App.svelte'),
    ])
    mount(App, { target: document.getElementById('app') })
    window.dispatchEvent(new Event('ztmusic:startup-ready'))
  } catch (e) {
    console.error('[哲听] 初始加载错误:', e)
    if (import.meta.hot) {
      import.meta.hot.on('vite:error', () => window.location.reload())
    }
    window.dispatchEvent(new CustomEvent('ztmusic:startup-error', { detail: e }))
  }
})()
