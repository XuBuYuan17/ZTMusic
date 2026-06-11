<script>
  import { ncm } from '../api/client.js'
  import { player, clearHistory } from '../stores/player.svelte.js'
  import { i18n, setLocale, t } from '../i18n/index.svelte.js'

  let { theme = 'dark', onSetTheme } = $props()

  let apiUrl = $state(ncm.getBase())
  let testStatus = $state('')
  let testMsg = $state('')
  let testTime = $state(0)

  let clearMsg = $state('')
  let defaultPage = $state(getLS('default_page', 'home'))
  let restoreSession = $state(getLS('restore_session', 'true') === 'true')
  let preferredQuality = $state(player.preferredLevel)
  let currentLocale = $state(i18n.locale)

  function getLS(key, def) {
    try { return localStorage.getItem(key) || def } catch { return def }
  }
  function setLS(key, val) {
    try { localStorage.setItem(key, val) } catch {}
  }

  function saveUrl() {
    let url = apiUrl.trim().replace(/\/+$/, '')
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url
    }
    apiUrl = url
    ncm.setBase(url)
  }

  async function testConnection() {
    saveUrl()
    testStatus = 'testing'
    testMsg = ''
    testTime = 0
    const start = performance.now()
    try {
      const res = await ncm.banner()
      const elapsed = Math.round(performance.now() - start)
      if (res && (res.code === 200 || res.banners || res.code === undefined)) {
        testStatus = 'ok'
        testTime = elapsed
        testMsg = `连接成功 (${elapsed}ms)`
      } else {
        testStatus = 'fail'
        testMsg = `返回异常 code=${res?.code ?? 'unknown'}`
      }
    } catch (e) {
      testStatus = 'fail'
      testMsg = e.message || '连接失败'
    }
  }

  function handleClearHistory() {
    clearHistory()
    clearMsg = '已清除'
    setTimeout(() => clearMsg = '', 2000)
  }

  function handleDefaultPage(val) {
    defaultPage = val
    setLS('default_page', val)
  }

  function handleRestoreSession(val) {
    restoreSession = val
    setLS('restore_session', val ? 'true' : 'false')
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

<div class="fade-in">
  <div class="page-header">
    <h1>设置</h1>
    <div class="subtitle">主题和后端 API 配置</div>
  </div>

  <div style="margin-top:16px;">

    <!-- 主题 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">主题模式</div>
        <div class="settings-desc">切换明暗主题</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button
          class="settings-toggle"
          style={theme === 'light' ? 'background:var(--accent);color:#fff;' : 'background:var(--bg-hover);color:var(--text-secondary);'}
          onclick={() => onSetTheme?.('light')}
        >浅色</button>
        <button
          class="settings-toggle"
          style={theme === 'dark' ? 'background:var(--accent);color:#fff;' : 'background:var(--bg-hover);color:var(--text-secondary);'}
          onclick={() => onSetTheme?.('dark')}
        >深色</button>
      </div>
    </div>

    <!-- API 地址 -->
    <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px;">
      <div>
        <div class="settings-label">后端 API 地址</div>
        <div class="settings-desc">NeteaseCloudMusicApi 服务地址，修改后自动保存</div>
      </div>
      <div style="display:flex;gap:8px;">
        <input
          class="settings-input"
          type="text"
          placeholder="http://localhost:3000"
          bind:value={apiUrl}
          onchange={saveUrl}
        />
        <button class="settings-test-btn" onclick={testConnection} disabled={testStatus === 'testing'}>
          {testStatus === 'testing' ? '测试中...' : '测试连接'}
        </button>
      </div>
      {#if testStatus === 'ok'}
        <div class="settings-test-ok">✅ {testMsg}</div>
      {:else if testStatus === 'fail'}
        <div class="settings-test-fail">❌ {testMsg}</div>
      {/if}
    </div>

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
      <button class="settings-toggle" style={restoreSession ? 'background:var(--accent);color:#fff;' : 'background:var(--bg-hover);color:var(--text-secondary);'} onclick={() => handleRestoreSession(!restoreSession)}>
        {restoreSession ? t('common.on', '开') : t('common.off', '关')}
      </button>
    </div>

    <!-- 清除历史 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">{t('settings.clearHistory', '清除播放历史')}</div>
        <div class="settings-desc">{t('settings.clearHistoryDesc', '删除所有本地播放记录')}</div>
      </div>
      <button class="settings-test-btn" onclick={handleClearHistory}>
        {clearMsg || t('settings.clear', '清除')}
      </button>
    </div>

  </div>
</div>

<style>
  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 0;
    border-bottom: 1px solid var(--border);
  }

  .settings-label {
    font-size: 14px;
    font-weight: 500;
  }

  .settings-desc {
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 2px;
  }

  .settings-toggle {
    padding: 6px 16px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
  }

  .settings-input {
    flex: 1;
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 14px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text);
    outline: none;
    transition: border-color 0.15s;
    min-width: 0;
  }

  .settings-input:focus {
    border-color: var(--accent);
  }

  .settings-test-btn {
    padding: 8px 18px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    background: var(--accent);
    color: #fff;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, transform 0.15s;
  }

  .settings-test-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .settings-test-btn:active:not(:disabled) {
    transform: scale(0.96);
  }

  .settings-test-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .settings-select {
    padding: 6px 14px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
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

  .settings-test-ok {
    font-size: 13px;
    color: #34c759;
    font-weight: 500;
  }

  .settings-test-fail {
    font-size: 13px;
    color: var(--accent);
    font-weight: 500;
  }
</style>
