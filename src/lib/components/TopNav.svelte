<script>
  import { auth } from '../stores/auth.svelte.js'

  let { activeView = 'home', onNavigate, onOpenLogin, onSearch } = $props()

  const navItems = [
    { id: 'home', label: '发现' },
    { id: 'search', label: '搜索' },
  ]

  let showMenu = $state(false)
  let inputFocus = $state(false)
  let searchKeyword = $state('')

  function nav(id) {
    activeView = id
    if (onNavigate) onNavigate(id, null)
  }

  function doSearch() {
    if (!searchKeyword.trim()) return
    onSearch?.(searchKeyword.trim())
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') doSearch()
  }
</script>

<nav class="top-nav">
  <div class="nav-inner">
    <div class="nav-left">
      <span class="logo">哲听</span>
    </div>
    <div class="nav-center">
      {#each navItems as item}
        <button
          class="nav-link"
          class:active={activeView === item.id}
          onclick={() => nav(item.id)}
        >
          {item.label}
        </button>
      {/each}
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

      <div class="user-area" onclick={() => showMenu = !showMenu}>
        {#if auth.isLoggedIn && auth.user}
          <img class="avatar" src={auth.user.avatarUrl + '?param=60y60'} alt="" />
        {:else}
          <button class="icon-btn" title="登录">👤</button>
        {/if}
        {#if showMenu}
          <div class="user-menu" onclick={() => { showMenu = false }}>
            {#if auth.isLooseLoggedIn}
              <div class="menu-item">设置</div>
              <div class="menu-item" onclick={auth.logout}>退出登录</div>
            {:else}
              <div class="menu-item" onclick={() => { showMenu = false; onOpenLogin?.() }}>登录</div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</nav>
