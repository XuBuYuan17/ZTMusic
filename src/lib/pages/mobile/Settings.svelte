<script>
  import { ncm } from '../../api/client.js'
  import { player, clearHistory } from '../../stores/player.svelte.js'
  import { auth } from '../../stores/auth.svelte.js'
  import { i18n, setLocale, t } from '../../i18n/index.svelte.js'
  import { getBooleanSetting, getSetting, setBooleanSetting, setSetting } from '../../utils/settings.js'
  import { getLayoutMode, setLayoutMode } from '../../utils/layout-mode.js'
  import { dbCache } from '../../db/cache.js'
  import Icon from '../../components/ui/Icon.svelte'

  let { theme = 'dark', onSetTheme } = $props()

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
  })

  function setQuality(level) {
    preferredQuality = level
    player.setPreferredLevel?.(level)
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
    lyricsBlur = setBooleanSetting('lyrics_blur_effect', val)
    window.dispatchEvent(new CustomEvent('lyrics-blur-change', { detail: lyricsBlur }))
  }

  function handleLyricsTextBlur(val) {
    lyricsTextBlur = setBooleanSetting('lyrics_text_blur_effect', val)
    window.dispatchEvent(new CustomEvent('lyrics-text-blur-change', { detail: lyricsTextBlur }))
  }

  function handleLocale(val) {
    currentLocale = val
    setLocale(val)
  }

  function handleClearHistory() {
    clearHistory()
    clearMsg = '已清除'
    setTimeout(() => clearMsg = '', 2000)
  }

  async function handleClearCache() {
    await ncm.clearCache()
    refreshCacheSize()
    await refreshIdbCache()
    clearCacheMsg = '已清除'
    setTimeout(() => clearCacheMsg = '', 2000)
  }

  async function handleClearIdbCache() {
    await dbCache.clearAll()
    await refreshIdbCache()
    idbCleared = '已清除'
    setTimeout(() => idbCleared = '', 2000)
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
</script>

<div class="m-page m-settings">
  <header class="m-settings-header">
    <span class="m-settings-kicker">Preferences</span>
    <h1>设置</h1>
    <p>调整播放、启动和界面偏好，让哲听更贴近你的使用习惯。</p>
  </header>

  <!-- 外观 -->
  <section class="m-settings-group">
    <div class="m-settings-group-label">外观</div>
    <div class="m-settings-card">
      <div class="m-settings-row m-settings-row--segmented">
        <div class="m-settings-row-info">
          <span class="m-settings-label">主题模式</span>
          <span class="m-settings-desc">切换明暗主题</span>
        </div>
        <div class="m-segmented" aria-label="主题模式">
          <button class:active={theme === 'light'} onclick={() => onSetTheme?.('light')}>浅色</button>
          <button class:active={theme === 'dark'} onclick={() => onSetTheme?.('dark')}>深色</button>
        </div>
      </div>
    </div>
  </section>

  <!-- 界面与播放 -->
  <section class="m-settings-group">
    <div class="m-settings-group-label">界面与播放</div>
    <div class="m-settings-card">
      <!-- 语言 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">{t('settings.language', '语言')}</span>
          <span class="m-settings-desc">{t('settings.languageDesc', '界面语言')}</span>
        </div>
        <div class="m-segmented m-segmented--sm">
          <button class:active={currentLocale === 'zh'} onclick={() => handleLocale('zh')}>中文</button>
          <button class:active={currentLocale === 'en'} onclick={() => handleLocale('en')}>EN</button>
        </div>
      </div>

      <!-- 默认音质 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">{t('settings.quality', '默认音质')}</span>
          <span class="m-settings-desc">{t('settings.qualityDesc', '优先使用的音质等级')}</span>
        </div>
        <select class="m-settings-select" value={preferredQuality} onchange={(e) => setQuality(e.target.value)}>
          {#each Object.entries(qualityLabels) as [val, label]}
            <option value={val}>{label}</option>
          {/each}
        </select>
      </div>

      <!-- 默认页面 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">{t('settings.defaultPage', '启动默认页面')}</span>
          <span class="m-settings-desc">{t('settings.defaultPageDesc', '启动时自动打开的页面')}</span>
        </div>
        <select class="m-settings-select" value={defaultPage} onchange={(e) => handleDefaultPage(e.target.value)}>
          <option value="home">{t('page.home', '主页')}</option>
          <option value="explore">{t('page.explore', '发现')}</option>
          <option value="library">{t('page.library', '资料库')}</option>
        </select>
      </div>

      <!-- 布局模式 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">布局模式</span>
          <span class="m-settings-desc">自动时手机使用移动布局，平板和电脑使用 PC 布局</span>
        </div>
        <select class="m-settings-select" value={layoutMode} onchange={(e) => handleLayoutMode(e.target.value)}>
          <option value="auto">自动</option>
          <option value="pc">PC</option>
          <option value="mobile">移动</option>
        </select>
      </div>

      <!-- 记住播放 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">{t('settings.restoreSession', '记住上次播放')}</span>
          <span class="m-settings-desc">{t('settings.restoreSessionDesc', '启动时恢复上次的播放进度')}</span>
        </div>
        <button class="m-switch" class:on={restoreSession} aria-pressed={restoreSession} onclick={() => handleRestoreSession(!restoreSession)}>
          <span>{restoreSession ? t('common.on', '开') : t('common.off', '关')}</span>
        </button>
      </div>

      <!-- 歌词背景模糊 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">歌词背景模糊</span>
          <span class="m-settings-desc">关闭后歌词页不再使用专辑封面模糊背景</span>
        </div>
        <button class="m-switch" class:on={lyricsBlur} aria-pressed={lyricsBlur} onclick={() => handleLyricsBlur(!lyricsBlur)}>
          <span>{lyricsBlur ? t('common.on', '开') : t('common.off', '关')}</span>
        </button>
      </div>

      <!-- 歌词文字模糊 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">歌词文字模糊</span>
          <span class="m-settings-desc">非当前播放行的文字模糊效果</span>
        </div>
        <button class="m-switch" class:on={lyricsTextBlur} aria-pressed={lyricsTextBlur} onclick={() => handleLyricsTextBlur(!lyricsTextBlur)}>
          <span>{lyricsTextBlur ? t('common.on', '开') : t('common.off', '关')}</span>
        </button>
      </div>
    </div>
  </section>

  <!-- 本地数据 -->
  <section class="m-settings-group">
    <div class="m-settings-group-label">本地数据</div>
    <div class="m-settings-card">
      <button class="m-settings-row m-settings-row--action" onclick={handleClearHistory}>
        <div class="m-settings-row-info">
          <span class="m-settings-label">{t('settings.clearHistory', '清除播放历史')}</span>
          <span class="m-settings-desc">{t('settings.clearHistoryDesc', '删除所有本地播放记录')}</span>
        </div>
        <span class="m-settings-action-text">{clearMsg || t('settings.clear', '清除')}</span>
      </button>

      <button class="m-settings-row m-settings-row--action" onclick={handleClearCache}>
        <div class="m-settings-row-info">
          <span class="m-settings-label">清除接口缓存</span>
          <span class="m-settings-desc">当前缓存 {cacheSizeText}</span>
        </div>
        <span class="m-settings-action-text">{clearCacheMsg || t('settings.clear', '清除')}</span>
      </button>

      <button class="m-settings-row m-settings-row--action" onclick={handleClearIdbCache}>
        <div class="m-settings-row-info">
          <span class="m-settings-label">数据库缓存</span>
          <span class="m-settings-desc">{idbCacheText}</span>
        </div>
        <span class="m-settings-action-text">{idbCleared || t('settings.clear', '清除')}</span>
      </button>
    </div>
  </section>

  <!-- 账号 -->
  {#if auth.isLoggedIn}
    <section class="m-settings-group">
      <div class="m-settings-group-label">账号</div>
      <div class="m-settings-card">
        <button class="m-settings-row m-settings-row--action" onclick={() => auth.refreshVipInfo()}>
          <div class="m-settings-row-info">
            <span class="m-settings-label">会员状态</span>
            <span class="m-settings-desc">用于判断账号权限和高音质可用性</span>
          </div>
          <span class="m-settings-action-text">{auth.vipLabel}</span>
        </button>

        <button class="m-settings-row m-settings-row--action" onclick={handleCheckCookie}>
          <div class="m-settings-row-info">
            <span class="m-settings-label">检测 Cookie 状态</span>
            <span class="m-settings-desc">验证当前登录凭证是否有效</span>
          </div>
          <span class="m-settings-action-text">{cookieCheckMsg || '检测'}</span>
        </button>
      </div>
    </section>
  {/if}

  <!-- 关于 -->
  <section class="m-settings-group">
    <div class="m-settings-group-label">关于</div>
    <div class="m-settings-card">
      <div class="m-settings-row m-settings-row--static">
        <div class="m-settings-row-info">
          <span class="m-settings-label">版本</span>
        </div>
        <span class="m-settings-value">0.1.0</span>
      </div>
    </div>
  </section>

  <!-- 退出登录 -->
  {#if auth.isLoggedIn}
    <section class="m-settings-group">
      <button class="m-settings-danger" onclick={() => auth.logout()}>
        <Icon name="logout" size={18} />
        退出登录
      </button>
    </section>
  {/if}
</div>

<style>
  .m-settings {
    padding-bottom: 32px;
  }

  .m-settings-header {
    margin: 4px 0 24px;
    padding: 0 4px;
  }

  .m-settings-kicker {
    color: var(--accent);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .m-settings-header h1 {
    margin: 6px 0 4px;
    font-size: 32px;
    line-height: 1.08;
    font-weight: 820;
    letter-spacing: 0;
  }

  .m-settings-header p {
    color: var(--text-tertiary);
    font-size: 13px;
    line-height: 1.5;
  }

  .m-settings-group {
    margin: 0 0 20px;
  }

  .m-settings-group-label {
    margin: 0 0 6px;
    padding: 0 18px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .m-settings-card {
    overflow: hidden;
    border-radius: 16px;
    background: color-mix(in srgb, var(--bg-elevated) 94%, var(--bg-layer));
    border: 0.5px solid color-mix(in srgb, var(--border) 68%, transparent);
    box-shadow: 0 1px 0 rgba(255,255,255,0.35) inset;
  }

  :global([data-theme="dark"]) .m-settings-card {
    background: rgba(34,34,36,0.92);
    border-color: rgba(255,255,255,0.07);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .m-settings-row {
    position: relative;
    width: 100%;
    min-height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .m-settings-row + .m-settings-row::before {
    content: '';
    position: absolute;
    top: 0;
    left: 16px;
    right: 0;
    height: 0.5px;
    background: color-mix(in srgb, var(--border) 72%, transparent);
  }

  .m-settings-row:active {
    background: color-mix(in srgb, var(--bg-hover) 78%, transparent);
  }

  .m-settings-row--static {
    cursor: default;
  }

  .m-settings-row--static:active {
    background: transparent;
  }

  .m-settings-row--segmented {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 14px 16px;
  }

  .m-settings-row-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .m-settings-label {
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
  }

  .m-settings-desc {
    color: var(--text-tertiary);
    font-size: 11px;
    line-height: 1.4;
  }

  .m-settings-value {
    min-width: 22px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    color: var(--text-tertiary);
    font-size: 14px;
    font-weight: 520;
  }

  .m-settings-action-text {
    flex-shrink: 0;
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
  }

  .m-settings-row--action:active .m-settings-action-text {
    opacity: 0.6;
  }

  /* Segmented Control */
  .m-segmented {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 2px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg-layer) 86%, #8e8e93 14%);
  }

  .m-segmented--sm {
    grid-template-columns: auto auto;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    width: fit-content;
    min-width: 100px;
  }

  .m-segmented button {
    min-height: 30px;
    padding: 0 14px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 660;
    cursor: pointer;
    transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
  }

  .m-segmented--sm button {
    min-height: 28px;
    padding: 0 12px;
    border-radius: 6px;
    font-size: 12px;
  }

  .m-segmented button.active {
    background: var(--bg-elevated);
    color: var(--text);
    box-shadow: 0 2px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.32);
  }

  :global([data-theme="dark"]) .m-segmented button.active {
    background: rgba(60,60,62,0.92);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08);
  }

  /* Switch */
  .m-switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    width: 51px;
    height: 31px;
    padding: 0 6px;
    border-radius: 999px;
    background: #e5e5ea;
    color: transparent;
    border: 0;
    cursor: pointer;
    transition: background 0.18s;
    flex-shrink: 0;
  }

  :global([data-theme="dark"]) .m-switch {
    background: rgba(120,120,128,0.36);
  }

  .m-switch::after {
    content: '';
    width: 27px;
    height: 27px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 3px 8px rgba(0,0,0,0.22), 0 0 1px rgba(0,0,0,0.18);
    transition: transform 0.18s cubic-bezier(0.32, 0.94, 0.6, 1);
  }

  .m-switch.on {
    background: var(--accent);
  }

  .m-switch.on::after {
    transform: translateX(20px);
  }

  .m-switch span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  /* Select */
  .m-settings-select {
    min-width: 100px;
    min-height: 32px;
    padding: 0 28px 0 10px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text);
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238e8e93' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
  }

  .m-settings-select:focus {
    border-color: var(--accent);
  }

  /* Danger Button */
  .m-settings-danger {
    width: 100%;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 0;
    border-radius: 14px;
    background: color-mix(in srgb, var(--bg-elevated) 94%, var(--bg-layer));
    color: #ff3b30;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .m-settings-danger:active {
    background: color-mix(in srgb, var(--bg-hover) 78%, transparent);
  }

  :global([data-theme="dark"]) .m-settings-danger {
    background: rgba(34,34,36,0.92);
  }
</style>
