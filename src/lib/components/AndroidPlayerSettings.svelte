<script lang="ts">
  import { onMount } from 'svelte'
  import { androidCommand } from '../player/android-engine.ts'
  import Icon from './ui/Icon.svelte'

  let enabled = $state(false)
  let permission = $state(false)
  let locked = $state(false)
  let through = $state(false)
  let bilingual = $state(true)
  let opacity = $state(.9)
  let fontSize = $state(18)
  let font = $state('sans-serif')
  let status = $state('')
  let busy = $state(false)
  let awaitingPermission = $state(false)

  let permissionLabel = $derived(permission
    ? (enabled ? '正在显示' : '权限已就绪')
    : (awaitingPermission ? '等待授权' : '需要权限'))

  async function refresh() {
    const wasAwaitingPermission = awaitingPermission
    try {
      const capabilities = await androidCommand<{ overlayPermission: boolean }>('capabilities')
      const state = await androidCommand<{ overlayEnabled: boolean; overlaySettings?: { locked: boolean; through: boolean; bilingual: boolean; opacity: number; fontSize: number; font: string } }>('state')
      permission = capabilities.overlayPermission
      enabled = state.overlayEnabled && permission
      if (state.overlaySettings) {
        locked = state.overlaySettings.locked
        through = state.overlaySettings.through
        bilingual = state.overlaySettings.bilingual
        opacity = state.overlaySettings.opacity
        fontSize = state.overlaySettings.fontSize
        font = state.overlaySettings.font
      }

      if (wasAwaitingPermission) {
        awaitingPermission = false
        if (permission && !enabled) {
          status = '悬浮窗权限已授予，正在开启桌面歌词…'
          await update(true)
          return
        }
        if (!permission) status = '尚未授予悬浮窗权限；需要时可再次打开系统设置。'
      }
    } catch {
      if (wasAwaitingPermission) awaitingPermission = false
      status = '原生播放器连接暂不可用'
    }
  }

  onMount(() => {
    void refresh()
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  })

  async function update(next = enabled) {
    if (next && !permission) {
      await requestPermission()
      return
    }
    busy = true
    status = ''
    try {
      await androidCommand('overlay', { enabled: next, locked, through, bilingual, opacity, fontSize, font })
      enabled = next
      status = next ? '桌面歌词已开启' : '桌面歌词已关闭'
    } catch {
      status = '桌面歌词未开启，请检查悬浮窗权限'
      await refresh()
    } finally {
      busy = false
    }
  }

  async function toggleEnabled() {
    if (busy) return
    if (enabled) await update(false)
    else if (permission) await update(true)
    else await requestPermission()
  }

  async function requestPermission() {
    status = '请在系统页面允许哲听“显示在其他应用上层”，返回后会自动继续开启。'
    awaitingPermission = true
    try {
      await androidCommand('overlayPermission')
    } catch {
      awaitingPermission = false
      status = '无法打开悬浮窗权限设置'
    }
  }
</script>

<section class="android-lyrics-card" aria-busy={busy}>
  <header class="lyrics-card-header">
    <span class="lyrics-card-icon" aria-hidden="true"><Icon name="music" size={20} strokeWidth={1.7} /></span>
    <div class="lyrics-card-copy">
      <span class="lyrics-card-kicker">Android Overlay</span>
      <h3>桌面歌词</h3>
      <p>在其他应用上方显示当前歌词。权限被关闭时只停止悬浮歌词，不会中断音乐播放。</p>
    </div>
    <span class="permission-badge" class:granted={permission} class:active={enabled}>{permissionLabel}</span>
  </header>

  <div class="lyrics-primary-row">
    <div>
      <strong>{enabled ? '桌面歌词已开启' : '显示桌面歌词'}</strong>
      <span>{permission ? '系统悬浮窗权限已就绪' : '首次开启需要授予系统悬浮窗权限'}</span>
    </div>
    <button
      class="lyrics-switch"
      class:on={enabled}
      type="button"
      aria-pressed={enabled}
      disabled={busy || awaitingPermission}
      onclick={toggleEnabled}
    >
      <span aria-hidden="true"></span>
      <em>{busy ? '处理中' : enabled ? '已开启' : permission ? '开启' : '授权并开启'}</em>
    </button>
  </div>

  {#if !permission}
    <div class="permission-callout">
      <div>
        <strong>{awaitingPermission ? '等待系统授权' : '需要悬浮窗权限'}</strong>
        <p>{awaitingPermission ? '完成系统设置后返回哲听，会自动重新检查权限。' : '哲听不会在进入设置页时主动弹权限；只有你开启桌面歌词时才会请求。'}</p>
      </div>
      <button type="button" disabled={awaitingPermission} onclick={requestPermission}>{awaitingPermission ? '请在系统中完成' : '打开权限设置'}</button>
    </div>
  {:else}
    <div class="lyrics-controls">
      <div class="lyrics-control-block lyrics-control-block--wide">
        <div class="control-heading"><strong>交互方式</strong><span>锁定后避免误拖动；穿透后点击会交给下层应用</span></div>
        <div class="segmented-control" role="group" aria-label="桌面歌词交互方式">
          <button aria-pressed={locked} class:active={locked} onclick={() => { locked = !locked; void update() }}>锁定位置</button>
          <button aria-pressed={through} class:active={through} onclick={() => { through = !through; void update() }}>点击穿透</button>
          <button aria-pressed={bilingual} class:active={bilingual} onclick={() => { bilingual = !bilingual; void update() }}>双语</button>
        </div>
      </div>

      <label class="lyrics-control-block" for="native-lyrics-opacity">
        <span class="control-heading"><strong>透明度</strong><span>{Math.round(opacity * 100)}%</span></span>
        <input id="native-lyrics-opacity" type="range" min="0.2" max="1" step="0.05" bind:value={opacity} onchange={() => update()} />
      </label>

      <label class="lyrics-control-block" for="native-lyrics-size">
        <span class="control-heading"><strong>字号</strong><span>{fontSize}px</span></span>
        <input id="native-lyrics-size" type="range" min="14" max="36" step="1" bind:value={fontSize} onchange={() => update()} />
      </label>

      <div class="lyrics-control-block lyrics-control-block--wide">
        <div class="control-heading"><strong>字体</strong><span>仅影响桌面悬浮歌词</span></div>
        <div class="segmented-control" role="group" aria-label="桌面歌词字体">
          {#each [['sans-serif', '默认'], ['serif', '衬线'], ['monospace', '等宽']] as [value, label]}
            <button aria-pressed={font === value} class:active={font === value} onclick={() => { font = value || 'sans-serif'; void update() }}>{label}</button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if status}<p class="lyrics-status" role="status" aria-live="polite">{status}</p>{/if}
</section>

<style>
  .android-lyrics-card {
    margin: 2px 0 18px;
    padding: 18px;
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-elevated) 76%, transparent);
  }
  .lyrics-card-header { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; gap: 12px; align-items: start; }
  .lyrics-card-icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 14px; color: var(--accent); background: var(--accent-bg); }
  .lyrics-card-copy { min-width: 0; }
  .lyrics-card-kicker { display: block; margin-bottom: 3px; color: var(--text-tertiary); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  h3 { margin: 0; color: var(--text); font-size: 16px; font-weight: 700; }
  .lyrics-card-copy p, .permission-callout p { margin: 5px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.55; }
  .permission-badge { min-height: 28px; display: inline-flex; align-items: center; padding: 0 10px; border-radius: 999px; color: var(--text-secondary); background: var(--bg-hover); font-size: 11px; font-weight: 650; white-space: nowrap; }
  .permission-badge.granted { color: var(--accent); background: var(--accent-bg); }
  .permission-badge.active { font-weight: 750; }

  .lyrics-primary-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
  .lyrics-primary-row > div { min-width: 0; }
  .lyrics-primary-row strong, .control-heading strong, .permission-callout strong { display: block; color: var(--text); font-size: 13px; font-weight: 650; }
  .lyrics-primary-row > div > span, .control-heading > span { display: block; margin-top: 3px; color: var(--text-secondary); font-size: 11px; }
  .lyrics-switch { min-height: 38px; display: inline-flex; align-items: center; gap: 8px; padding: 5px 10px 5px 7px; border: 0; border-radius: 999px; color: var(--text-secondary); background: var(--bg-hover); cursor: pointer; }
  .lyrics-switch > span { position: relative; width: 34px; height: 20px; border-radius: 999px; background: color-mix(in srgb, var(--text-secondary) 24%, transparent); }
  .lyrics-switch > span::after { content: ''; position: absolute; width: 16px; height: 16px; top: 2px; left: 2px; border-radius: 50%; background: var(--text); transition: transform .18s ease; }
  .lyrics-switch.on > span { background: var(--accent); }
  .lyrics-switch.on > span::after { transform: translateX(14px); }
  .lyrics-switch em { font-style: normal; font-size: 11px; font-weight: 650; }
  .lyrics-switch:disabled { opacity: .55; cursor: default; }

  .permission-callout { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 14px; padding: 13px 14px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--bg-hover) 78%, transparent); }
  .permission-callout > div { min-width: 0; }
  .permission-callout button { flex: 0 0 auto; min-height: 38px; padding: 0 13px; border: 0; border-radius: 999px; color: var(--accent); background: var(--accent-bg); font-size: 12px; font-weight: 650; cursor: pointer; }
  .permission-callout button:disabled { opacity: .6; cursor: default; }

  .lyrics-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
  .lyrics-control-block { min-width: 0; margin: 0; padding: 13px 14px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--bg-hover) 70%, transparent); }
  .lyrics-control-block--wide { grid-column: 1 / -1; }
  .control-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .control-heading > span { margin-top: 0; text-align: right; }
  .segmented-control { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .segmented-control button { min-height: 34px; padding: 0 11px; border: 0; border-radius: 999px; color: var(--text-secondary); background: var(--bg-elevated); font-size: 11px; cursor: pointer; }
  .segmented-control button.active { color: var(--accent); background: var(--accent-bg); font-weight: 650; }
  input[type='range'] { width: 100%; min-height: 32px; margin-top: 8px; accent-color: var(--accent); }
  .lyrics-status { margin: 12px 2px 0; color: var(--text-secondary); font-size: 11px; line-height: 1.5; }

  @media (max-width: 680px) {
    .android-lyrics-card { padding: 14px; border-radius: var(--radius-md); }
    .lyrics-card-header { grid-template-columns: 38px minmax(0, 1fr); }
    .lyrics-card-icon { width: 38px; height: 38px; border-radius: 12px; }
    .permission-badge { grid-column: 2; justify-self: start; }
    .lyrics-primary-row, .permission-callout { align-items: stretch; flex-direction: column; }
    .lyrics-switch, .permission-callout button { align-self: stretch; justify-content: center; }
    .lyrics-controls { grid-template-columns: 1fr; }
    .lyrics-control-block--wide { grid-column: auto; }
  }
</style>
