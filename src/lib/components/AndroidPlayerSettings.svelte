<script lang="ts">
  import { onMount } from 'svelte'
  import { androidCommand } from '../player/android-engine.ts'
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
  let awaitingPermission = false
  async function refresh() {
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
      if (awaitingPermission && permission && !enabled) {
        awaitingPermission = false
        await update(true)
      }
    } catch { status = '原生播放器连接暂不可用' }
  }
  onMount(() => { void refresh(); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh) })
  async function update(next = enabled) {
    busy = true; status = ''
    try { await androidCommand('overlay', { enabled: next, locked, through, bilingual, opacity, fontSize, font }); enabled = next }
    catch { status = '桌面歌词未开启，请检查悬浮窗权限'; await refresh() }
    finally { busy = false }
  }
  async function requestPermission() {
    status = '请在系统页面允许哲听显示在其他应用上层'
    awaitingPermission = true
    try { await androidCommand('overlayPermission') }
    catch { awaitingPermission = false; status = '无法打开悬浮窗权限设置' }
  }
</script>

<div class="settings-row">
  <div><div class="settings-label">Android 桌面歌词</div><div class="settings-desc">在其他应用上显示歌词；关闭或撤销权限不会中断音乐。</div></div>
  {#if permission}
    <button class="settings-secondary-btn" disabled={busy} aria-pressed={enabled} onclick={() => update(!enabled)}>{enabled ? '关闭歌词' : '开启歌词'}</button>
  {:else}
    <button class="settings-secondary-btn" onclick={requestPermission}>授予悬浮窗权限</button>
  {/if}
</div>
{#if permission}
  <div class="settings-row"><div class="settings-label">歌词锁定／穿透</div><div class="segmented-control"><button aria-pressed={locked} class:active={locked} onclick={() => { locked = !locked; void update() }}>锁定位置</button><button aria-pressed={through} class:active={through} onclick={() => { through = !through; void update() }}>点击穿透</button><button aria-pressed={bilingual} class:active={bilingual} onclick={() => { bilingual = !bilingual; void update() }}>双语</button></div></div>
  <div class="settings-row"><label for="native-lyrics-opacity">歌词透明度</label><input id="native-lyrics-opacity" type="range" min="0.2" max="1" step="0.05" bind:value={opacity} onchange={() => update()} /></div>
  <div class="settings-row"><label for="native-lyrics-size">歌词字号</label><input id="native-lyrics-size" type="range" min="14" max="36" step="1" bind:value={fontSize} onchange={() => update()} /></div>
  <div class="settings-row"><div class="settings-label">歌词字体</div><div class="segmented-control">{#each [['sans-serif', '默认'], ['serif', '衬线'], ['monospace', '等宽']] as [value, label]}<button aria-pressed={font === value} class:active={font === value} onclick={() => { font = value || 'sans-serif'; void update() }}>{label}</button>{/each}</div></div>
{/if}
{#if status}<p role="status">{status}</p>{/if}

<style>
  .settings-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .settings-label, label { color: var(--text); font-size: 14px; font-weight: 500; }
  .settings-desc, p { color: var(--text-secondary); font-size: 13px; margin-top: 4px; }
  button { min-height: 48px; padding: 8px 12px; border: 0; border-radius: var(--radius-md); color: var(--text); background: var(--bg-hover); }
  button.active { background: var(--accent-bg); color: var(--accent); }
  .segmented-control { display: flex; flex-wrap: wrap; gap: 4px; }
  input { min-height: 48px; max-width: 100%; }
</style>
