<script>
  import { ncm } from '../api/client.js'

  let { theme = 'dark', onSetTheme } = $props()

  let apiUrl = $state(ncm.getBase())
  let testStatus = $state('')  // '' | 'testing' | 'ok' | 'fail'
  let testMsg = $state('')
  let testTime = $state(0)

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
