import './app.css'

;(async () => {
  try {
    const { mount } = await import('svelte')
    const { default: App } = await import('./App.svelte')
    mount(App, { target: document.getElementById('app') })
  } catch (e) {
    document.getElementById('app').innerHTML = `
      <div style="padding:40px;color:white;font-family:sans-serif">
        <h2>哲听 加载失败</h2>
        <pre style="color:#ff6a6a;margin-top:16px;white-space:pre-wrap">${e.stack || e.message || e}</pre>
      </div>
    `
  }
})()
