<script>
  let {
    title = '哲听',
    isLoggedIn = false,
    onOpenSearch,
    onOpenLogin,
  } = $props()
</script>

<div class="mobile-topbar">
  <div class="mobile-topbar__title">{title}</div>
  <div class="mobile-topbar__actions">
    <button class="mobile-search-btn" type="button" onclick={onOpenSearch} aria-label="搜索">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <span>搜索</span>
    </button>
    {#if !isLoggedIn}
      <button class="mobile-login-btn" onclick={onOpenLogin}>登录</button>
    {/if}
  </div>
</div>
