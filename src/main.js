import './app.css'
import { layoutMode } from './lib/utils/layout-mode.js'
import { installNativeShell } from './lib/app/native-shell.js'

installNativeShell()

async function loadLayoutCss() {
  const mode = layoutMode()
  if (mode === 'mobile') {
    await import('./app-mobile.css')
  } else {
    await import('./app-pc.css')
  }
}

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

function syncMobileRuntime(state) {
  document.documentElement.classList.toggle('mobile-runtime', state.isMobile)
}

// 唯一响应式来源：layoutMode store → mobile-runtime class → CSS 选择器
layoutMode.subscribe(syncMobileRuntime)

function hideSplash() {
  const splash = document.getElementById('splash')
  if (!splash) return
  // 读一次布局强制 reflow，确保 opacity 过渡有起点（mount 极快时同帧加 class 会被合并）
  void splash.offsetHeight
  splash.classList.add('splash-hide')
  // transitionend 兜底：万一未触发也移除，避免 splash 永久挡住界面
  const remove = () => splash.remove()
  splash.addEventListener('transitionend', remove, { once: true })
  setTimeout(remove, 700)
}

;(async () => {
  try {
    // 按需加载布局 CSS
    await loadLayoutCss()
    
    // 开屏最小展示时间：ZT Music 光弧扫过 + Music/Loading 入场
    const MIN_SPLASH_DURATION = 3800
    await new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_DURATION))

    const { mount } = await import('svelte')
    const { default: App } = await import('./App.svelte')
    mount(App, { target: document.getElementById('app') })
    hideSplash()
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
