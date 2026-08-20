/**
 * useSettings — 设置页共享状态与操作
 *
 * PC（pages/pc/Settings.svelte）与移动端（pages/mobile/Settings.svelte）的
 * 两套模板（class 体系不同）共用这一份逻辑，避免两边各改一次而产生漂移。
 *
 * 用法：
 *   const s = useSettings()
 *   s.lyricsBlur              // 响应式读
 *   s.handleLyricsBlur(!s.lyricsBlur)
 */
import { ncm } from '../api/client.js'
import { player, clearHistory } from '../stores/player.svelte.js'
import { auth } from '../stores/auth.svelte.js'
import { i18n, setLocale } from '../i18n/index.svelte.js'
import { getBooleanSetting, getSetting, setBooleanSetting, setSetting } from '../utils/settings.js'
import { getLayoutMode, setLayoutMode } from '../utils/layout-mode.js'
import { dbCache } from '../db/cache.js'

export const QUALITY_LABELS = {
  lossless: '无损',
  exhigh: '极高',
  higher: '较高',
  standard: '标准',
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

export function useSettings() {
  let defaultPage = $state(getSetting('default_page', 'home'))
  let layoutMode = $state(getLayoutMode())
  let restoreSession = $state(getBooleanSetting('restore_session', 'true'))
  let lyricsBlur = $state(getBooleanSetting('lyrics_blur_effect', 'true'))
  let lyricsTextBlur = $state(getBooleanSetting('lyrics_text_blur_effect', 'true'))
  let currentLocale = $state(i18n.locale)
  let preferredQuality = $state(player.preferredLevel)

  let clearMsg = $state('')
  let clearCacheMsg = $state('')
  let cacheSizeText = $state('0 B')
  let idbCacheText = $state('计算中…')
  let idbCleared = $state('')
  let cookieCheckMsg = $state('')
  let apiBaseStatus = $state('')
  let apiBaseValue = $state(ncm.getBase())

  // 定时器管理器：组件销毁时统一清理，防止销毁后仍回写 state
  const timers = new Set()
  function safeTimeout(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }
  function clearSafeTimer(id) {
    if (id == null) return
    clearTimeout(id)
    timers.delete(id)
  }

  let saveBaseTimer = null

  function refreshCacheSize() {
    const stats = ncm.getCacheStats()
    cacheSizeText = stats.entries > 0 ? `${formatBytes(stats.bytes)} · ${stats.entries} 项` : '0 B'
  }

  async function refreshIdbCache() {
    try {
      const stats = await dbCache.getStats()
      idbCacheText = stats.available
        ? `API ${stats.apiCache} 项 · 歌曲 ${stats.urlCache} 首`
        : '不可用'
    } catch { idbCacheText = '不可用' }
  }

  $effect(() => {
    refreshCacheSize()
    refreshIdbCache()
    return () => timers.forEach(id => clearTimeout(id))
  })

  function handleSetApiBase(url) {
    apiBaseValue = url
    clearSafeTimer(saveBaseTimer)
    const value = url.trim()
    if (!value) return

    saveBaseTimer = safeTimeout(() => {
      try {
        new URL(value) // 验证格式
        ncm.setBase(value)
        apiBaseStatus = '已保存'
        safeTimeout(() => apiBaseStatus = '', 2000)
      } catch {
        apiBaseStatus = '地址格式无效'
        safeTimeout(() => apiBaseStatus = '', 2000)
      }
    }, 500)
  }

  function handleDefaultPage(val) {
    defaultPage = setSetting('default_page', val)
  }

  function handleLayoutMode(val) {
    layoutMode = setLayoutMode(val)
  }

  function handleRestoreSession(val) {
    restoreSession = setBooleanSetting('restore_session', val) === 'true'
  }

  function handleLyricsBlur(val) {
    lyricsBlur = setBooleanSetting('lyrics_blur_effect', val) === 'true'
    window.dispatchEvent(new CustomEvent('lyrics-blur-change', { detail: lyricsBlur }))
  }

  function handleLyricsTextBlur(val) {
    lyricsTextBlur = setBooleanSetting('lyrics_text_blur_effect', val) === 'true'
    window.dispatchEvent(new CustomEvent('lyrics-text-blur-change', { detail: lyricsTextBlur }))
  }

  function handleLocale(val) {
    currentLocale = val
    setLocale(val)
  }

  // 读回 player 而非直接用入参：setPreferredLevel 会校验 QUALITY_ORDER，非法值应保持原状
  function handleQuality(val) {
    player.setPreferredLevel(val)
    preferredQuality = player.preferredLevel
  }

  function handleClearHistory() {
    clearHistory()
    clearMsg = '已清除'
    safeTimeout(() => clearMsg = '', 2000)
  }

  async function handleClearCache() {
    await ncm.clearCache()
    refreshCacheSize()
    await refreshIdbCache()
    clearCacheMsg = '已清除'
    safeTimeout(() => clearCacheMsg = '', 2000)
  }

  async function handleClearIdbCache() {
    await dbCache.clearAll()
    await refreshIdbCache()
    idbCleared = '已清除'
    safeTimeout(() => idbCleared = '', 2000)
  }

  async function handleCheckCookie() {
    if (!auth.isLoggedIn) {
      cookieCheckMsg = '未登录，无需检测'
      safeTimeout(() => cookieCheckMsg = '', 3000)
      return
    }
    cookieCheckMsg = '检测中…'
    try {
      cookieCheckMsg = await auth.checkLoginStatus()
        ? 'Cookie 正常 · 登录有效'
        : 'Cookie 已过期，已自动清除登录状态'
    } catch {
      cookieCheckMsg = '检测失败，请重试'
    }
    safeTimeout(() => cookieCheckMsg = '', 4000)
  }

  return {
    get defaultPage() { return defaultPage },
    get layoutMode() { return layoutMode },
    get restoreSession() { return restoreSession },
    get lyricsBlur() { return lyricsBlur },
    get lyricsTextBlur() { return lyricsTextBlur },
    get currentLocale() { return currentLocale },
    get preferredQuality() { return preferredQuality },
    get clearMsg() { return clearMsg },
    get clearCacheMsg() { return clearCacheMsg },
    get cacheSizeText() { return cacheSizeText },
    get idbCacheText() { return idbCacheText },
    get idbCleared() { return idbCleared },
    get cookieCheckMsg() { return cookieCheckMsg },
    get apiBaseStatus() { return apiBaseStatus },
    get apiBaseValue() { return apiBaseValue },

    handleSetApiBase,
    handleDefaultPage,
    handleLayoutMode,
    handleRestoreSession,
    handleLyricsBlur,
    handleLyricsTextBlur,
    handleLocale,
    handleQuality,
    handleClearHistory,
    handleClearCache,
    handleClearIdbCache,
    handleCheckCookie,
  }
}
