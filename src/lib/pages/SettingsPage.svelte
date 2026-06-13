<script>
  import { ncm } from '../api/client.js'
  import { player, clearHistory } from '../stores/player.svelte.js'
  import { i18n, setLocale, t } from '../i18n/index.svelte.js'
  import { getStorage, setStorage } from '../utils/storage.js'

  let { theme = 'dark', onSetTheme } = $props()

  let clearMsg = $state('')
  let clearCacheMsg = $state('')
  let cacheSizeText = $state('0 B')
  let defaultPage = $state(getStorage('default_page', 'home'))
  let restoreSession = $state(getStorage('restore_session', 'true') === 'true')
  let lyricsBlur = $state(getStorage('lyrics_blur_effect', 'true') === 'true')
  let lyricsTextBlur = $state(getStorage('lyrics_text_blur_effect', 'true') === 'true')
  let preferredQuality = $state(player.preferredLevel)
  let currentLocale = $state(i18n.locale)

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

  $effect(() => {
    refreshCacheSize()
  })

  function handleClearHistory() {
    clearHistory()
    clearMsg = '已清除'
    setTimeout(() => clearMsg = '', 2000)
  }

  function handleClearCache() {
    ncm.clearCache()
    refreshCacheSize()
    clearCacheMsg = '已清除'
    setTimeout(() => clearCacheMsg = '', 2000)
  }

  function handleDefaultPage(val) {
    defaultPage = val
    setStorage('default_page', val)
  }

  function handleRestoreSession(val) {
    restoreSession = val
    setStorage('restore_session', val ? 'true' : 'false')
  }

  function handleLyricsBlur(val) {
    lyricsBlur = val
    setStorage('lyrics_blur_effect', val ? 'true' : 'false')
    window.dispatchEvent(new CustomEvent('lyrics-blur-change', { detail: val }))
  }

  function handleLyricsTextBlur(val) {
    lyricsTextBlur = val
    setStorage('lyrics_text_blur_effect', val ? 'true' : 'false')
    window.dispatchEvent(new CustomEvent('lyrics-text-blur-change', { detail: val }))
  }

  function handleQuality(val) {
    preferredQuality = val
    player.setPreferredLevel(val)
  }

  function handleLocale(val) {
    currentLocale = val
    setLocale(val)
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

    <div class="settings-row">
      <div>
        <div class="settings-label">清除接口缓存</div>
        <div class="settings-desc">当前缓存 {cacheSizeText}，清除后下次访问会重新请求</div>
      </div>
      <button class="settings-secondary-btn" onclick={handleClearCache}>
        {clearCacheMsg || t('settings.clear', '清除')}
      </button>
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
    border-radius: var(--r-lg);
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

  .segmented-control {
    display: inline-flex;
    gap: 3px;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--bg-layer);
  }

  .segmented-control button {
    min-width: 64px;
    min-height: 32px;
    padding: 0 14px;
    border-radius: var(--r-md);
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
    border-radius: var(--r-lg);
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
    border-radius: var(--r-lg);
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
