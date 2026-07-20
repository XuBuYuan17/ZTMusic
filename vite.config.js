import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import https from 'node:https'

const PROXY_TARGET = 'https://music.xubuyuan.top'
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 8,
  maxFreeSockets: 4,
  timeout: 25000,
  rejectUnauthorized: true,
})
// 禁用 Node.js 全局代理，避免走系统代理
process.env.NO_PROXY = '*'
process.env.no_proxy = '*'
process.env.HTTP_PROXY = ''
process.env.http_proxy = ''
process.env.HTTPS_PROXY = ''
process.env.https_proxy = ''

// Tauri/Android 的 WebView 通过自定义协议加载资源，带 crossorigin 的 module 脚本/样式
// 会因 CORS 被拦截，导致只显示未渲染的裸 HTML。此插件移除 crossorigin 属性。
// - transformIndexHtml：处理 index.html 里的静态入口标签
// - generateBundle：处理 Vite 预加载 helper 运行时动态注入的 <link>（如按需加载的
//   app-mobile.css），它会执行 `o.crossOrigin=''`，改成 `=null` 即不写入该属性，
//   同时不影响封面取色用的 `crossOrigin="anonymous"`。
const stripCrossorigin = () => ({
  name: 'strip-crossorigin',
  transformIndexHtml(html) {
    return html.replace(/\s+crossorigin(=["'][^"']*["'])?/g, '')
  },
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type !== 'chunk') continue
      // 仅匹配空字符串赋值（预加载 helper 注入的 link），保留 ="anonymous" 等有值写法
      file.code = file.code.replace(/\.crossOrigin\s*=\s*(""|''|``)/g, '.crossOrigin=null')
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    stripCrossorigin(),
  ],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  server: {
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
    watch: {
      usePolling: false,
      interval: 100,
    },
    proxy: {
      '/ncm-api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ncm-api/, ''),
        timeout: 25000,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.error('[proxy] error:', err.message, req.url)
            try {
              if (!res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ code: 503, msg: 'Proxy upstream error' }))
              }
            } catch {}
          })
        },
        agent: httpsAgent,
        headers: { Connection: 'keep-alive' },
        followRedirects: true,
      },
      '/user': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: true,
        timeout: 25000,
        agent: httpsAgent,
        headers: { Connection: 'keep-alive' },
      },
      '/api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: true,
        timeout: 25000,
        agent: httpsAgent,
        headers: { Connection: 'keep-alive' },
      },
    }
  },
  build: {
    // sql.js WASM 文件不能内联，必须作为独立资源加载
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // 确保 WASM 使用可缓存的文件名格式
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  optimizeDeps: {
    force: false,
  },
  clearScreen: false,
})
