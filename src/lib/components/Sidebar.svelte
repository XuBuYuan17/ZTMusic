<script>
  import { auth } from '../stores/auth.svelte.js'

  let {
    activeView = 'home',
    collapsed = false,
    theme = 'dark',
    refreshKey = 0,
    onNavigate,
    onToggleTheme,
    onOpenLogin
  } = $props()

  function nav(id) {
    onNavigate?.(id)
  }
</script>

<aside class="sidebar" class:collapsed>
  <div class="sidebar-header">
    <span class="sidebar-logo">哲听</span>
  </div>

  <nav class="sidebar-nav">
    <button class="nav-item" class:active={activeView === 'home'} onclick={() => nav('home')}>
      <span class="nav-icon">
        {#if auth.isLoggedIn && auth.user?.avatarUrl}
          <img class="user-avatar-nav" src={auth.user.avatarUrl + `?param=48y48&_=${refreshKey}`} alt="" referrerpolicy="no-referrer" />
        {:else}
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
        {/if}
      </span>
      <span class="nav-label">
        <span class="nav-title">主页</span>
        {#if auth.isLoggedIn}
          <span class="nav-subtitle">{auth.user?.nickname}</span>
        {/if}
      </span>
    </button>

    <button class="nav-item" class:active={activeView === 'explore'} onclick={() => nav('explore')}>
      <span class="nav-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" opacity="0.2"/><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="none" stroke="currentColor"/></svg>
      </span>
      <span class="nav-label">发现</span>
    </button>

    <div class="nav-group-label">资料库</div>

    <button class="nav-item" class:active={activeView === 'library'} onclick={() => nav('library')}>
      <span class="nav-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </span>
      <span class="nav-label">我的收藏</span>
    </button>

    <button class="nav-item" class:active={activeView === 'cloud'} onclick={() => nav('cloud')}>
      <span class="nav-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg>
      </span>
      <span class="nav-label">云音乐</span>
    </button>

    <button class="nav-item" class:active={activeView === 'recent'} onclick={() => nav('recent')}>
      <span class="nav-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </span>
      <span class="nav-label">最近播放</span>
    </button>

    <div class="nav-group-label">设置</div>

    <button class="nav-item" onclick={onToggleTheme} title="切换主题">
      <span class="nav-icon">
        {#if theme === 'dark'}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        {:else}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        {/if}
      </span>
      <span class="nav-label">切换主题</span>
    </button>

    <button class="nav-item" onclick={() => nav('settings')} title="设置">
      <span class="nav-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </span>
      <span class="nav-label">设置</span>
    </button>

    {#if auth.isLoggedIn}
    <button class="nav-item" onclick={() => auth.logout()} title="退出登录">
      <span class="nav-icon" style="color:var(--accent);">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </span>
      <span class="nav-label">退出登录</span>
    </button>
    {/if}

  </nav>
</aside>
