import './app.css'

const viewport = document.querySelector('meta[name="viewport"]')
viewport?.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover')

const mobileViewportQuery = window.matchMedia('(max-width: 760px)')
const coarsePointerQuery = window.matchMedia('(pointer: coarse)')
const mobilePlatformQuery = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

function isMobileRuntime() {
  return mobileViewportQuery.matches || coarsePointerQuery.matches || mobilePlatformQuery
}

function syncMobileRuntime() {
  document.documentElement.classList.toggle('mobile-runtime', isMobileRuntime())
}

syncMobileRuntime()
mobileViewportQuery.addEventListener('change', syncMobileRuntime)
coarsePointerQuery.addEventListener('change', syncMobileRuntime)

;(async () => {
  try {
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
