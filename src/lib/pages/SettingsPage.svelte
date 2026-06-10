<script>
  let { theme = 'dark', onSetTheme } = $props()
</script>

<div class="fade-in">
  <div class="page-header">
    <h1>设置</h1>
    <div class="subtitle">主题和其他设置</div>
  </div>
  <div style="margin-top:16px;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:14px;font-weight:500;">主题模式</div>
        <div style="font-size:12px;color:var(--text-tertiary);">切换明暗主题</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button
          style="padding:6px 16px;border-radius:16px;font-size:13px;font-weight:500;transition:all 0.15s;{theme === 'light' ? 'background:var(--accent);color:#fff;' : 'background:var(--bg-hover);color:var(--text-secondary);'}"
          onclick={() => onSetTheme?.('light')}
        >浅色</button>
        <button
          style="padding:6px 16px;border-radius:16px;font-size:13px;font-weight:500;transition:all 0.15s;{theme === 'dark' ? 'background:var(--accent);color:#fff;' : 'background:var(--bg-hover);color:var(--text-secondary);'}"
          onclick={() => onSetTheme?.('dark')}
        >深色</button>
      </div>
    </div>
  </div>
</div>
