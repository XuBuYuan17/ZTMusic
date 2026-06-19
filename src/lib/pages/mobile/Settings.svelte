<script>
  import { ncm } from '../../api/client.js'
  import { player, clearHistory } from '../../stores/player.svelte.js'
  import { auth } from '../../stores/auth.svelte.js'
  import { i18n, setLocale, t } from '../../i18n/index.svelte.js'
  import { getBooleanSetting, getSetting, setBooleanSetting, setSetting } from '../../utils/settings.js'
  import { dbCache } from '../../db/cache.js'

  let {
    theme = 'dark',
    onSetTheme,
  } = $props()

  let clearMsg = $state('')
  let clearCacheMsg = $state('')
  let idbCleared = $state('')
  let cacheSizeText = $state('计算中…')
  let idbCacheText = $state('计算中…')
  let cookieCheckMsg = $state('')
  let defaultPage = $state(getSetting('default_page', 'home'))
  let restoreSession = $state(getBooleanSetting('restore_session', 'true'))
  let lyricsBlur = $state(getBooleanSetting('lyrics_blur_effect', 'true'))
  let lyricsTextBlur = $state(getBooleanSetting('lyrics_text_blur_effect', 'true'))
  let preferredQuality = $state(player.preferredLevel)
  let currentLocale = $state(i18n.locale)

  const qualityLabels = {
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
    while (value >= 1024 && unitIndex < units.length - 1) { value /= 1024; unitIndex += 1 }
    const precision = value >= 10 || unitIndex === 0 ? 0 : 1
    return `${value.toFixed(precision)} ${units[unitIndex]}`
  }

  function refreshCacheSize() {
    const stats = ncm.getCacheStats()
    cacheSizeText = stats.entries > 0 ? `${formatBytes(stats.bytes)} · ${stats.entries} 项` : '0 B'
  }

  async function refreshIdbCache() {
    try {
      const stats = await dbCache.getStats()
      idbCacheText = stats.available ? `API ${stats.apiCache} 项 · 歌曲 ${stats.urlCache} 首` : '不可用'
    } catch { idbCacheText = '不可用' }
  }

  $effect(() => { refreshCacheSize(); refreshIdbCache() })

  function handleClearHistory() { clearHistory(); clearMsg = '已清除'; setTimeout(() => clearMsg = '', 2000) }
  async function handleClearApiCache() { await ncm.clearCache(); refreshCacheSize(); await refreshIdbCache(); clearCacheMsg = '已清除'; setTimeout(() => clearCacheMsg = '', 2000) }
  async function handleClearIdbCache() { await dbCache.clearAll(); await refreshIdbCache(); idbCleared = '已清除'; setTimeout(() => idbCleared = '', 2000) }
  function handleDefaultPage(val) { defaultPage = setSetting('default_page', val) }
  function handleRestoreSession(val) { restoreSession = setBooleanSetting('restore_session', val) === 'true' }
  function handleLyricsBlur(val) { lyricsBlur = setBooleanSetting('lyrics_blur_effect', val) === 'true'; window.dispatchEvent(new CustomEvent('lyrics-blur-change', { detail: lyricsBlur })) }
  function handleLyricsTextBlur(val) { lyricsTextBlur = setBooleanSetting('lyrics_text_blur_effect', val) === 'true'; window.dispatchEvent(new CustomEvent('lyrics-text-blur-change', { detail: lyricsTextBlur })) }
  function handleQuality(val) { player.setPreferredLevel(val); preferredQuality = player.preferredLevel }
  function handleLocale(val) { currentLocale = val; setLocale(val) }

  async function handleCheckCookie() {
    if (!auth.isLoggedIn) { cookieCheckMsg = '未登录，无需检测'; setTimeout(() => cookieCheckMsg = '', 3000); return }
    cookieCheckMsg = '检测中…'
    try {
      const ok = await auth.checkLoginStatus()
      cookieCheckMsg = ok ? 'Cookie 正常 · 登录有效' : 'Cookie 已过期，已自动清除登录状态'
    } catch { cookieCheckMsg = '检测失败，请重试' }
    setTimeout(() => cookieCheckMsg = '', 4000)
  }
</script>

<div class="mset-page">
  <h1 class="mset-title">设置</h1>

  <!-- 界面与播放 -->
  <div class="mset-group">
    <div class="mset-group-label">界面与播放</div>
    <div class="mset-divider"></div>

    <button class="mset-row" onclick={() => onSetTheme?.(theme === 'dark' ? 'light' : 'dark')}>
      <span class="mset-row-label">主题模式</span>
      <span class="mset-row-value">{theme === 'dark' ? '深色' : '浅色'}</span>
      <span class="mset-row-arrow">›</span>
    </button>
    <div class="mset-divider"></div>

    <div class="mset-row mset-row-select">
      <span class="mset-row-label">语言</span>
      <select class="mset-select" value={currentLocale} onchange={(e) => handleLocale(e.target.value)}>
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </div>
    <div class="mset-divider"></div>

    <div class="mset-row mset-row-select">
      <span class="mset-row-label">默认音质</span>
      <select class="mset-select" value={preferredQuality} onchange={(e) => handleQuality(e.target.value)}>
        {#each Object.entries(qualityLabels) as [val, label]}
          <option value={val}>{label}</option>
        {/each}
      </select>
    </div>
    <div class="mset-divider"></div>

    <div class="mset-row mset-row-select">
      <span class="mset-row-label">启动默认页面</span>
      <select class="mset-select" value={defaultPage} onchange={(e) => handleDefaultPage(e.target.value)}>
        <option value="home">首页</option>
        <option value="browse">浏览</option>
        <option value="library">资料库</option>
      </select>
    </div>
    <div class="mset-divider"></div>

    <button class="mset-row" onclick={() => handleRestoreSession(!restoreSession)}>
      <span class="mset-row-label">记住上次播放</span>
      <span class="mset-row-value">{restoreSession ? '开' : '关'}</span>
      <span class="mset-row-arrow">›</span>
    </button>
    <div class="mset-divider"></div>

    <button class="mset-row" onclick={() => handleLyricsBlur(!lyricsBlur)}>
      <span class="mset-row-label">歌词背景模糊</span>
      <span class="mset-row-value">{lyricsBlur ? '开' : '关'}</span>
      <span class="mset-row-arrow">›</span>
    </button>
    <div class="mset-divider"></div>

    <button class="mset-row" onclick={() => handleLyricsTextBlur(!lyricsTextBlur)}>
      <span class="mset-row-label">歌词文字模糊</span>
      <span class="mset-row-value">{lyricsTextBlur ? '开' : '关'}</span>
      <span class="mset-row-arrow">›</span>
    </button>
  </div>

  <!-- 本地数据 -->
  <div class="mset-group">
    <div class="mset-group-label">本地数据</div>
    <div class="mset-divider"></div>

    <button class="mset-row" onclick={handleClearHistory}>
      <span class="mset-row-label">清除播放历史</span>
      <span class="mset-row-value">{clearMsg || '清除'}</span>
      <span class="mset-row-arrow">›</span>
    </button>
    <div class="mset-divider"></div>

    <button class="mset-row" onclick={async () => { await ncm.clearCache(); refreshCacheSize(); await refreshIdbCache(); clearCacheMsg = '已清除'; setTimeout(() => clearCacheMsg = '', 2000) }}>
      <span class="mset-row-label">清除接口缓存</span>
      <span class="mset-row-value">{clearCacheMsg || cacheSizeText}</span>
      <span class="mset-row-arrow">›</span>
    </button>
    <div class="mset-divider"></div>

    <button class="mset-row" onclick={async () => { await dbCache.clearAll(); await refreshIdbCache(); idbCleared = '已清除'; setTimeout(() => idbCleared = '', 2000) }}>
      <span class="mset-row-label">数据库缓存</span>
      <span class="mset-row-value">{idbCleared || idbCacheText}</span>
      <span class="mset-row-arrow">›</span>
    </button>
  </div>

  <!-- 账号 -->
  <div class="mset-group">
    <div class="mset-group-label">账号</div>
    <div class="mset-divider"></div>

    <div class="mset-row" style="cursor:default">
      <span class="mset-row-label">账户</span>
      <span class="mset-row-value">{auth.user?.nickname || auth.user?.email || '未登录'}</span>
    </div>
    <div class="mset-divider"></div>

    <button class="mset-row" onclick={handleCheckCookie}>
      <span class="mset-row-label">检测 Cookie 状态</span>
      <span class="mset-row-value">{cookieCheckMsg || '检测'}</span>
      <span class="mset-row-arrow">›</span>
    </button>
  </div>

  <!-- 关于 -->
  <div class="mset-group">
    <div class="mset-group-label">关于</div>
    <div class="mset-divider"></div>

    <div class="mset-row" style="cursor:default">
      <span class="mset-row-label">版本</span>
      <span class="mset-row-value">1.0</span>
    </div>
  </div>
</div>

<style>
  .mset-page {
    padding: 0 0 20px;
  }

  .mset-title {
    padding: 6px 20px 10px;
    font-size: 28px;
    font-weight: 800;
    color: #fff;
    letter-spacing: 0;
  }

  .mset-group {
    margin: 12px 16px;
    background: #1c1c1e;
    border-radius: 10px;
    overflow: hidden;
  }

  .mset-group-label {
    padding: 10px 16px 6px;
    font-size: 12px;
    font-weight: 700;
    color: #8e8e93;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .mset-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 13px 16px;
    border: none;
    background: none;
    color: #fff;
    font-size: 15px;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s;
    -webkit-tap-highlight-color: transparent;
  }

  .mset-row:active {
    background: #2c2c2e;
  }

  .mset-row-select {
    cursor: default;
  }

  .mset-row-select:active {
    background: transparent;
  }

  .mset-row-label {
    flex: 1;
    min-width: 0;
  }

  .mset-row-value {
    font-size: 14px;
    color: #8e8e93;
    flex-shrink: 0;
  }

  .mset-row-arrow {
    color: #8e8e93;
    font-size: 18px;
    flex-shrink: 0;
  }

  .mset-select {
    background: #2c2c2e;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 14px;
    font-weight: 500;
    outline: none;
    cursor: pointer;
    appearance: auto;
  }

  .mset-divider {
    height: 0.5px;
    margin-left: 16px;
    background: rgba(255,255,255,0.04);
  }
</style>
