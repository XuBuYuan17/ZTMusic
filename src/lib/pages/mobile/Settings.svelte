<script lang="ts">
  import { auth } from '../../stores/auth.svelte.ts'
  import { t } from '../../i18n/index.svelte.ts'
  import { DEFAULT_API_BASE, QUALITY_LABELS, useSettings } from '../../composables/useSettings.svelte.ts'
  import { wallpaper } from '../../stores/wallpaper.svelte.ts'
  import { formatWallpaperSize } from '../../services/wallpaper-storage.ts'
  import { ACCENT_THEME_OPTIONS } from '../../theme/accent.ts'
  import { settingsCategories, settingsSummaries, type SettingsCategory } from './settings-navigation.ts'
  import { listSourcePlugins } from '../../player/source-plugins.ts'
  import { engine } from '../../player/engine.ts'
  import pkg from '../../../../package.json'
  import Icon from '../../components/ui/Icon.svelte'
  import SettingSelect from '../../components/SettingSelect.svelte'
  import AndroidPlayerSettings from '../../components/AndroidPlayerSettings.svelte'
  import SourcePluginSettings from '../../components/SourcePluginSettings.svelte'

  let { theme = 'dark', accentTheme = 'red', onSetTheme, onSetAccentTheme, category = null, onNavigate }: {
    category?: SettingsCategory | null
    onNavigate?: (view: string) => void
    theme?: string
    accentTheme?: string
    onSetTheme?: (theme: string) => void
    onSetAccentTheme?: (theme: string) => void
  } = $props()

  const settings = useSettings()
  const summaries = $derived(settingsSummaries({
    theme,
    quality: QUALITY_LABELS[settings.preferredQuality as keyof typeof QUALITY_LABELS] || settings.preferredQuality,
    pluginCount: listSourcePlugins().filter(item => item.enabled).length,
    locale: settings.currentLocale,
    loggedIn: auth.isLoggedIn,
    version: pkg.version,
  }))
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
  {#if category === null}
    {#each [['appearance', 'playback'], ['sources', 'android'], ['general', 'data', 'advanced', 'about']] as group}
    <div class="m-settings-list m-settings-home">
      {#each settingsCategories(engine.native === true).filter(item => group.includes(item.id)) as item}
        <button class="m-settings-row m-settings-entry" type="button" onclick={() => onNavigate?.(`settings-${item.id}`)}>
          <span class="m-entry-icon"><Icon name={item.icon} fill="none" size={21} /></span>
          <strong>{item.title}</strong>
          <span class="m-row-value">{summaries[item.id]}</span>
          <Icon name="chevron-right" fill="none" size={17} />
        </button>
      {/each}
    </div>
    {/each}
  {/if}

  {#if category === 'appearance'}

  <section class="m-settings-section" aria-labelledby="appearance-settings">
    <h2 id="appearance-settings">显示与个性化</h2>
    <div class="m-settings-list">
      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>主题模式</strong>
        </div>
        <SettingSelect label="主题模式" value={theme} options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} onChange={value => onSetTheme?.(value)} />
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
          <button class="m-switch" type="button" class:on={wallpaper.videoPlaying} aria-label="播放动态壁纸" aria-pressed={wallpaper.videoPlaying} onclick={() => wallpaper.setVideoPlaying(!wallpaper.videoPlaying)}><span>{wallpaper.videoPlaying ? '开' : '关'}</span></button>
        </div>
      {/if}
    </div>
  </section>

  {/if}

  {#if category === 'playback'}
  <section class="m-settings-section" aria-labelledby="playback-settings">
    <h2 id="playback-settings">音频与歌词效果</h2>
    <div class="m-settings-list">
      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>{t('settings.quality', '默认音质')}</strong>
        </div>
        <SettingSelect label={t('settings.quality', '默认音质')} value={settings.preferredQuality} options={qualityOptions} onChange={settings.handleQuality} />
      </div>

      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>{t('settings.restoreSession', '记住上次播放')}</strong>
        </div>
        <button class="m-switch" type="button" class:on={settings.restoreSession} aria-label="记住上次播放" aria-pressed={settings.restoreSession} onclick={() => settings.handleRestoreSession(!settings.restoreSession)}><span>{settings.restoreSession ? '开' : '关'}</span></button>
      </div>

      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>歌词背景模糊</strong>
        </div>
        <button class="m-switch" type="button" class:on={settings.lyricsBlur} aria-label="歌词背景模糊" aria-pressed={settings.lyricsBlur} onclick={() => settings.handleLyricsBlur(!settings.lyricsBlur)}><span>{settings.lyricsBlur ? '开' : '关'}</span></button>
      </div>

      <div class="m-settings-row">
        <div class="m-settings-copy">
          <strong>歌词文字模糊</strong>
        </div>
        <button class="m-switch" type="button" class:on={settings.lyricsTextBlur} aria-label="歌词文字模糊" aria-pressed={settings.lyricsTextBlur} onclick={() => settings.handleLyricsTextBlur(!settings.lyricsTextBlur)}><span>{settings.lyricsTextBlur ? '开' : '关'}</span></button>
      </div>
    </div>
  </section>

    <p class="m-settings-note">音质按可用音源选择。记住上次播放会在启动时恢复进度；歌词模糊分别使用封面生成背景、弱化非当前行。</p>
  {/if}

  {#if category === 'sources'}
  <section class="m-settings-section" aria-labelledby="source-plugin-settings">
    <h2 id="source-plugin-settings">播放音源</h2>
    <div class="m-settings-list">
      <SourcePluginSettings mobile />
    </div>
  </section>

  {/if}

  {#if category === 'android' && engine.native}
    <section class="m-settings-section m-settings-section--android" aria-labelledby="android-settings">
      <h2 id="android-settings">系统集成</h2>
      <div class="m-android-content">
        <AndroidPlayerSettings mobile />
      </div>
    </section>
  {/if}

  {#if category === 'general'}
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

  {/if}

  {#if category === 'data'}
  <section class="m-settings-section" aria-labelledby="data-settings">
    <h2 id="data-settings">数据与账号</h2>
    <div class="m-settings-list">
      <button class="m-settings-row m-settings-row--button" type="button" onclick={settings.handleClearHistory}>
        <div class="m-settings-copy">
          <strong>{t('settings.clearHistory', '清除播放历史')}</strong>
          <span>{t('settings.clearHistoryDesc', '删除所有本地播放记录')}</span>
        </div>
        <span class="m-row-value danger">{settings.clearMsg || t('settings.clear', '清除')}</span>
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

  {/if}

  {#if category === 'advanced'}
  <section class="m-settings-section" aria-labelledby="advanced-settings">
    <h2 id="advanced-settings">连接与存储</h2>
    <div class="m-settings-list">
      <div class="m-developer-content">
        <div class="m-settings-row m-settings-row--stacked">
          <div class="m-settings-copy">
            <strong>API 后端地址</strong>
            <span>留空时使用内置地址</span>
          </div>
          <input type="url" aria-label="API 后端地址" class="m-settings-input" placeholder="https://your-api-server.com" value={settings.apiBaseValue} oninput={(e) => settings.handleSetApiBase((e.target as HTMLInputElement).value)} />
          <small class="m-api-hint">{DEFAULT_API_BASE}{#if settings.apiBaseStatus} · {settings.apiBaseStatus}{/if}</small>
        </div>
        <button class="m-settings-row m-settings-row--button" type="button" onclick={settings.handleClearCache}>
          <div class="m-settings-copy"><strong>接口缓存</strong><span>当前 {settings.cacheSizeText}</span></div>
          <span class="m-row-value danger">{settings.clearCacheMsg || t('settings.clear', '清除')}</span>
        </button>
        <button class="m-settings-row m-settings-row--button" type="button" onclick={settings.handleClearIdbCache}>
          <div class="m-settings-copy"><strong>持久缓存</strong><span>歌曲 URL 与 API 响应 · {settings.idbCacheText}</span></div>
          <span class="m-row-value danger">{settings.idbCleared || t('settings.clear', '清除')}</span>
        </button>
      </div>
    </div>
  </section>

  {/if}

  {#if category === 'about'}
  <section class="m-settings-section" aria-labelledby="about-settings">
    <h2 id="about-settings">版本信息</h2>
    <div class="m-settings-list">
      <div class="m-settings-row m-settings-row--static">
        <div class="m-settings-copy"><strong>哲听</strong><span>当前版本</span></div>
        <span class="m-row-value">{pkg.version}</span>
      </div>
    </div>
  </section>

  {/if}

  {#if category === 'data' && auth.isLoggedIn}
    <button class="m-logout" type="button" onclick={() => auth.logout()}><Icon name="logout" size={17} />退出登录</button>
  {/if}
</div>

<style>
  .m-settings { display: grid; gap: 24px; padding-bottom: 24px; }
  .m-settings-section { display: grid; gap: 8px; min-width: 0; }
  .m-settings-section > h2 { margin: 0; padding: 0 16px; color: var(--text-secondary); font-size: .8125rem; line-height: 1.5; font-weight: 400; }
  .m-settings-note { margin: 0; padding: 0 16px; color: var(--text-secondary); font-size: .8125rem; line-height: 1.5; }
  .m-settings-list { overflow: hidden; border-radius: var(--radius-md); background: var(--settings-group, var(--bg)); }
  .m-settings-row { position: relative; box-sizing: border-box; width: 100%; min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border: 0; color: var(--text); background: transparent; font: inherit; text-align: left; }
  .m-settings-row + .m-settings-row::before { content: ''; position: absolute; top: 0; left: 16px; right: 0; height: 1px; background: var(--border); }
  .m-settings-row--button, .m-settings-entry { cursor: pointer; }
  .m-settings-row--button:active, .m-settings-entry:active { background: var(--bg-hover); }
  .m-settings-copy { min-width: 0; flex: 1; display: grid; gap: 4px; overflow-wrap: anywhere; }
  .m-settings-copy strong, .m-settings-entry > strong { font-size: 1.0625rem; line-height: 1.4; font-weight: 400; }
  .m-settings-copy span { color: var(--text-secondary); font-size: .8125rem; line-height: 1.5; }
  .m-settings-copy span.error, .danger { color: var(--danger); }
  .m-row-value { flex: 0 1 auto; max-width: 38%; color: var(--text-secondary); font-size: .9375rem; line-height: 1.4; text-align: right; overflow-wrap: anywhere; }
  .m-row-value.action { color: var(--md-primary); }
  .m-row-value.danger { color: var(--danger); }
  .m-settings-entry { gap: 12px; min-height: 54px; }
  .m-settings-entry > strong { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .m-settings-entry .m-row-value { max-width: 30%; font-size: .8125rem; }
  .m-settings-entry :global(svg) { flex-shrink: 0; }
  .m-settings-entry > :global(svg) { color: var(--text-tertiary); opacity: .55; }
  .m-entry-icon { display: grid; place-items: center; flex: 0 0 30px; height: 30px; border-radius: var(--radius-xs); color: var(--md-primary); background: color-mix(in srgb, var(--md-primary) 9%, var(--settings-group, var(--bg))); }
  .m-settings-entry + .m-settings-entry::before { left: 58px; }
  .m-text-action { min-height: 44px; padding: 0 12px; border: 0; border-radius: var(--radius-sm); color: var(--md-primary); background: transparent; font: inherit; font-size: .9375rem; }
  .m-settings-row--palette, .m-settings-row--wallpaper { flex-wrap: wrap; }
  .m-accent-picker { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 2px; width: 100%; }
  .m-accent-picker button { width: 44px; height: 44px; display: grid; place-items: center; padding: 0; border: 2px solid transparent; border-radius: 50%; background: transparent; }
  .m-accent-picker button span { width: 24px; height: 24px; border-radius: 50%; background: var(--accent-preview); }
  .m-accent-picker button.active { border-color: var(--md-primary); }
  .m-inline-actions { display: flex; flex-wrap: wrap; gap: 4px; }
  .m-file-input { display: none; }
  .m-text-action.muted { color: var(--danger); }
  .m-text-action:disabled { opacity: .48; }
  .m-switch { position: relative; flex: 0 0 52px; width: 52px; height: 44px; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; }
  .m-switch::before { content: ''; position: absolute; inset: 6px 0; border-radius: 999px; background: color-mix(in srgb, var(--text-secondary) 28%, transparent); transition: background 160ms; }
  .m-switch::after { content: ''; position: absolute; left: 3px; top: 9px; width: 26px; height: 26px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / .18); transition: transform 160ms; }
  .m-switch.on::before { background: var(--md-primary); }
  .m-switch.on::after { transform: translateX(20px); }
  .m-switch span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  :global(.m-settings .mobile-setting-select) { min-width: 0; min-height: 44px; max-width: 48%; gap: 4px; padding: 4px 0 4px 8px; border: 0; color: var(--text-secondary); background: transparent; font-size: .9375rem; box-shadow: none; }
  :global(.m-settings .mobile-setting-select span) { white-space: normal; overflow-wrap: anywhere; }
  .m-settings-row--stacked { align-items: stretch; flex-direction: column; gap: 8px; }
  .m-settings-input { box-sizing: border-box; width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); background: var(--bg); font: inherit; font-size: 1rem; }
  .m-settings-input:focus { outline: 2px solid var(--md-primary); }
  .m-api-hint { color: var(--text-secondary); font-size: .8125rem; line-height: 1.5; overflow-wrap: anywhere; }
  .m-logout { min-height: 52px; padding: 12px 16px; border: 0; border-radius: var(--radius-md); display: flex; justify-content: center; align-items: center; gap: 8px; color: var(--danger); background: var(--bg); font: inherit; font-size: 1.0625rem; }
  @media (prefers-reduced-motion: reduce) { .m-switch::before, .m-switch::after { transition: none; } }
</style>
