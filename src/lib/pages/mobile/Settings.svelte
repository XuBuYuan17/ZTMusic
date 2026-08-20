<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { t } from '../../i18n/index.svelte.js'
  import { QUALITY_LABELS, useSettings } from '../../composables/useSettings.svelte.js'
  import { wallpaper } from '../../stores/wallpaper.svelte.js'
  import { formatWallpaperSize } from '../../services/wallpaper-storage.js'
  import { ACCENT_THEME_OPTIONS } from '../../theme/accent.js'
  import pkg from '../../../../package.json'
  import Icon from '../../components/ui/Icon.svelte'

  let { theme = 'dark', accentTheme = 'red', onSetTheme, onSetAccentTheme } = $props()

  const settings = useSettings()
  const qualityLabels = QUALITY_LABELS
  let wallpaperInput = $state(null)
  let wallpaperStatus = $derived(
    wallpaper.error || (wallpaper.active
      ? `${wallpaper.kind === 'video' ? '视频' : '图片'} · ${wallpaper.name} · ${formatWallpaperSize(wallpaper.size)}`
      : '图片 ≤ 30 MB，视频 ≤ 300 MB'),
  )

  async function handleWallpaperFile(event) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (file) await wallpaper.selectFile(file)
    input.value = ''
  }
</script>

<div class="m-page m-settings">
  <header class="m-settings-header">
    <span class="m-settings-kicker">Preferences</span>
    <h1>设置</h1>
    <p>调整播放、启动和界面偏好。</p>
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
      <div class="m-settings-row m-settings-row--accent">
        <div class="m-settings-row-info">
          <span class="m-settings-label">主题配色</span>
          <span class="m-settings-desc">预设强调色或跟随歌曲封面</span>
        </div>
        <div class="m-accent-picker" role="radiogroup" aria-label="主题配色">
          {#each ACCENT_THEME_OPTIONS as option}
            <button
              type="button"
              role="radio"
              aria-label={option.label}
              aria-checked={accentTheme === option.value}
              class:active={accentTheme === option.value}
              onclick={() => onSetAccentTheme?.(option.value)}
            >
              <span style={`--accent-preview:${option.preview}`}></span>
            </button>
          {/each}
        </div>
      </div>
      <div class="m-settings-row m-settings-row--wallpaper">
        <div class="m-settings-row-info">
          <span class="m-settings-label">自定义壁纸</span>
          <span class="m-settings-desc" class:error={wallpaper.error}>{wallpaperStatus}</span>
        </div>
        <div class="m-wallpaper-actions">
          <input
            bind:this={wallpaperInput}
            class="m-wallpaper-file-input"
            type="file"
            accept="image/*,video/*"
            onchange={handleWallpaperFile}
          />
          <button disabled={wallpaper.loading} onclick={() => wallpaperInput?.click()}>
            {wallpaper.loading ? '处理中…' : wallpaper.active ? '更换' : '选择'}
          </button>
          {#if wallpaper.active}
            <button class="remove" disabled={wallpaper.loading} onclick={() => wallpaper.clear()}>移除</button>
          {/if}
        </div>
      </div>
      {#if wallpaper.kind === 'video'}
        <div class="m-settings-row">
          <div class="m-settings-row-info">
            <span class="m-settings-label">播放动态壁纸</span>
            <span class="m-settings-desc">静音循环，应用进入后台时自动暂停</span>
          </div>
          <button class="m-switch" class:on={wallpaper.videoPlaying} aria-pressed={wallpaper.videoPlaying} onclick={() => wallpaper.setVideoPlaying(!wallpaper.videoPlaying)}>
            <span>{wallpaper.videoPlaying ? '开' : '关'}</span>
          </button>
        </div>
      {/if}
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
          <button class:active={settings.currentLocale === 'zh'} onclick={() => settings.handleLocale('zh')}>中文</button>
          <button class:active={settings.currentLocale === 'en'} onclick={() => settings.handleLocale('en')}>EN</button>
        </div>
      </div>

      <!-- 默认音质 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">{t('settings.quality', '默认音质')}</span>
          <span class="m-settings-desc">{t('settings.qualityDesc', '优先使用的音质等级')}</span>
        </div>
        <select class="m-settings-select" value={settings.preferredQuality} onchange={(e) => settings.handleQuality(e.target.value)}>
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
        <select class="m-settings-select" value={settings.defaultPage} onchange={(e) => settings.handleDefaultPage(e.target.value)}>
          <option value="home">{t('page.home', '主页')}</option>
          <option value="explore">{t('page.explore', '发现')}</option>
          <option value="library">{t('page.library', '资料库')}</option>
        </select>
      </div>

      <!-- 布局模式 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">布局模式</span>
          <span class="m-settings-desc">自动时手机使用移动布局，平板可手动切换到 PC 布局获得更大内容空间</span>
        </div>
        <select class="m-settings-select" value={settings.layoutMode} onchange={(e) => settings.handleLayoutMode(e.target.value)}>
          <option value="auto">自动</option>
          <option value="pc">PC 布局（大屏推荐）</option>
          <option value="mobile">移动布局</option>
        </select>
      </div>

      <!-- 记住播放 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">{t('settings.restoreSession', '记住上次播放')}</span>
          <span class="m-settings-desc">{t('settings.restoreSessionDesc', '启动时恢复上次的播放进度')}</span>
        </div>
        <button class="m-switch" class:on={settings.restoreSession} aria-pressed={settings.restoreSession} onclick={() => settings.handleRestoreSession(!settings.restoreSession)}>
          <span>{settings.restoreSession ? t('common.on', '开') : t('common.off', '关')}</span>
        </button>
      </div>

      <!-- 歌词背景模糊 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">歌词背景模糊</span>
          <span class="m-settings-desc">关闭后歌词页不再使用专辑封面模糊背景</span>
        </div>
        <button class="m-switch" class:on={settings.lyricsBlur} aria-pressed={settings.lyricsBlur} onclick={() => settings.handleLyricsBlur(!settings.lyricsBlur)}>
          <span>{settings.lyricsBlur ? t('common.on', '开') : t('common.off', '关')}</span>
        </button>
      </div>

      <!-- 歌词文字模糊 -->
      <div class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">歌词文字模糊</span>
          <span class="m-settings-desc">非当前播放行的文字模糊效果</span>
        </div>
        <button class="m-switch" class:on={settings.lyricsTextBlur} aria-pressed={settings.lyricsTextBlur} onclick={() => settings.handleLyricsTextBlur(!settings.lyricsTextBlur)}>
          <span>{settings.lyricsTextBlur ? t('common.on', '开') : t('common.off', '关')}</span>
        </button>
      </div>
    </div>
  </section>

  <!-- 本地数据 -->
  <section class="m-settings-group">
    <div class="m-settings-group-label">本地数据</div>
    <div class="m-settings-card">
      <button class="m-settings-row m-settings-row--action" onclick={settings.handleClearHistory}>
        <div class="m-settings-row-info">
          <span class="m-settings-label">{t('settings.clearHistory', '清除播放历史')}</span>
          <span class="m-settings-desc">{t('settings.clearHistoryDesc', '删除所有本地播放记录')}</span>
        </div>
        <span class="m-settings-action-text">{settings.clearMsg || t('settings.clear', '清除')}</span>
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

        <button class="m-settings-row m-settings-row--action" onclick={settings.handleCheckCookie}>
          <div class="m-settings-row-info">
            <span class="m-settings-label">检测 Cookie 状态</span>
            <span class="m-settings-desc">验证当前登录凭证是否有效</span>
          </div>
          <span class="m-settings-action-text">{settings.cookieCheckMsg || '检测'}</span>
        </button>
      </div>
    </section>
  {/if}

  <!-- 开发者选项 -->
  <section class="m-settings-group">
    <div class="m-settings-group-label">开发者</div>
    <details class="m-settings-card m-developer-options">
      <summary class="m-settings-row">
        <div class="m-settings-row-info">
          <span class="m-settings-label">开发者选项</span>
          <span class="m-settings-desc">后端 API 与缓存管理</span>
        </div>
        <Icon class="m-developer-chevron" name="chevron-down" size={18} />
      </summary>
      <div class="m-developer-content">
        <div class="m-settings-row m-settings-row--input">
          <div class="m-settings-row-info">
            <span class="m-settings-label">API 后端地址</span>
            <span class="m-settings-desc">
              内置地址：<code>https://music.xubuyuan.top</code>
                {#if settings.apiBaseStatus}
                  <span class="m-settings-status"> · {settings.apiBaseStatus}</span>
                {/if}
            </span>
          </div>
          <input
            type="url"
            class="m-settings-input"
            placeholder="https://your-api-server.com"
            value={settings.apiBaseValue}
            oninput={(e) => settings.handleSetApiBase(e.target.value)}
          />
        </div>
        <button class="m-settings-row m-settings-row--action" onclick={settings.handleClearCache}>
          <div class="m-settings-row-info">
            <span class="m-settings-label">清除接口缓存</span>
            <span class="m-settings-desc">当前缓存 {settings.cacheSizeText}</span>
          </div>
          <span class="m-settings-action-text">{settings.clearCacheMsg || t('settings.clear', '清除')}</span>
        </button>
        <button class="m-settings-row m-settings-row--action" onclick={settings.handleClearIdbCache}>
          <div class="m-settings-row-info">
            <span class="m-settings-label">清除持久缓存</span>
            <span class="m-settings-desc">{settings.idbCacheText}</span>
          </div>
          <span class="m-settings-action-text">{settings.idbCleared || t('settings.clear', '清除')}</span>
        </button>
      </div>
    </details>
  </section>

  <!-- 关于 -->
  <section class="m-settings-group">
    <div class="m-settings-group-label">关于</div>
    <div class="m-settings-card">
      <div class="m-settings-row m-settings-row--static">
        <div class="m-settings-row-info">
          <span class="m-settings-label">版本</span>
        </div>
        <span class="m-settings-value">{pkg.version}</span>
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
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .m-settings-header h1 {
    margin: 6px 0 4px;
    font-size: 32px;
    line-height: 1.08;
    font-weight: 700;
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
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .m-settings-card {
    overflow: hidden;
    border-radius: var(--radius-lg);
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

  .m-settings-row--input {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    cursor: default;
  }

  .m-settings-row--input:active {
    background: transparent;
  }

  .m-developer-options > summary {
    list-style: none;
  }

  .m-developer-options > summary::-webkit-details-marker { display: none; }

  :global(.m-developer-chevron) {
    flex-shrink: 0;
    color: var(--text-tertiary);
    transition: transform var(--dur-fast);
  }

  .m-developer-options[open] :global(.m-developer-chevron) {
    transform: rotate(180deg);
  }

  .m-developer-content {
    border-top: 0.5px solid color-mix(in srgb, var(--border) 72%, transparent);
    background: color-mix(in srgb, var(--bg-layer) 24%, transparent);
  }

  .m-settings-row--wallpaper {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
    cursor: default;
  }

  .m-settings-row--accent {
    align-items: flex-start;
  }

  .m-accent-picker {
    max-width: 164px;
    display: grid;
    grid-template-columns: repeat(4, 34px);
    gap: 6px;
    flex-shrink: 0;
  }

  .m-accent-picker button {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: var(--bg-layer);
    transition: background var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast);
  }

  .m-accent-picker button:active { transform: scale(0.92); }

  .m-accent-picker button.active {
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
    background: var(--accent-bg);
  }

  .m-accent-picker button span {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent-preview);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.3), 0 0 0 1px rgba(0,0,0,0.08);
  }

  .m-settings-row--wallpaper:active {
    background: transparent;
  }

  .m-wallpaper-actions {
    width: 100%;
    display: flex;
    gap: 8px;
  }

  .m-wallpaper-actions button {
    min-height: 34px;
    flex: 1;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--accent-bg);
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
  }

  .m-wallpaper-actions button.remove {
    background: var(--bg-layer);
    color: var(--text-secondary);
  }

  .m-wallpaper-actions button:disabled {
    opacity: 0.55;
  }

  .m-wallpaper-file-input {
    display: none;
  }

  .m-settings-desc.error {
    color: var(--accent);
  }

  .m-settings-input {
    width: 100%;
    padding: 10px 12px;
    font-family: inherit;
    font-size: 14px;
    color: var(--text);
    background: var(--bg-layer);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: none;
  }

  .m-settings-input:focus {
    border-color: var(--accent);
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
    font-weight: 500;
    line-height: 1.3;
  }

  .m-settings-desc {
    color: var(--text-tertiary);
    font-size: 11px;
    line-height: 1.4;
  }

  .m-settings-desc code {
    font-family: ui-monospace, 'SF Mono', Menlo, Monaco, monospace;
    font-size: 10px;
    padding: 1px 5px;
    background: var(--bg-layer);
    border-radius: 3px;
    color: var(--accent);
  }

  .m-settings-status {
    color: var(--accent);
  }

  .m-settings-value {
    min-width: 22px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    color: var(--text-tertiary);
    font-size: 14px;
    font-weight: 500;
  }

  .m-settings-action-text {
    flex-shrink: 0;
    color: var(--accent);
    font-size: 13px;
    font-weight: 500;
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
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--bg-layer) 86%, #8e8e93 14%);
  }

  .m-segmented--sm {
    grid-template-columns: auto auto;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-sm);
    width: fit-content;
    min-width: 100px;
  }

  .m-segmented button {
    min-height: 30px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
  }

  .m-segmented--sm button {
    min-height: 28px;
    padding: 0 12px;
    border-radius: var(--radius-xs);
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
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
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
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-elevated) 94%, var(--bg-layer));
    color: #ff3b30;
    font-size: 16px;
    font-weight: 500;
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
