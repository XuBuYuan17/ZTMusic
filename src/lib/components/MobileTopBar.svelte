<script>
  let {
    title = '哲听',
    theme = 'dark',
    isLoggedIn = false,
    onToggleTheme,
    onOpenLogin,
  } = $props()
</script>

<div class="mobile-topbar">
  <div class="mobile-topbar__title">{title}</div>
  <div class="mobile-topbar__actions">
    <button class="mobile-icon-btn" onclick={onToggleTheme} aria-label="切换主题">
      {#if theme === 'dark'}
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3A7 7 0 0 0 21 12.79z" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
      {/if}
    </button>
    {#if !isLoggedIn}
      <button class="mobile-login-btn" onclick={onOpenLogin}>登录</button>
    {/if}
  </div>
</div>
