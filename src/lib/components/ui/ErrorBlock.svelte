<script>
  /**
   * ErrorBlock — 通用错误提示块。可选的 retry 回调。
   */
  let { message = '加载失败', onRetry } = $props()
</script>

<div class="error-block">
  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
  <p>{message}</p>
  {#if onRetry}
    <button class="error-retry" onclick={onRetry}>重试</button>
  {/if}
</div>

<style>
  .error-block {
    display: grid;
    place-items: center;
    gap: 12px;
    padding: 60px 20px;
    color: var(--text-secondary);
    text-align: center;
  }
  .error-block svg { opacity: 0.5; }
  .error-block p { margin: 0; font-size: 14px; }
  .error-retry {
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text);
    padding: 8px 20px;
    border-radius: 999px;
    font-size: 13px;
    cursor: pointer;
    transition: background var(--dur-fast);
  }
  .error-retry:hover { background: var(--bg-hover); }
</style>
