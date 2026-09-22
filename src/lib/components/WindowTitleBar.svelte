<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window'

  const appWindow = getCurrentWindow()
  let maximized = $state(false)

  function runWindowAction(action: () => Promise<void>, name: string): void {
    action().catch((error) => console.error(`[window:${name}]`, error))
  }

  // 同步窗口最大化状态，切换“最大化/还原”图标与标签
  $effect(() => {
    let unlisten: (() => void) | undefined
    const syncMaximized = () => appWindow.isMaximized()
      .then(value => { maximized = value })
      .catch(() => {})
    syncMaximized()
    appWindow.onResized(syncMaximized)
      .then(unsubscribe => { unlisten = unsubscribe })
      .catch(() => {})
    return () => unlisten?.()
  })
</script>

<header class="window-titlebar" aria-label="窗口标题栏">
  <div class="window-titlebar__drag" data-tauri-drag-region="deep">
    <span class="window-titlebar__mark" aria-hidden="true"></span>
    <span class="window-titlebar__title">哲听</span>
  </div>

  <div class="window-titlebar__controls">
    <button type="button" aria-label="最小化" title="最小化" onclick={() => runWindowAction(() => appWindow.minimize(), 'minimize')}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5h8" /></svg>
    </button>
    <button
      type="button"
      aria-label={maximized ? '还原' : '最大化'}
      title={maximized ? '还原' : '最大化'}
      onclick={() => runWindowAction(() => appWindow.toggleMaximize(), 'toggle-maximize')}
    >
      {#if maximized}
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5h5.5V8" /><rect x="2.5" y="4" width="5.5" height="5.5" /></svg>
      {:else}
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" /></svg>
      {/if}
    </button>
    <button class="window-titlebar__close" type="button" aria-label="关闭" title="关闭" onclick={() => runWindowAction(() => appWindow.close(), 'close')}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2.5 2.5 7 7m0-7-7 7" /></svg>
    </button>
  </div>
</header>

<style>
  .window-titlebar {
    position: fixed;
    inset: 0 0 auto;
    z-index: 700;
    height: 38px;
    display: flex;
    color: var(--text-secondary);
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(28px) saturate(160%);
    -webkit-backdrop-filter: blur(28px) saturate(160%);
    user-select: none;
    -webkit-user-select: none;
  }

  .window-titlebar__drag {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 14px;
  }

  .window-titlebar__mark {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 52%, transparent);
  }

  .window-titlebar__title {
    overflow: hidden;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .window-titlebar__controls {
    display: flex;
    flex: none;
  }

  .window-titlebar__controls button {
    width: 46px;
    height: 38px;
    display: grid;
    place-items: center;
    color: var(--text-secondary);
    border-radius: 0;
    transition: color var(--dur-fast), background var(--dur-fast);
  }

  .window-titlebar__controls button:hover {
    color: var(--text);
    background: var(--bg-hover);
  }

  .window-titlebar__controls button:active {
    background: var(--bg-active);
  }

  .window-titlebar__controls .window-titlebar__close:hover {
    color: #fff;
    background: var(--danger);
  }

  .window-titlebar__controls svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
    stroke-linecap: square;
  }
</style>
