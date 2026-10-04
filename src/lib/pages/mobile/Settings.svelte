<script lang="ts">
  import { auth } from '../../stores/auth.svelte.ts'
  import { t } from '../../i18n/index.svelte.ts'
  import { DEFAULT_API_BASE, QUALITY_LABELS, useSettings } from '../../composables/useSettings.svelte.ts'
  import { wallpaper } from '../../stores/wallpaper.svelte.ts'
  import { formatWallpaperSize } from '../../services/wallpaper-storage.ts'
  import { ACCENT_THEME_OPTIONS } from '../../theme/accent.ts'
  import { engine } from '../../player/engine.ts'
  import pkg from '../../../../package.json'
  import Icon from '../../components/ui/Icon.svelte'
  import SettingSelect from '../../components/SettingSelect.svelte'
  import AndroidPlayerSettings from '../../components/AndroidPlayerSettings.svelte'

  let { theme = 'dark', accentTheme = 'red', onSetTheme, onSetAccentTheme }: {
    theme?: string
    accentTheme?: string
    onSetTheme?: (theme: string) => void
    onSetAccentTheme?: (theme: string) => void
  } = $props()

  const settings = useSettings()
  const qualityOptions = Object.entries(QUALITY_LABELS).map(([value, label]) => ({ value, label }))
  const defaultPageOptions = [
    { value: 'explore', label: t('page.explore', '发现') },
    { value: 'library', label: t('page.library', '资料库') },
  ]
  const layoutOptions = [
    { value: 'auto', label: '自动' },
    { value: 'pc', label: 'PC 布局' },
    { value: 'mobile', label: '移动布局' },
  ]
  let wallpaperInput = $state<HTMLInputElement | null>(null)
  let wallpaperStatus = $derived(
    wallpaper.error || (wallpaper.active
      ? `${wallpaper.kind === 'video' ? '视频' : '图片'} · ${wallpaper.name} · ${formatWallpaperSize(wallpaper.size)}`
      : '未设置'),
  )

  async function handleWallpaperFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file) await wallpaper.selectFile(file)
    input.value = ''
  }
</script>

<div class="m-settings">
  <p class="m-settings-intro">只保留真正影响使用体验的选项。更少的装饰，更清楚的层级。</p>

  <section class="m-settings-section" aria-labelledby="appearance-settings">
    <h2 id="appearance-settings">外观</h2>
    <div class="m-settings-list">
      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>主题模式</strong>
          <span>明亮或深色界面</span>
        </div>
        <div class="m-segmented" role="group" aria-label="主题模式">
          <button type="button" class:active={theme === 'light'} aria-pressed={theme === 'light'} onclick={() => onSetTheme?.('light')}>浅色</button>
          <button type="button" class:active={theme === 'dark'} aria-pressed={theme === 'dark'} onclick={() => onSetTheme?.('dark')}>深色</button>
        </div>
      </div>

      <div class="m-settings-row m-settings-row--palette">
        <div class="m-settings-copy">
          <strong>强调色</strong>
          <span>也可以跟随正在播放的封面</span>
        </div>
        <div class="m-accent-picker" role="radiogroup" aria-label="主题配色">
          {#each ACCENT_THEME_OPTIONS as option}
            <button
              type="button"
              role="radio"
              aria-label={option.label}
              aria-checked={accentTheme === option.value}
              class:active={accentTheme === option.value}
              title={option.label}
              onclick={() => onSetAccentTheme?.(option.value)}
            ><span style={`--accent-preview:${option.preview}`}></span></button>
          {/each}
        </div>
      </div>

      <div class="m-settings-row m-settings-row--wallpaper">
        <div class="m-settings-copy">
          <strong>自定义壁纸</strong>
          <span class:error={wallpaper.error}>{wallpaperStatus}</span>
        </div>
        <div class="m-inline-actions">
          <input bind:this={wallpaperInput} class="m-file-input" type="file" accept="image/*,video/*" onchange={handleWallpaperFile} />
          <button class="m-text-action" type="button" disabled={wallpaper.loading} onclick={() => wallpaperInput?.click()}>
            {wallpaper.loading ? '处理中…' : wallpaper.active ? '更换' : '选择'}
          </button>
          {#if wallpaper.active}
            <button class="m-text-action muted" type="button" disabled={wallpaper.loading} onclick={() => wallpaper.clear()}>移除</button>
          {/if}
        </div>
      </div>

      {#if wallpaper.kind === 'video'}
        <div class="m-settings-row">
          <div class="m-settings-copy">
            <strong>播放动态壁纸</strong>
            <span>后台时自动暂停</span>
          </div>
          <button class="m-switch" type="button" class:on={wallpaper.videoPlaying} aria-pressed={wallpaper.videoPlaying} onclick={() => wallpaper.setVideoPlaying(!wallpaper.videoPlaying)}><span>{wallpaper.videoPlaying ? '开' : '关'}</span></button>
        </div>
      {/if}
    </div>
  </section>

  <section class="m-settings-section" aria-labelledby="playback-settings">
    <h2 id="playback-settings">播放与歌词</h2>
    <div class="m-settings-list">
      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>{t('settings.quality', '默认音质')}</strong>
          <span>{t('settings.qualityDesc', '优先使用的音质等级')}</span>
        </div>
        <SettingSelect label={t('settings.quality', '默认音质')} value={settings.preferredQuality} options={qualityOptions} onChange={settings.handleQuality} />
      </div>

      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>{t('settings.restoreSession', '记住上次播放')}</strong>
          <span>{t('settings.restoreSessionDesc', '启动时恢复上次的播放进度')}</span>
        </div>
        <button class="m-switch" type="button" class:on={settings.restoreSession} aria-pressed={settings.restoreSession} onclick={() => settings.handleRestoreSession(!settings.restoreSession)}><span>{settings.restoreSession ? '开' : '关'}</span></button>
      </div>

      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>歌词背景模糊</strong>
          <span>使用专辑封面生成歌词页背景</span>
        </div>
        <button class="m-switch" type="button" class:on={settings.lyricsBlur} aria-pressed={settings.lyricsBlur} onclick={() => settings.handleLyricsBlur(!settings.lyricsBlur)}><span>{settings.lyricsBlur ? '开' : '关'}</span></button>
      </div>

      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>歌词文字模糊</strong>
          <span>弱化非当前播放行</span>
        </div>
        <button class="m-switch" type="button" class:on={settings.lyricsTextBlur} aria-pressed={settings.lyricsTextBlur} onclick={() => settings.handleLyricsTextBlur(!settings.lyricsTextBlur)}><span>{settings.lyricsTextBlur ? '开' : '关'}</span></button>
      </div>
    </div>
  </section>

  {#if engine.native}
    <section class="m-settings-section m-settings-section--android" aria-labelledby="android-settings">
      <h2 id="android-settings">Android 功能</h2>
      <div class="m-settings-list m-settings-list--android">
        <AndroidPlayerSettings />
      </div>
    </section>
  {/if}

  <section class="m-settings-section" aria-labelledby="app-settings">
    <h2 id="app-settings">应用</h2>
    <div class="m-settings-list">
      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>{t('settings.language', '语言')}</strong>
          <span>{t('settings.languageDesc', '界面语言')}</span>
        </div>
        <SettingSelect label={t('settings.language', '语言')} value={settings.currentLocale} options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]} onChange={settings.handleLocale} />
      </div>

      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>{t('settings.defaultPage', '启动默认页面')}</strong>
          <span>{t('settings.defaultPageDesc', '启动时自动打开的页面')}</span>
        </div>
        <SettingSelect label={t('settings.defaultPage', '启动默认页面')} value={settings.defaultPage === 'home' ? 'explore' : settings.defaultPage} options={defaultPageOptions} onChange={settings.handleDefaultPage} />
      </div>

      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>布局模式</strong>
          <span>自动模式会根据屏幕方向切换</span>
        </div>
        <SettingSelect label="布局模式" value={settings.layoutMode} options={layoutOptions} onChange={settings.handleLayoutMode} />
      </div>
    </div>
  </section>

  <section class="m-settings-section" aria-labelledby="data-settings">
    <h2 id="data-settings">数据与账号</h2>
    <div class="m-settings-list">
      <button class="m-settings-row m-settings-row--button" type="button" onclick={settings.handleClearHistory}>
        <div class="m-settings-copy">
          <strong>{t('settings.clearHistory', '清除播放历史')}</strong>
          <span>{t('settings.clearHistoryDesc', '删除所有本地播放记录')}</span>
        </div>
        <span class="m-row-value action">{settings.clearMsg || t('settings.clear', '清除')}</span>
      </button>

      {#if auth.isLoggedIn}
        <button class="m-settings-row m-settings-row--button" type="button" onclick={() => auth.refreshVipInfo()}>
          <div class="m-settings-copy">
            <strong>会员状态</strong>
            <span>用于判断高音质等账号权限</span>
          </div>
          <span class="m-row-value">{auth.vipLabel}</span>
        </button>

        <button class="m-settings-row m-settings-row--button" type="button" onclick={settings.handleCheckCookie}>
          <div class="m-settings-copy">
            <strong>登录状态</strong>
            <span>检查当前 Cookie 是否仍然有效</span>
          </div>
          <span class="m-row-value action">{settings.cookieCheckMsg || '检测'}</span>
        </button>
      {/if}
    </div>
  </section>

  <section class="m-settings-section" aria-labelledby="advanced-settings">
    <h2 id="advanced-settings">高级</h2>
    <details class="m-settings-list m-developer-options">
      <summary class="m-settings-row">
        <div class="m-settings-copy">
          <strong>开发者选项</strong>
          <span>API 地址与缓存管理</span>
        </div>
        <Icon class="m-developer-chevron" name="chevron-down" size={18} />
      </summary>
      <div class="m-developer-content">
        <div class="m-settings-row m-settings-row--stacked">
          <div class="m-settings-copy">
            <strong>API 后端地址</strong>
            <span>留空时使用内置地址</span>
          </div>
          <input type="url" class="m-settings-input" placeholder="https://your-api-server.com" value={settings.apiBaseValue} oninput={(e) => settings.handleSetApiBase((e.target as HTMLInputElement).value)} />
          <small class="m-api-hint">{DEFAULT_API_BASE}{#if settings.apiBaseStatus} · {settings.apiBaseStatus}{/if}</small>
        </div>
        <button class="m-settings-row m-settings-row--button" type="button" onclick={settings.handleClearCache}>
          <div class="m-settings-copy"><strong>接口缓存</strong><span>当前 {settings.cacheSizeText}</span></div>
          <span class="m-row-value action">{settings.clearCacheMsg || t('settings.clear', '清除')}</span>
        </button>
        <button class="m-settings-row m-settings-row--button" type="button" onclick={settings.handleClearIdbCache}>
          <div class="m-settings-copy"><strong>持久缓存</strong><span>歌曲 URL 与 API 响应 · {settings.idbCacheText}</span></div>
          <span class="m-row-value action">{settings.idbCleared || t('settings.clear', '清除')}</span>
        </button>
      </div>
    </details>
  </section>

  <section class="m-settings-section" aria-labelledby="about-settings">
    <h2 id="about-settings">关于</h2>
    <div class="m-settings-list">
      <div class="m-settings-row m-settings-row--static">
        <div class="m-settings-copy"><strong>哲听</strong><span>当前版本</span></div>
        <span class="m-row-value">{pkg.version}</span>
      </div>
    </div>
  </section>

  {#if auth.isLoggedIn}
    <button class="m-logout" type="button" onclick={() => auth.logout()}><Icon name="logout" size={17} />退出登录</button>
  {/if}
</div>

<style>
  .m-settings {
    display: grid;
    gap: 22px;
    padding-bottom: 20px;
  }

  .m-settings-intro {
    margin: -4px 2px 0;
    max-width: 32rem;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.55;
  }

  .m-settings-section {
    display: grid;
    gap: 7px;
  }

  .m-settings-section > h2 {
    margin: 0;
    padding: 0 4px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 18px;
    font-weight: 500;
    letter-spacing: .01em;
  }

  .m-settings-list {
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--bg-surface) 88%, var(--bg));
  }

  .m-settings-row {
    position: relative;
    width: 100%;
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 10px 13px;
    border: 0;
    color: var(--text);
    background: transparent;
    font: inherit;
    text-align: left;
  }

  .m-settings-row + .m-settings-row::before,
  .m-developer-content > .m-settings-row:first-child::before {
    content: '';
    position: absolute;
    top: 0;
    left: 13px;
    right: 0;
    height: 1px;
    background: color-mix(in srgb, var(--border) 68%, transparent);
  }

  .m-settings-row--button { cursor: pointer; }
  .m-settings-row--button:active { background: var(--bg-hover); }
  .m-settings-row--static { cursor: default; }

  .m-settings-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .m-settings-copy strong {
    color: var(--text);
    font-size: 14px;
    line-height: 19px;
    font-weight: 500;
  }

  .m-settings-copy span {
    min-width: 0;
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 16px;
    font-weight: 400;
    overflow-wrap: anywhere;
  }

  .m-settings-copy span.error { color: var(--danger); }

  .m-row-value {
    flex: 0 0 auto;
    max-width: 42%;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 17px;
    font-weight: 500;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .m-row-value.action { color: var(--md-primary); }

  .m-segmented {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 116px;
    padding: 2px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--text) 7%, transparent);
  }

  .m-segmented button {
    min-height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--radius-xs);
    color: var(--text-secondary);
    background: transparent;
    font-size: 12px;
    font-weight: 500;
  }

  .m-segmented button.active {
    color: var(--text);
    background: var(--bg);
    box-shadow: 0 1px 3px rgb(0 0 0 / .09);
  }

  .m-settings-row--palette {
    align-items: flex-start;
  }

  .m-accent-picker {
    max-width: 150px;
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 4px;
  }

  .m-accent-picker button {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 50%;
    background: transparent;
  }

  .m-accent-picker button span {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--accent-preview);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / .28), 0 0 0 1px rgb(0 0 0 / .08);
  }

  .m-accent-picker button.active {
    border-color: color-mix(in srgb, var(--md-primary) 45%, transparent);
    background: var(--md-primary-container);
  }

  .m-settings-row--wallpaper { align-items: flex-start; }
  .m-inline-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; }
  .m-file-input { display: none; }

  .m-text-action {
    min-height: 30px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--md-primary);
    background: transparent;
    font-size: 12px;
    font-weight: 500;
  }

  .m-text-action:active { background: var(--bg-hover); }
  .m-text-action.muted { color: var(--text-secondary); }
  .m-text-action:disabled { opacity: .48; }

  .m-switch {
    position: relative;
    flex: 0 0 auto;
    width: 42px;
    height: 24px;
    padding: 3px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-secondary) 28%, transparent);
    transition: background 160ms var(--ease-out);
  }

  .m-switch::after {
    content: '';
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--bg);
    box-shadow: 0 1px 3px rgb(0 0 0 / .18);
    transition: transform 160ms var(--ease-out);
  }

  .m-switch.on { background: var(--md-primary); }
  .m-switch.on::after { transform: translateX(18px); }
  .m-switch span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  :global(.m-settings .mobile-setting-select) {
    min-width: 0;
    min-height: 32px;
    max-width: 45%;
    gap: 4px;
    padding: 0 4px 0 8px;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    background: transparent;
    font-size: 12px;
    font-weight: 500;
    box-shadow: none;
  }

  :global(.m-settings .mobile-setting-select:active) { background: var(--bg-hover); }

  .m-developer-options > summary { list-style: none; cursor: pointer; }
  .m-developer-options > summary::-webkit-details-marker { display: none; }
  :global(.m-developer-chevron) { flex: 0 0 auto; color: var(--text-secondary); transition: transform var(--dur-fast); }
  .m-developer-options[open] :global(.m-developer-chevron) { transform: rotate(180deg); }
  .m-developer-content { border-top: 1px solid color-mix(in srgb, var(--border) 68%, transparent); }

  .m-settings-row--stacked {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .m-settings-input {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    background: var(--bg);
    font: inherit;
    font-size: 12px;
    outline: none;
  }

  .m-settings-input:focus { border-color: color-mix(in srgb, var(--md-primary) 60%, var(--border)); }
  .m-api-hint { color: var(--text-secondary); font-size: 10px; line-height: 15px; overflow-wrap: anywhere; }

  .m-logout {
    justify-self: start;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin: -3px 2px 0;
    padding: 0 11px;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--danger);
    background: transparent;
    font-size: 13px;
    font-weight: 500;
  }

  .m-logout:active { background: color-mix(in srgb, var(--danger) 8%, transparent); }

  /* Android 原生设置在移动端降权：取消大卡片和装饰背景，回到普通设置列表。 */
  :global(.m-settings .desktop-lyrics-card) {
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    overflow: hidden;
  }

  :global(.m-settings .desktop-lyrics-card::before),
  :global(.m-settings .desktop-lyrics-icon),
  :global(.m-settings .settings-eyebrow) { display: none; }

  :global(.m-settings .desktop-lyrics-card + .desktop-lyrics-card) {
    border-top: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
  }

  :global(.m-settings .desktop-lyrics-head) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 11px 13px 8px;
  }

  :global(.m-settings .desktop-lyrics-title h3) {
    font-size: 14px;
    line-height: 19px;
    font-weight: 500;
  }

  :global(.m-settings .desktop-lyrics-title p) {
    margin-top: 2px;
    color: var(--text-secondary);
    font-size: 10.5px;
    line-height: 15px;
  }

  :global(.m-settings .state-pill) {
    min-height: 24px;
    gap: 5px;
    padding: 0 8px;
    font-size: 10px;
    font-weight: 500;
    background: transparent;
  }

  :global(.m-settings .state-pill i) { width: 6px; height: 6px; }

  :global(.m-settings .desktop-lyrics-primary) {
    margin: 0;
    padding: 9px 13px 12px;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    gap: 12px;
    flex-direction: row;
    align-items: center;
  }

  :global(.m-settings .primary-copy) { gap: 2px; }
  :global(.m-settings .primary-copy strong) { font-size: 12px; line-height: 17px; font-weight: 500; }
  :global(.m-settings .primary-copy span) { font-size: 10px; line-height: 15px; }

  :global(.m-settings .primary-switch) {
    min-height: 30px;
    gap: 0;
    padding: 3px;
    border-radius: 999px;
    background: transparent;
  }

  :global(.m-settings .primary-switch > span) { width: 42px; height: 24px; }
  :global(.m-settings .primary-switch > span::after) { width: 18px; height: 18px; top: 3px; left: 3px; background: var(--bg); }
  :global(.m-settings .primary-switch.on > span::after) { transform: translateX(18px); }
  :global(.m-settings .primary-switch em) { display: none; }

  :global(.m-settings .permission-panel) {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    margin: 0 13px 11px;
    padding: 10px;
    border-radius: var(--radius-sm);
    box-shadow: none;
  }

  :global(.m-settings .permission-mark) { display: none; }
  :global(.m-settings .permission-copy strong) { font-size: 11px; font-weight: 500; }
  :global(.m-settings .permission-copy p) { font-size: 10px; line-height: 15px; }
  :global(.m-settings .permission-button),
  :global(.m-settings .text-button) { min-height: 30px; padding: 0 9px; border-radius: var(--radius-sm); font-size: 10px; font-weight: 500; }

  :global(.m-settings .desktop-lyrics-settings) {
    grid-template-columns: 1fr;
    gap: 0;
    margin: 0;
    border-top: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
  }

  :global(.m-settings .settings-section) {
    margin: 0;
    padding: 10px 13px;
    border-radius: 0;
    background: transparent;
  }

  :global(.m-settings .settings-section + .settings-section) { border-top: 1px solid color-mix(in srgb, var(--border) 52%, transparent); }
  :global(.m-settings .section-heading strong) { font-size: 11px; font-weight: 500; }
  :global(.m-settings .section-heading span) { font-size: 9.5px; line-height: 14px; }
  :global(.m-settings .choice-row) { gap: 5px; margin-top: 7px; }
  :global(.m-settings .choice-row button) { min-height: 30px; padding: 0 9px; border-radius: var(--radius-sm); font-size: 10px; font-weight: 500; }
  :global(.m-settings .desktop-lyrics-status) { margin: 0; padding: 0 13px 10px; font-size: 10px; line-height: 15px; }

  @media (max-width: 380px) {
    .m-settings { gap: 19px; }
    .m-settings-row { padding-inline: 11px; }
    .m-settings-row + .m-settings-row::before { left: 11px; }
    .m-accent-picker { max-width: 132px; }
    .m-accent-picker button { width: 25px; height: 25px; }
    :global(.m-settings .mobile-setting-select) { max-width: 42%; }
  }
</style>
