<script lang="ts">
  import { onMount } from 'svelte'
  import { androidCommand } from '../player/android-engine.ts'
  import { androidOverlayUiState } from '../player/android-overlay-state.ts'
  import Icon from './ui/Icon.svelte'

  interface OverlaySettings {
    locked: boolean
    through: boolean
    bilingual: boolean
    opacity: number
    fontSize: number
    font: string
  }

  interface OverlayState {
    overlayPermission?: boolean
    overlayRequested?: boolean
    overlayEnabled: boolean
    overlayVisible?: boolean
    overlaySettings?: OverlaySettings
    bluetoothLyricsEnabled?: boolean
  }

  let permission = $state(false)
  let requested = $state(false)
  let enabled = $state(false)
  let visible = $state(false)
  let locked = $state(false)
  let through = $state(false)
  let bilingual = $state(true)
  let opacity = $state(.9)
  let fontSize = $state(18)
  let font = $state('sans-serif')
  let status = $state('')
  let busy = $state(false)
  let checking = $state(true)
  let connected = $state(true)
  let awaitingPermission = $state(false)
  let bluetoothLyricsEnabled = $state(false)
  let bluetoothBusy = $state(false)
  let bluetoothStatus = $state('')
  let pendingEnableAfterPermission = false
  let refreshVersion = 0

  let uiState = $derived(androidOverlayUiState({ connected, checking, awaitingPermission, permission, requested, enabled, visible }))
  let active = $derived(uiState === 'active' || uiState === 'starting')

  const stateLabels: Record<ReturnType<typeof androidOverlayUiState>, string> = {
    checking: '正在检查',
    unavailable: '服务不可用',
    'awaiting-permission': '等待授权',
    'permission-required': '需要授权',
    'permission-revoked': '权限已关闭',
    ready: '可以开启',
    starting: '正在启动',
    active: '正在显示',
  }

  let stateDescription = $derived(
    uiState === 'active' ? '桌面歌词正在其他应用上方显示'
      : uiState === 'starting' ? '权限与服务已就绪，正在建立悬浮歌词窗口'
      : uiState === 'permission-revoked' ? '系统悬浮窗权限被关闭，桌面歌词已自动停止'
      : uiState === 'permission-required' ? '首次开启时需要授予“显示在其他应用上层”权限'
      : uiState === 'awaiting-permission' ? '请在系统设置中允许哲听显示在其他应用上层'
      : uiState === 'unavailable' ? '暂时无法连接 Android 原生播放器服务'
      : uiState === 'checking' ? '正在同步系统权限与桌面歌词状态'
      : '权限已经就绪，开启后可继续调整显示样式',
  )

  function applySettings(settings?: OverlaySettings): void {
    if (!settings) return
    locked = settings.locked
    through = settings.through
    bilingual = settings.bilingual
    opacity = settings.opacity
    fontSize = settings.fontSize
    font = settings.font
  }

  async function refresh(): Promise<void> {
    const version = ++refreshVersion
    const wasAwaiting = awaitingPermission
    checking = true
    try {
      const capabilities = await androidCommand<{ overlayPermission: boolean }>('capabilities')
      const state = await androidCommand<OverlayState>('state')
      if (version !== refreshVersion) return

      connected = true
      permission = state.overlayPermission ?? capabilities.overlayPermission
      requested = state.overlayRequested ?? state.overlayEnabled
      enabled = state.overlayEnabled && permission
      visible = state.overlayVisible === true
      bluetoothLyricsEnabled = state.bluetoothLyricsEnabled === true
      applySettings(state.overlaySettings)
      checking = false

      if (wasAwaiting) {
        awaitingPermission = false
        if (permission && pendingEnableAfterPermission) {
          pendingEnableAfterPermission = false
          if (!requested || !enabled) await setEnabled(true)
          else status = '悬浮窗权限已恢复，桌面歌词已重新连接。'
          return
        }
        pendingEnableAfterPermission = false
        if (!permission) status = '尚未授予悬浮窗权限。哲听不会重复弹窗，可随时再次打开系统设置。'
      }
    } catch {
      if (version !== refreshVersion) return
      checking = false
      connected = false
      if (wasAwaiting) {
        awaitingPermission = false
        pendingEnableAfterPermission = false
      }
      status = 'Android 原生播放器服务暂不可用，请稍后重试。'
    }
  }

  onMount(() => {
    void refresh()
    const syncWhenVisible = () => { if (!document.hidden) void refresh() }
    window.addEventListener('focus', syncWhenVisible)
    window.addEventListener('pageshow', syncWhenVisible)
    document.addEventListener('visibilitychange', syncWhenVisible)
    return () => {
      window.removeEventListener('focus', syncWhenVisible)
      window.removeEventListener('pageshow', syncWhenVisible)
      document.removeEventListener('visibilitychange', syncWhenVisible)
    }
  })

  function payload(next: boolean): Record<string, unknown> {
    return { enabled: next, locked, through, bilingual, opacity, fontSize, font }
  }

  async function setEnabled(next: boolean): Promise<void> {
    if (busy) return
    if (next && !permission) {
      await requestPermission(true)
      return
    }
    busy = true
    status = ''
    try {
      const state = await androidCommand<OverlayState>('overlay', payload(next))
      requested = state.overlayRequested ?? next
      permission = state.overlayPermission ?? permission
      enabled = state.overlayEnabled && permission
      visible = state.overlayVisible === true
      applySettings(state.overlaySettings)
      status = next ? '桌面歌词已开启。' : '桌面歌词已关闭。'
      if (next && !visible) setTimeout(() => { void refresh() }, 350)
    } catch {
      status = next ? '桌面歌词未能开启，请检查悬浮窗权限。' : '关闭桌面歌词失败，请重试。'
      await refresh()
    } finally {
      busy = false
    }
  }

  async function setBluetoothLyrics(next: boolean): Promise<void> {
    if (bluetoothBusy || !connected) return
    bluetoothBusy = true
    bluetoothStatus = ''
    try {
      const state = await androidCommand<OverlayState>('bluetoothLyrics', { enabled: next })
      bluetoothLyricsEnabled = state.bluetoothLyricsEnabled ?? next
      bluetoothStatus = next
        ? '已开启。播放有时间轴歌词的歌曲时，会把当前歌词行发送到 MediaSession 标题。'
        : '已关闭，并恢复正常歌名元数据。'
    } catch {
      bluetoothStatus = '蓝牙 / 灵动岛歌词设置失败，请重试。'
      await refresh()
    } finally {
      bluetoothBusy = false
    }
  }

  async function saveSettings(): Promise<void> {
    if (!requested || !permission || busy) return
    busy = true
    status = ''
    try {
      const state = await androidCommand<OverlayState>('overlay', payload(true))
      enabled = state.overlayEnabled && permission
      visible = state.overlayVisible === true
      applySettings(state.overlaySettings)
    } catch {
      status = '桌面歌词设置未保存，请检查悬浮窗权限。'
      await refresh()
    } finally {
      busy = false
    }
  }

  async function requestPermission(enableAfterReturn = true): Promise<void> {
    if (awaitingPermission) return
    pendingEnableAfterPermission = enableAfterReturn
    awaitingPermission = true
    status = '请在系统页面允许哲听“显示在其他应用上层”，返回后会自动检查。'
    try {
      await androidCommand('overlayPermission')
    } catch {
      awaitingPermission = false
      pendingEnableAfterPermission = false
      status = '无法打开系统悬浮窗权限设置。'
    }
  }
</script>

<section class="desktop-lyrics-card" aria-busy={busy || checking}>
  <header class="desktop-lyrics-head">
    <span class="desktop-lyrics-icon" aria-hidden="true"><Icon name="music" size={22} strokeWidth={1.8} /></span>
    <div class="desktop-lyrics-title">
      <span class="settings-eyebrow">ANDROID · DESKTOP LYRICS</span>
      <h3>桌面歌词</h3>
      <p>把当前歌词悬浮在其他应用上方，音乐播放本身不依赖此权限。</p>
    </div>
    <span class="state-pill" class:active={uiState === 'active'} class:warning={uiState === 'permission-revoked'}>
      <i aria-hidden="true"></i>{stateLabels[uiState]}
    </span>
  </header>

  <div class="desktop-lyrics-primary">
    <div class="primary-copy">
      <strong>{uiState === 'active' ? '桌面歌词正在显示' : requested ? '桌面歌词已请求开启' : '显示桌面歌词'}</strong>
      <span>{stateDescription}</span>
    </div>
    <button
      class="primary-switch"
      class:on={requested && permission}
      type="button"
      aria-pressed={requested && permission}
      disabled={busy || checking || awaitingPermission || !connected}
      onclick={() => setEnabled(!(requested && permission))}
    >
      <span aria-hidden="true"></span>
      <em>{busy ? '处理中' : requested && permission ? '关闭' : permission ? '开启' : '授权并开启'}</em>
    </button>
  </div>

  {#if uiState === 'permission-required' || uiState === 'permission-revoked' || uiState === 'awaiting-permission'}
    <div class="permission-panel" class:revoked={uiState === 'permission-revoked'}>
      <div class="permission-mark" aria-hidden="true">{uiState === 'permission-revoked' ? '!' : '1'}</div>
      <div class="permission-copy">
        <strong>{uiState === 'permission-revoked' ? '系统权限已被关闭' : awaitingPermission ? '等待系统设置' : '授予悬浮窗权限'}</strong>
        <p>{uiState === 'permission-revoked'
          ? '哲听已停止悬浮窗口，但保留你的开启意图。恢复权限后会自动重新连接。'
          : awaitingPermission
            ? '在系统页面打开“显示在其他应用上层”，然后直接返回哲听。'
            : '只有你主动开启桌面歌词时才会进入系统授权页，不会在进入设置页时打扰你。'}</p>
      </div>
      <div class="permission-actions">
        <button class="permission-button" type="button" disabled={awaitingPermission} onclick={() => requestPermission(true)}>{awaitingPermission ? '等待返回' : uiState === 'permission-revoked' ? '恢复权限' : '打开系统设置'}</button>
        {#if uiState === 'permission-revoked'}
          <button class="text-button" type="button" onclick={() => setEnabled(false)}>取消开启</button>
        {/if}
      </div>
    </div>
  {:else if uiState === 'unavailable'}
    <div class="permission-panel revoked">
      <div class="permission-mark" aria-hidden="true">!</div>
      <div class="permission-copy"><strong>原生服务暂不可用</strong><p>这不会影响普通音乐播放。可以重试同步桌面歌词权限和服务状态。</p></div>
      <button class="permission-button" type="button" onclick={refresh}>重新检查</button>
    </div>
  {/if}

  {#if active && permission}
    <div class="desktop-lyrics-settings">
      <div class="settings-section settings-section--wide">
        <div class="section-heading">
          <div><strong>交互方式</strong><span>控制悬浮歌词是否可移动、可点击，以及是否显示翻译</span></div>
        </div>
        <div class="choice-row" role="group" aria-label="桌面歌词交互方式">
          <button aria-pressed={locked} class:active={locked} onclick={() => { locked = !locked; void saveSettings() }}>锁定位置</button>
          <button aria-pressed={through} class:active={through} onclick={() => { through = !through; void saveSettings() }}>点击穿透</button>
          <button aria-pressed={bilingual} class:active={bilingual} onclick={() => { bilingual = !bilingual; void saveSettings() }}>双语歌词</button>
        </div>
      </div>

      <label class="settings-section" for="native-lyrics-opacity">
        <span class="section-heading"><strong>透明度</strong><em>{Math.round(opacity * 100)}%</em></span>
        <input id="native-lyrics-opacity" type="range" min="0.2" max="1" step="0.05" bind:value={opacity} onchange={saveSettings} />
      </label>

      <label class="settings-section" for="native-lyrics-size">
        <span class="section-heading"><strong>字号</strong><em>{fontSize}px</em></span>
        <input id="native-lyrics-size" type="range" min="14" max="36" step="1" bind:value={fontSize} onchange={saveSettings} />
      </label>

      <div class="settings-section settings-section--wide">
        <div class="section-heading"><div><strong>字体风格</strong><span>仅影响 Android 桌面悬浮歌词</span></div></div>
        <div class="choice-row" role="radiogroup" aria-label="桌面歌词字体">
          {#each [['sans-serif', '默认'], ['serif', '衬线'], ['monospace', '等宽']] as [value, label]}
            <button role="radio" aria-checked={font === value} class:active={font === value} onclick={() => { font = value || 'sans-serif'; void saveSettings() }}>{label}</button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if status}<p class="desktop-lyrics-status" role="status" aria-live="polite">{status}</p>{/if}
</section>

<section class="desktop-lyrics-card bluetooth-lyrics-card" aria-busy={bluetoothBusy || checking}>
  <header class="desktop-lyrics-head">
    <span class="desktop-lyrics-icon" aria-hidden="true"><Icon name="music" size={22} strokeWidth={1.8} /></span>
    <div class="desktop-lyrics-title">
      <span class="settings-eyebrow">ANDROID · BLUETOOTH / ISLAND</span>
      <h3>蓝牙 / 灵动岛歌词</h3>
      <p>把当前歌词行写入 MediaSession 标题，供车机、蓝牙 AVRCP、锁屏歌词与白羊类状态栏/灵动岛模块读取。</p>
    </div>
    <span class="state-pill" class:active={bluetoothLyricsEnabled}>
      <i aria-hidden="true"></i>{checking ? '正在检查' : bluetoothLyricsEnabled ? '已开启' : '已关闭'}
    </span>
  </header>

  <div class="desktop-lyrics-primary">
    <div class="primary-copy">
      <strong>{bluetoothLyricsEnabled ? '正在发送当前歌词行' : '启用 MediaSession / 蓝牙歌词'}</strong>
      <span>只在歌词换行时更新；关闭后会恢复原歌名。开启后系统媒体通知也可能显示当前歌词，这是兼容 AVRCP 的预期行为。</span>
    </div>
    <button
      class="primary-switch"
      class:on={bluetoothLyricsEnabled}
      type="button"
      aria-pressed={bluetoothLyricsEnabled}
      disabled={bluetoothBusy || checking || !connected}
      onclick={() => setBluetoothLyrics(!bluetoothLyricsEnabled)}
    >
      <span aria-hidden="true"></span>
      <em>{bluetoothBusy ? '处理中' : bluetoothLyricsEnabled ? '关闭' : '开启'}</em>
    </button>
  </div>

  {#if bluetoothStatus}<p class="desktop-lyrics-status" role="status" aria-live="polite">{bluetoothStatus}</p>{/if}
</section>

<style>
  .desktop-lyrics-card {
    position: relative;
    margin: 2px 0 20px;
    padding: 18px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
    border-radius: var(--radius-lg);
    background: linear-gradient(145deg, color-mix(in srgb, var(--accent-bg) 32%, var(--bg-elevated)), color-mix(in srgb, var(--bg-elevated) 92%, transparent) 44%);
  }
  .desktop-lyrics-card::before { content: ''; position: absolute; width: 150px; height: 150px; right: -72px; top: -90px; border-radius: 50%; background: color-mix(in srgb, var(--accent) 10%, transparent); filter: blur(10px); pointer-events: none; }
  .bluetooth-lyrics-card { margin-top: 0; }
  .desktop-lyrics-head { position: relative; display: grid; grid-template-columns: 46px minmax(0, 1fr) auto; align-items: start; gap: 13px; }
  .desktop-lyrics-icon { width: 46px; height: 46px; display: grid; place-items: center; border-radius: var(--radius-md); background: var(--accent-bg); color: var(--accent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent); }
  .desktop-lyrics-title { min-width: 0; }
  .settings-eyebrow { display: block; margin-bottom: 3px; color: var(--text-tertiary); font-size: 10px; line-height: 14px; font-weight: 700; letter-spacing: .07em; }
  .desktop-lyrics-title h3 { margin: 0; color: var(--text); font-size: 18px; line-height: 24px; font-weight: 700; }
  .desktop-lyrics-title p { max-width: 560px; margin: 5px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 18px; }
  .state-pill { min-height: 28px; display: inline-flex; align-items: center; gap: 7px; padding: 0 10px; border-radius: 999px; color: var(--text-secondary); background: color-mix(in srgb, var(--bg-hover) 88%, transparent); font-size: 11px; font-weight: 500; white-space: nowrap; }
  .state-pill i { width: 7px; height: 7px; border-radius: 50%; background: var(--text-tertiary); }
  .state-pill.active { color: var(--accent); background: var(--accent-bg); font-weight: 700; }
  .state-pill.active i { background: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); }
  .state-pill.warning { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
  .state-pill.warning i { background: var(--danger); }

  .desktop-lyrics-primary { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 18px; padding: 16px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--bg-layer) 72%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 62%, transparent); }
  .primary-copy { min-width: 0; display: grid; gap: 4px; }
  .primary-copy strong { color: var(--text); font-size: 14px; line-height: 19px; font-weight: 700; }
  .primary-copy span { color: var(--text-secondary); font-size: 11px; line-height: 17px; }
  .primary-switch { flex: 0 0 auto; min-height: 40px; display: inline-flex; align-items: center; gap: 9px; padding: 6px 12px 6px 8px; border: 0; border-radius: 999px; color: var(--text-secondary); background: var(--bg-hover); cursor: pointer; }
  .primary-switch > span { position: relative; width: 36px; height: 22px; border-radius: 999px; background: color-mix(in srgb, var(--text-secondary) 24%, transparent); transition: background .18s ease; }
  .primary-switch > span::after { content: ''; position: absolute; width: 18px; height: 18px; top: 2px; left: 2px; border-radius: 50%; background: var(--text); transition: transform .18s ease; }
  .primary-switch.on > span { background: var(--accent); }
  .primary-switch.on > span::after { transform: translateX(14px); }
  .primary-switch em { font-style: normal; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .primary-switch:disabled { opacity: .52; cursor: default; }

  .permission-panel { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: center; margin-top: 12px; padding: 13px 14px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--accent-bg) 58%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent); }
  .permission-panel.revoked { background: color-mix(in srgb, var(--danger) 7%, var(--bg-hover)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--danger) 13%, transparent); }
  .permission-mark { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; color: var(--accent); background: var(--bg-elevated); font-size: 13px; font-weight: 700; }
  .permission-panel.revoked .permission-mark { color: var(--danger); }
  .permission-copy { min-width: 0; }
  .permission-copy strong { color: var(--text); font-size: 12px; font-weight: 700; }
  .permission-copy p { margin: 3px 0 0; color: var(--text-secondary); font-size: 11px; line-height: 17px; }
  .permission-actions { display: flex; align-items: center; gap: 7px; }
  .permission-button, .text-button { min-height: 36px; padding: 0 12px; border: 0; border-radius: 999px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .permission-button { color: var(--accent); background: var(--bg-elevated); }
  .text-button { color: var(--text-secondary); background: transparent; }
  .permission-button:disabled { opacity: .55; cursor: default; }

  .desktop-lyrics-settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
  .settings-section { min-width: 0; margin: 0; padding: 13px 14px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--bg-hover) 68%, transparent); }
  .settings-section--wide { grid-column: 1 / -1; }
  .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .section-heading > div { min-width: 0; }
  .section-heading strong { display: block; color: var(--text); font-size: 12px; font-weight: 700; }
  .section-heading span { display: block; margin-top: 3px; color: var(--text-secondary); font-size: 10px; line-height: 15px; }
  .section-heading em { color: var(--text-secondary); font-size: 11px; font-style: normal; font-weight: 500; }
  .choice-row { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
  .choice-row button { min-height: 34px; padding: 0 12px; border: 0; border-radius: 999px; color: var(--text-secondary); background: var(--bg-elevated); font-size: 11px; font-weight: 500; cursor: pointer; }
  .choice-row button.active { color: var(--accent); background: var(--accent-bg); font-weight: 700; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent); }
  input[type='range'] { width: 100%; min-height: 32px; margin-top: 8px; accent-color: var(--accent); }
  .desktop-lyrics-status { margin: 12px 2px 0; color: var(--text-secondary); font-size: 11px; line-height: 17px; }

  @media (max-width: 680px) {
    .desktop-lyrics-card { padding: 14px; border-radius: var(--radius-md); }
    .desktop-lyrics-head { grid-template-columns: 42px minmax(0, 1fr); gap: 11px; }
    .desktop-lyrics-icon { width: 42px; height: 42px; border-radius: var(--radius-sm); }
    .state-pill { grid-column: 2; justify-self: start; }
    .desktop-lyrics-primary { align-items: stretch; flex-direction: column; padding: 14px; }
    .primary-switch { align-self: stretch; justify-content: center; }
    .permission-panel { grid-template-columns: 34px minmax(0, 1fr); align-items: start; }
    .permission-actions, .permission-panel > .permission-button { grid-column: 2; justify-self: stretch; }
    .permission-actions { align-items: stretch; flex-direction: column; }
    .permission-actions button, .permission-panel > .permission-button { width: 100%; }
    .desktop-lyrics-settings { grid-template-columns: 1fr; }
    .settings-section--wide { grid-column: auto; }
  }
</style>