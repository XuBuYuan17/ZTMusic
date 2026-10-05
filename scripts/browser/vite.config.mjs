import { mergeConfig } from 'vite'
import appConfig from '../../vite.config.js'

// Exercise production CSS ordering/minification with the real app configuration.
export default mergeConfig(appConfig, {
  build: { outDir: 'browser-dist', rollupOptions: { input: 'scripts/browser/mobile-render.html' } },
})
