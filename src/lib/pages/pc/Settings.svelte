<script>
  import { ncm } from '../../api/client.js'
  import { player, clearHistory } from '../../stores/player.svelte.js'
  import { auth } from '../../stores/auth.svelte.js'
  import { i18n, setLocale, t } from '../../i18n/index.svelte.js'
  import { getBooleanSetting, getSetting, setBooleanSetting, setSetting } from '../../utils/settings.js'
  import { getLayoutMode, setLayoutMode } from '../../utils/layout-mode.js'
  import { dbCache } from '../../db/cache.js'

  let { theme = 'dark', onSetTheme } = $props()

  let clearMsg = $state('')
  let clearCacheMsg = $state('')
  let cacheSizeText = $state('0 B')
  let idbCacheText = $state('计算中…')
  let idbCleared = $state('')
  let cookieCheckMsg = $state('')
  let apiBaseStatus = $state('')
  let defaultPage = $state(getSetting('default_page', 'home'))
  let layoutMode = $state(getLayoutMode())
  let restoreSession = $state(getBooleanSetting('restore_session', 'true'))
  let lyricsBlur = $state(getBooleanSetting('lyrics_blur_effect', 'true'))
  let lyricsTextBlur = $state(getBooleanSetting('lyrics_text_blur_effect', 'true'))
  let preferredQuality = $state(player.preferredLevel)
  let currentLocale = $state(i18n.locale)

  // 定时器管理器：防止组件销毁后定时器仍运行
  const timers = new Set()
  function safeTimeout(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  let saveBaseTimer = null

  function handleSetApiBase(url) {
    clearTimeout(saveBaseTimer)
    timers.delete(saveBaseTimer)
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
    return () => timers.forEach(id => clearTimeout(id)) // 组件销毁清理
  })

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

  function handleQuality(val) {
    player.setPreferredLevel(val)
    preferredQuality = player.preferredLevel
  }

  function handleLocale(val) {
    currentLocale = val
    setLocale(val)
  }

  async function handleCheckCookie() {
    if (!auth.isLoggedIn) {
      cookieCheckMsg = '未登录，无需检测'
      setTimeout(() => cookieCheckMsg = '', 3000)
      return
    }
    cookieCheckMsg = '检测中…'
    try {
      const ok = await auth.checkLoginStatus()
      if (ok) {
        cookieCheckMsg = 'Cookie 正常 · 登录有效'
      } else {
        cookieCheckMsg = 'Cookie 已过期，已自动清除登录状态'
      }
    } catch {
      cookieCheckMsg = '检测失败，请重试'
    }
    setTimeout(() => cookieCheckMsg = '', 4000)
  }

  const qualityLabels = {
    lossless: '无损',
    exhigh: '极高',
    higher: '较高',
    standard: '标准',
  }
</script>

<div class="settings-page fade-in">
  <div class="settings-header">
    <div>
      <span class="settings-kicker">Preferences</span>
      <h1>设置</h1>
      <p>调整播放、启动和界面偏好，让哲听更贴近你的使用习惯。</p>
    </div>
  </div>

  <div class="settings-panel">

    <!-- 主题 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">主题模式</div>
        <div class="settings-desc">切换明暗主题</div>
      </div>
      <div class="segmented-control">
        <button
          class:active={theme === 'light'}
          onclick={() => onSetTheme?.('light')}
        >浅色</button>
        <button
          class:active={theme === 'dark'}
          onclick={() => onSetTheme?.('dark')}
        >深色</button>
      </div>
    </div>

    <div class="settings-group-label">界面与播放</div>

    <!-- 语言 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">{t('settings.language', '语言')}</div>
        <div class="settings-desc">{t('settings.languageDesc', '界面语言')}</div>
      </div>
      <select class="settings-select" value={currentLocale} onchange={(e) => handleLocale(e.target.value)}>
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </div>

    <!-- 默认音质 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">{t('settings.quality', '默认音质')}</div>
        <div class="settings-desc">{t('settings.qualityDesc', '优先使用的音质等级')}</div>
      </div>
      <select class="settings-select" value={preferredQuality} onchange={(e) => handleQuality(e.target.value)}>
        {#each Object.entries(qualityLabels) as [val, label]}
          <option value={val}>{label}</option>
        {/each}
      </select>
    </div>

    <!-- 默认页面 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">{t('settings.defaultPage', '启动默认页面')}</div>
        <div class="settings-desc">{t('settings.defaultPageDesc', '启动时自动打开的页面')}</div>
      </div>
      <select class="settings-select" value={defaultPage} onchange={(e) => handleDefaultPage(e.target.value)}>
        <option value="home">{t('page.home', '主页')}</option>
        <option value="explore">{t('page.explore', '发现')}</option>
        <option value="library">{t('page.library', '资料库')}</option>
      </select>
    </div>

    <!-- 布局模式 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">布局模式</div>
        <div class="settings-desc">自动时手机使用移动布局，平板可手动切换到 PC 布局获得更大内容空间</div>
      </div>
      <select class="settings-select" value={layoutMode} onchange={(e) => handleLayoutMode(e.target.value)}>
        <option value="auto">自动</option>
        <option value="pc">PC 布局（大屏推荐）</option>
        <option value="mobile">移动布局</option>
      </select>
    </div>

    <!-- 记住播放 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">{t('settings.restoreSession', '记住上次播放')}</div>
        <div class="settings-desc">{t('settings.restoreSessionDesc', '启动时恢复上次的播放进度')}</div>
      </div>
      <button class="switch-control" class:on={restoreSession} aria-pressed={restoreSession} onclick={() => handleRestoreSession(!restoreSession)}>
        <span>{restoreSession ? t('common.on', '开') : t('common.off', '关')}</span>
      </button>
    </div>

    <!-- 歌词背景模糊 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">歌词背景模糊</div>
        <div class="settings-desc">关闭后歌词页不再使用专辑封面模糊背景，减少视觉干扰和 GPU 开销</div>
      </div>
      <button class="switch-control" class:on={lyricsBlur} aria-pressed={lyricsBlur} onclick={() => handleLyricsBlur(!lyricsBlur)}>
        <span>{lyricsBlur ? t('common.on', '开') : t('common.off', '关')}</span>
      </button>
    </div>

    <!-- 歌词文字模糊 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">歌词文字模糊</div>
        <div class="settings-desc">非当前播放行的文字模糊效果，关闭后所有歌词都以清晰样式显示</div>
      </div>
      <button class="switch-control" class:on={lyricsTextBlur} aria-pressed={lyricsTextBlur} onclick={() => handleLyricsTextBlur(!lyricsTextBlur)}>
        <span>{lyricsTextBlur ? t('common.on', '开') : t('common.off', '关')}</span>
      </button>
    </div>

    <div class="settings-group-label">本地数据</div>

    <!-- 清除历史 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">{t('settings.clearHistory', '清除播放历史')}</div>
        <div class="settings-desc">{t('settings.clearHistoryDesc', '删除所有本地播放记录')}</div>
      </div>
      <button class="settings-secondary-btn" onclick={handleClearHistory}>
        {clearMsg || t('settings.clear', '清除')}
      </button>
    </div>

    <!-- 清除接口缓存 (localStorage) -->
    <div class="settings-row">
      <div>
        <div class="settings-label">清除接口缓存</div>
        <div class="settings-desc">当前缓存 {cacheSizeText}，清除后下次访问会重新请求</div>
      </div>
      <button class="settings-secondary-btn" onclick={handleClearCache}>
        {clearCacheMsg || t('settings.clear', '清除')}
      </button>
    </div>

    <!-- 数据库缓存 (IndexedDB) -->
    <div class="settings-row">
      <div>
        <div class="settings-label">数据库缓存</div>
        <div class="settings-desc">{idbCacheText} · 包含歌曲 URL 和 API 响应</div>
      </div>
      <button class="settings-secondary-btn" onclick={handleClearIdbCache}>
        {idbCleared || '清除'}
      </button>
    </div>

    <div class="settings-group-label">账号</div>

    <!-- 检测 Cookie 状态 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">会员状态</div>
        <div class="settings-desc">用于判断账号权限和高音质可用性，不会绕过平台限制</div>
      </div>
      <button class="settings-secondary-btn" onclick={() => auth.refreshVipInfo()}>
        {auth.vipLabel}
      </button>
    </div>

    <div class="settings-row">
      <div>
        <div class="settings-label">检测 Cookie 状态</div>
        <div class="settings-desc">验证当前登录凭证是否有效，失效时会自动清除并退出登录</div>
      </div>
      <button class="settings-secondary-btn" onclick={handleCheckCookie}>
        {cookieCheckMsg || '检测'}
      </button>
    </div>

    <div class="settings-group-label">高级</div>

    <!-- API 后端地址 -->
    <div class="settings-row">
      <div style="flex: 1;">
        <div class="settings-label">API 后端地址</div>
        <div class="settings-desc">自定义网易云音乐 API 服务器地址，修改后自动保存并立即生效</div>
      </div>
    </div>
    <div class="settings-row" style="border-bottom: none; padding-top: 0;">
      <div style="flex: 1;">
        <input
          type="url"
          class="settings-input"
          placeholder="https://your-api-server.com"
          value={ncm.getBase()}
          oninput={(e) => handleSetApiBase(e.target.value)}
        />
        <div class="settings-desc" style="margin-top: 8px;">
          内置地址：<code>https://music.xubuyuan.top</code>
          {#if apiBaseStatus}
            <span style="margin-left: 8px; color: var(--accent);">· {apiBaseStatus}</span>
          {/if}
        </div>
      </div>
    </div>

  </div>
</div>

<style>
  .settings-page {
    display: grid;
    gap: 18px;
  }

  .settings-header {
    display: grid;
    gap: 18px;
    padding-bottom: 6px;
  }

  .settings-kicker,
  .settings-group-label {
    color: var(--accent);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .settings-header h1 {
    margin: 6px 0;
    font-size: clamp(34px, 4vw, 46px);
    line-height: 1;
    letter-spacing: 0;
  }

  .settings-header p {
    max-width: 560px;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.7;
  }

  .settings-panel {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-elevated) 70%, transparent);
    backdrop-filter: blur(24px) saturate(150%);
    -webkit-backdrop-filter: blur(24px) saturate(150%);
  }

  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    min-height: 68px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
  }

  .settings-row:last-child {
    border-bottom: none;
  }

  .settings-group-label {
    padding: 18px 18px 8px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg-layer) 32%, transparent);
  }

  .settings-label {
    font-size: 15px;
    font-weight: 700;
  }

  .settings-desc {
    color: var(--text-tertiary);
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.45;
  }

  .settings-desc code {
    font-family: ui-monospace, 'SF Mono', Menlo, Monaco, monospace;
    font-size: 11px;
    padding: 2px 6px;
    background: var(--bg-layer);
    border-radius: 4px;
    color: var(--accent);
  }

  .settings-input {
    width: 100%;
    padding: 10px 14px;
    font-family: inherit;
    font-size: 14px;
    color: var(--text);
    background: var(--bg-layer);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    outline: none;
    transition: border-color 0.2s;
  }

  .settings-input:focus {
    border-color: var(--accent);
  }

  .settings-input::placeholder {
    color: var(--text-tertiary);
  }

  .segmented-control {
    display: inline-flex;
    gap: 3px;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-layer);
  }

  .segmented-control button {
    min-width: 64px;
    min-height: 32px;
    padding: 0 14px;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
    transition: background 0.16s, color 0.16s, box-shadow 0.16s;
  }

  .segmented-control button.active {
    background: var(--bg-elevated);
    color: var(--text);
    box-shadow: var(--shadow-sm);
  }

  .settings-secondary-btn {
    min-height: 36px;
    padding: 0 16px;
    border-radius: var(--radius-lg);
    font-size: 13px;
    font-weight: 750;
    white-space: nowrap;
    transition: background 0.15s, transform 0.15s;
  }

  .settings-secondary-btn {
    background: var(--accent-bg);
    color: var(--accent);
  }

  .settings-secondary-btn:hover {
    background: var(--accent-bg-hover);
  }

  .settings-secondary-btn:active {
    transform: scale(0.96);
  }

  .settings-select {
    min-width: 138px;
    min-height: 36px;
    padding: 0 34px 0 12px;
    border-radius: var(--radius-lg);
    font-size: 13px;
    font-weight: 650;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text);
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .settings-select:focus {
    border-color: var(--accent);
  }

  .switch-control {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    width: 58px;
    height: 32px;
    padding: 0 7px;
    border-radius: 999px;
    background: var(--bg-hover);
    color: transparent;
    transition: background 0.18s;
  }

  .switch-control::after {
    content: '';
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--bg-elevated);
    box-shadow: var(--shadow-sm);
    transition: transform 0.18s var(--ease-out);
  }

  .switch-control.on {
    background: var(--accent);
  }

  .switch-control.on::after {
    transform: translateX(20px);
  }

  .switch-control span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  @media (max-width: 760px) {
    .settings-page {
      gap: 12px;
    }

    .settings-header {
      gap: 10px;
      padding-bottom: 0;
    }

    .settings-kicker,
    .settings-group-label {
      font-size: 10px;
    }

    .settings-header h1 {
      margin: 4px 0;
      font-size: 28px;
      line-height: 1.08;
    }

    .settings-header p {
      font-size: 13px;
      line-height: 1.5;
    }

    .settings-panel {
      border-radius: 18px;
    }

    .settings-row {
      gap: 12px;
      min-height: 58px;
      padding: 12px 14px;
    }

    .settings-group-label {
      padding: 14px 14px 7px;
    }

    .settings-label {
      font-size: 14px;
    }

    .settings-desc {
      font-size: 11px;
    }

    .settings-secondary-btn {
      width: 100%;
    }

    .segmented-control {
      width: min(100%, 180px);
      flex-shrink: 0;
      align-self: flex-end;
    }

    .segmented-control button {
      flex: 1;
      min-width: 0;
      min-height: 30px;
      padding: 0 10px;
      font-size: 12px;
    }

    .settings-select {
      min-width: 116px;
      min-height: 34px;
      font-size: 12px;
    }

    .settings-secondary-btn {
      min-height: 34px;
      font-size: 12px;
    }

    .switch-control {
      width: 52px;
      height: 30px;
      padding: 0 6px;
      flex-shrink: 0;
    }

    .switch-control::after {
      width: 22px;
      height: 22px;
    }

    .switch-control.on::after {
      transform: translateX(18px);
    }
  }
</style>
