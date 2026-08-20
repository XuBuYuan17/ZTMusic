<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { t } from '../../i18n/index.svelte.js'
  import { QUALITY_LABELS, useSettings } from '../../composables/useSettings.svelte.js'
  import { wallpaper } from '../../stores/wallpaper.svelte.js'
  import { formatWallpaperSize } from '../../services/wallpaper-storage.js'
  import { ACCENT_THEME_OPTIONS } from '../../theme/accent.js'
  import pkg from '../../../../package.json'

  let { theme = 'dark', accentTheme = 'red', onSetTheme, onSetAccentTheme } = $props()

  const settings = useSettings()
  const qualityLabels = QUALITY_LABELS
  let wallpaperInput = $state(null)
  let wallpaperStatus = $derived(
    wallpaper.error || (wallpaper.active
      ? `${wallpaper.kind === 'video' ? '视频' : '图片'} · ${wallpaper.name} · ${formatWallpaperSize(wallpaper.size)}`
      : '未设置 · 图片不超过 30 MB，视频不超过 300 MB'),
  )

  async function handleWallpaperFile(event) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (file) await wallpaper.selectFile(file)
    input.value = ''
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

    <div class="settings-row settings-row--palette">
      <div>
        <div class="settings-label">主题配色</div>
        <div class="settings-desc">选择界面强调色，或跟随当前歌曲封面自动取色</div>
      </div>
      <div class="accent-picker" role="radiogroup" aria-label="主题配色">
        {#each ACCENT_THEME_OPTIONS as option}
          <button
            type="button"
            role="radio"
            aria-checked={accentTheme === option.value}
            class:active={accentTheme === option.value}
            onclick={() => onSetAccentTheme?.(option.value)}
            title={option.label}
          >
            <span class="accent-swatch" style={`--accent-preview:${option.preview}`}></span>
            <span>{option.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="settings-row settings-row--wallpaper">
      <div>
        <div class="settings-label">自定义壁纸</div>
        <div class="settings-desc" class:error={wallpaper.error}>{wallpaperStatus}</div>
      </div>
      <div class="wallpaper-actions">
        <input
          bind:this={wallpaperInput}
          class="wallpaper-file-input"
          type="file"
          accept="image/*,video/*"
          onchange={handleWallpaperFile}
        />
        <button class="settings-secondary-btn" disabled={wallpaper.loading} onclick={() => wallpaperInput?.click()}>
          {wallpaper.loading ? '处理中…' : wallpaper.active ? '更换' : '选择文件'}
        </button>
        {#if wallpaper.active}
          <button class="settings-secondary-btn wallpaper-remove-btn" disabled={wallpaper.loading} onclick={() => wallpaper.clear()}>移除</button>
        {/if}
      </div>
    </div>

    {#if wallpaper.kind === 'video'}
      <div class="settings-row">
        <div>
          <div class="settings-label">播放动态壁纸</div>
          <div class="settings-desc">静音循环播放；窗口进入后台时自动暂停</div>
        </div>
        <button class="switch-control" class:on={wallpaper.videoPlaying} aria-pressed={wallpaper.videoPlaying} onclick={() => wallpaper.setVideoPlaying(!wallpaper.videoPlaying)}>
          <span>{wallpaper.videoPlaying ? '开' : '关'}</span>
        </button>
      </div>
    {/if}

    <div class="settings-group-label">界面与播放</div>

    <!-- 语言 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">{t('settings.language', '语言')}</div>
        <div class="settings-desc">{t('settings.languageDesc', '界面语言')}</div>
      </div>
      <select class="settings-select" value={settings.currentLocale} onchange={(e) => settings.handleLocale(e.target.value)}>
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
      <select class="settings-select" value={settings.preferredQuality} onchange={(e) => settings.handleQuality(e.target.value)}>
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
      <select class="settings-select" value={settings.defaultPage} onchange={(e) => settings.handleDefaultPage(e.target.value)}>
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
      <select class="settings-select" value={settings.layoutMode} onchange={(e) => settings.handleLayoutMode(e.target.value)}>
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
      <button class="switch-control" class:on={settings.restoreSession} aria-pressed={settings.restoreSession} onclick={() => settings.handleRestoreSession(!settings.restoreSession)}>
        <span>{settings.restoreSession ? t('common.on', '开') : t('common.off', '关')}</span>
      </button>
    </div>

    <!-- 歌词背景模糊 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">歌词背景模糊</div>
        <div class="settings-desc">关闭后歌词页不再使用专辑封面模糊背景，减少视觉干扰和 GPU 开销</div>
      </div>
      <button class="switch-control" class:on={settings.lyricsBlur} aria-pressed={settings.lyricsBlur} onclick={() => settings.handleLyricsBlur(!settings.lyricsBlur)}>
        <span>{settings.lyricsBlur ? t('common.on', '开') : t('common.off', '关')}</span>
      </button>
    </div>

    <!-- 歌词文字模糊 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">歌词文字模糊</div>
        <div class="settings-desc">非当前播放行的文字模糊效果，关闭后所有歌词都以清晰样式显示</div>
      </div>
      <button class="switch-control" class:on={settings.lyricsTextBlur} aria-pressed={settings.lyricsTextBlur} onclick={() => settings.handleLyricsTextBlur(!settings.lyricsTextBlur)}>
        <span>{settings.lyricsTextBlur ? t('common.on', '开') : t('common.off', '关')}</span>
      </button>
    </div>

    <div class="settings-group-label">本地数据</div>

    <!-- 清除历史 -->
    <div class="settings-row">
      <div>
        <div class="settings-label">{t('settings.clearHistory', '清除播放历史')}</div>
        <div class="settings-desc">{t('settings.clearHistoryDesc', '删除所有本地播放记录')}</div>
      </div>
      <button class="settings-secondary-btn" onclick={settings.handleClearHistory}>
        {settings.clearMsg || t('settings.clear', '清除')}
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
      <button class="settings-secondary-btn" onclick={settings.handleCheckCookie}>
        {settings.cookieCheckMsg || '检测'}
      </button>
    </div>

    <div class="settings-group-label">开发者</div>

    <details class="developer-options">
      <summary>
        <span>
          <strong>开发者选项</strong>
          <small>后端 API、接口缓存与歌曲 URL 缓存</small>
        </span>
        <span class="developer-chevron" aria-hidden="true"></span>
      </summary>
      <div class="developer-options-content">
        <div class="settings-row settings-row--developer-input">
          <div>
            <div class="settings-label">API 后端地址</div>
            <div class="settings-desc">自定义兼容的音乐 API 服务，修改后自动保存并立即生效</div>
          </div>
          <input
            type="url"
            class="settings-input"
            placeholder="https://your-api-server.com"
            value={settings.apiBaseValue}
            oninput={(e) => settings.handleSetApiBase(e.target.value)}
          />
          <div class="settings-desc developer-api-hint">
            内置地址：<code>https://music.xubuyuan.top</code>
            {#if settings.apiBaseStatus}
              <span class="developer-status">· {settings.apiBaseStatus}</span>
            {/if}
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">清除接口缓存</div>
            <div class="settings-desc">当前缓存 {settings.cacheSizeText}，清除后下次访问会重新请求</div>
          </div>
          <button class="settings-secondary-btn" onclick={settings.handleClearCache}>
            {settings.clearCacheMsg || t('settings.clear', '清除')}
          </button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">清除持久缓存</div>
            <div class="settings-desc">{settings.idbCacheText} · 包含歌曲 URL 和 API 响应</div>
          </div>
          <button class="settings-secondary-btn" onclick={settings.handleClearIdbCache}>
            {settings.idbCleared || '清除'}
          </button>
        </div>
      </div>
    </details>

    <!-- 关于 -->
    <div class="settings-group-label">关于</div>
    <div class="settings-row settings-row--static">
      <span class="settings-label">版本</span>
      <span class="settings-value">{pkg.version}</span>
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
    font-weight: 700;
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

  .settings-value {
    color: var(--text-tertiary);
    font-size: 14px;
    font-weight: 500;
  }

  .settings-row--static {
    cursor: default;
  }

  .developer-options > summary {
    min-height: 68px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    list-style: none;
    cursor: pointer;
    transition: background var(--dur-fast);
  }

  .developer-options > summary::-webkit-details-marker { display: none; }
  .developer-options > summary:hover { background: var(--bg-hover); }

  .developer-options > summary span:first-child {
    display: grid;
    gap: 3px;
  }

  .developer-options > summary strong {
    font-size: 15px;
    font-weight: 700;
  }

  .developer-options > summary small {
    color: var(--text-tertiary);
    font-size: 12px;
  }

  .developer-chevron {
    width: 9px;
    height: 9px;
    flex-shrink: 0;
    border-right: 2px solid var(--text-tertiary);
    border-bottom: 2px solid var(--text-tertiary);
    transform: rotate(45deg) translateY(-2px);
    transition: transform var(--dur-fast);
  }

  .developer-options[open] .developer-chevron {
    transform: rotate(225deg) translate(-2px, -2px);
  }

  .developer-options-content {
    background: color-mix(in srgb, var(--bg-layer) 20%, transparent);
  }

  .settings-row--developer-input {
    align-items: stretch;
    flex-direction: column;
  }

  .developer-api-hint { margin-top: -8px; }
  .developer-status { margin-left: 8px; color: var(--accent); }

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
    font-weight: 700;
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

  .settings-row--palette {
    align-items: flex-start;
  }

  .accent-picker {
    width: min(430px, 58%);
    display: grid;
    grid-template-columns: repeat(4, minmax(82px, 1fr));
    gap: 6px;
  }

  .accent-picker button {
    min-width: 0;
    min-height: 34px;
    padding: 0 9px;
    display: flex;
    align-items: center;
    gap: 7px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: var(--bg-layer);
    color: var(--text-secondary);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
  }

  .accent-picker button:hover { background: var(--bg-hover); }
  .accent-picker button:active { transform: scale(0.97); }

  .accent-picker button.active {
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    background: var(--accent-bg);
    color: var(--text);
  }

  .accent-swatch {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--accent-preview);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.28), 0 0 0 1px rgba(0,0,0,0.08);
  }

  .settings-secondary-btn:disabled {
    opacity: 0.55;
    cursor: default;
    transform: none;
  }

  .settings-desc.error {
    color: var(--accent);
  }

  .wallpaper-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .wallpaper-file-input {
    display: none;
  }

  .wallpaper-remove-btn {
    background: var(--bg-layer);
    color: var(--text-secondary);
  }

  .settings-select {
    min-width: 138px;
    min-height: 36px;
    padding: 0 34px 0 12px;
    border-radius: var(--radius-lg);
    font-size: 13px;
    font-weight: 700;
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
      border-radius: var(--radius-lg);
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

    .settings-row--wallpaper {
      align-items: flex-start;
      flex-direction: column;
    }

    .settings-row--palette {
      display: grid;
      gap: 12px;
    }

    .accent-picker {
      width: 100%;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .wallpaper-actions {
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
