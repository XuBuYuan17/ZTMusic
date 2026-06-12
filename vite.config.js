import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte()
  ],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  server: {
    proxy: {
      '/ncm-api': {
        target: 'https://music.xubuyuan.top',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ncm-api/, '')
      },
      '/user': 'https://music.xubuyuan.top',
      '/api': 'https://music.xubuyuan.top',
    }
  }
})
