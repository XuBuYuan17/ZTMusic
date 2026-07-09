import './app.css'
import { getLayoutMode, shouldUseMobileLayout } from './lib/utils/layout-mode.js'

const viewport = document.querySelector('meta[name="viewport"]')
viewport?.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover')

const loadedStyles = new Set()

function loadRuntimeStyles(mobile) {
  const key = mobile ? 'mobile' : 'pc'
  if (loadedStyles.has(key)) return Promise.resolve()
  loadedStyles.add(key)
  return mobile ? import('./app-mobile.css') : import('./app-pc.css')
}

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
  if (!import.meta.env.DEV || !window.__TAURI_INTERNALS__) return
  let invoke
  try {
    ;({ invoke } = await import('@tauri-apps/api/core'))
  } catch {
    return
  }

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

function isMobileRuntime() {
  // ponytail: ?mobile 参数强制启用手持端布局
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mobile')) return true
  return shouldUseMobileLayout(window.innerWidth, window.innerHeight, getLayoutMode())
}

function syncMobileRuntime() {
  const mobile = isMobileRuntime()
  document.documentElement.classList.toggle('mobile-runtime', mobile)
  loadRuntimeStyles(mobile)
}

syncMobileRuntime()
window.addEventListener('resize', syncMobileRuntime)
window.addEventListener('orientationchange', syncMobileRuntime)
window.addEventListener('layout-mode-change', syncMobileRuntime)

;(async () => {
  try {
    await loadRuntimeStyles(isMobileRuntime())
    const { mount } = await import('svelte')
    const { default: App } = await import('./App.svelte')
    mount(App, { target: document.getElementById('app') })
  } catch (e) {
    // HMR 重载时的临时编译错误不覆盖页面
    if (import.meta.hot) {
      console.warn('[哲听] 初始加载错误，等待 HMR 重试:', e)
      import.meta.hot.on('vite:error', () => window.location.reload())
      return
    }
    document.getElementById('app').innerHTML = `
      <div style="padding:40px;color:white;font-family:sans-serif">
        <h2>哲听 加载失败</h2>
        <pre style="color:#ff6a6a;margin-top:16px;white-space:pre-wrap">${e.stack || e.message || e}</pre>
      </div>
    `
  }
})()
