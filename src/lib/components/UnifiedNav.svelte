<script>
  import { auth } from '../stores/auth.svelte.js'

  let {
    activeView = 'home',
    theme = 'dark',
    onNavigate,
    onToggleTheme,
    onSearch,
    onOpenLogin
  } = $props()

  let inputFocus = $state(false)
  let searchKeyword = $state('')
  let collapsed = $state(false)

  function doSearch() {
    if (!searchKeyword.trim()) return
    onSearch?.(searchKeyword.trim())
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') doSearch()
  }

  function nav(id) {
    onNavigate?.(id)
  }
</script>

<nav class="unified-nav">
  <div class="nav-inner">
    <div class="nav-left">
      <button class="nav-toggle" onclick={() => collapsed = !collapsed} title={collapsed ? '展开侧栏' : '收起侧栏'}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="15" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <span class="nav-logo">哲听</span>
    </div>

    <div class="nav-center">
      <div class="nav-group-label">浏览</div>
      
      <button class="nav-item" class:active={activeView === 'search'} onclick={() => nav('search')}>
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </span>
        <span class="nav-label">搜索</span>
      </button>

      <button class="nav-item" class:active={activeView === 'home'} onclick={() => nav('home')}>
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5v9.5a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z"/></svg>
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
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        </span>
        <span class="nav-label">浏览</span>
      </button>
    </div>

    <div class="nav-right">
      <div class="search-box" class:focus={inputFocus}>
        <svg class="search-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          class="search-input"
          type="search"
          placeholder="搜索"
          bind:value={searchKeyword}
          onfocus={() => inputFocus = true}
          onblur={() => inputFocus = false}
          onkeydown={handleKeydown}
        />
      </div>

      <div class="nav-group-label">我的音乐</div>

      <button class="nav-item" class:active={activeView === 'library'} onclick={() => nav('library')}>
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z"/><path d="M8 4v16"/></svg>
        </span>
        <span class="nav-label">资料库</span>
      </button>

      <button class="nav-item" class:active={activeView === 'cloud'} onclick={() => nav('cloud')}>
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.58A5.5 5.5 0 0 0 13.5 8h-.35A7 7 0 0 0 5 15h1"/><path d="M20 16.58A5.5 5.5 0 0 0 13.5 8h-.35A7 7 0 0 0 5 15h1"/></svg>
        </span>
        <span class="nav-label">云音乐</span>
      </button>

      <button class="nav-item" class:active={activeView === 'recent'} onclick={() => nav('recent')}>
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2 2"/></svg>
        </span>
        <span class="nav-label">最近</span>
      </button>

      <button class="nav-item" onclick={onToggleTheme} title="切换主题">
        <span class="nav-icon">
          {#if theme === 'dark'}
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          {/if}
        </span>
        <span class="nav-label">切换主题</span>
      </button>

      <button class="nav-item" onclick={() => nav('settings')} title="设置">
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </span>
        <span class="nav-label">设置</span>
      </button>

      {#if auth.isLoggedIn}
      <button class="nav-item" onclick={() => auth.logout()} title="退出登录">
        <span class="nav-icon" style="color:var(--accent);">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </span>
        <span class="nav-label">退出登录</span>
      </button>
      {/if}
    </div>
  </div>
</nav>

<style>
  .unified-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    background: var(--nav-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
    z-index: 100;
    display: flex;
    align-items: center;
    padding: 0 16px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
  }

  .nav-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
  }

  .nav-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .nav-toggle {
    background: none;
    border: none;
    padding: 8px;
    cursor: pointer;
    color: var(--text-primary);
    border-radius: 8px;
    transition: background 0.15s;
  }

  .nav-toggle:hover {
    background: var(--bg-hover);
  }

  .nav-logo {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .nav-center {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    justify-content: center;
  }

  .nav-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .nav-group-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-tertiary);
    margin: 0 8px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    transition: all 0.15s;
    white-space: nowrap;
  }

  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .nav-item.active {
    background: var(--accent);
    color: #fff;
  }

  .nav-icon {
    width: 20px;
    height: 20px;
  }

  .nav-label {
    font-size: 14px;
    font-weight: 500;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .nav-title {
    font-size: 14px;
  }

  .nav-subtitle {
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 2px;
  }

  .search-box {
    position: relative;
    margin-left: 16px;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-tertiary);
  }

  .search-input {
    width: 240px;
    padding: 8px 12px 8px 40px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text-primary);
    font-size: 14px;
    transition: all 0.15s;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--bg-hover);
  }

  .search-input:focus + .search-icon {
    color: var(--accent);
  }
</style>