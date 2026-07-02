<script>
  import { auth } from '../stores/auth.svelte.js'
  import { coverUrl } from '../utils/image.js'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import Icon from './ui/Icon.svelte'

  let {
    activeView = 'home',
    collapsed = $bindable(false),
    theme = 'dark',
    refreshKey = 0,
    inDrawer = false,
    onNavigate,
    onToggleTheme,
    onOpenLogin
  } = $props()

  let showLogoutConfirm = $state(false)

  function nav(id) {
    onNavigate?.(id)
  }

  function toggleCollapsed() {
    collapsed = !collapsed
  }
</script>

<aside class="sidebar" class:collapsed class:in-drawer={inDrawer}>
  <!-- 顶部头像按钮（老B站风格：点击伸缩侧栏） -->
  {#if !inDrawer}
  <button class="sidebar-avatar-btn" type="button" onclick={toggleCollapsed} aria-label={collapsed ? '展开侧栏' : '收起侧栏'} title={collapsed ? '展开侧栏' : '收起侧栏'}>
    {#if auth.isLoggedIn && auth.user?.avatarUrl}
      <img class="sidebar-avatar" src={`${coverUrl(auth.user.avatarUrl, 96)}&_=${refreshKey}`} alt="" referrerpolicy="no-referrer" />
    {:else}
      <div class="sidebar-avatar sidebar-avatar--placeholder">
        <Icon name="user" size={28} strokeWidth={1.6} />
      </div>
    {/if}
    {#if !collapsed && auth.isLoggedIn}
      <span class="sidebar-avatar-name">{auth.user?.nickname}</span>
    {/if}
  </button>
  {:else}
  <!-- 抽屉模式下：头像+昵称+登录按钮 -->
  <div class="sidebar-avatar-btn">
    {#if auth.isLoggedIn && auth.user?.avatarUrl}
      <img class="sidebar-avatar" src={`${coverUrl(auth.user.avatarUrl, 96)}&_=${refreshKey}`} alt="" referrerpolicy="no-referrer" />
    {:else}
      <div class="sidebar-avatar sidebar-avatar--placeholder">
        <Icon name="user" size={28} strokeWidth={1.6} />
      </div>
    {/if}
    <div class="sidebar-avatar-meta">
      <span class="sidebar-avatar-name">{auth.isLoggedIn ? auth.user?.nickname : '未登录'}</span>
      {#if !auth.isLoggedIn}
        <button class="sidebar-login-link" onclick={() => onOpenLogin?.()}>点击登录</button>
      {/if}
    </div>
  </div>
  {/if}

  <nav class="sidebar-nav">
    <button class="nav-item" class:active={activeView === 'home'} onclick={() => nav('home')}>
      <span class="nav-icon">
        <Icon name="home" size={28} strokeWidth={1.5} />
      </span>
      <span class="nav-label">
        <span class="nav-title">主页</span>
      </span>
    </button>

    <button class="nav-item" class:active={activeView === 'explore'} onclick={() => nav('explore')}>
      <span class="nav-icon">
        <Icon name="compass" size={28} strokeWidth={1.5} />
      </span>
      <span class="nav-label">发现</span>
    </button>

    <button class="nav-item" class:active={activeView === 'dailyHistory'} onclick={() => nav('dailyHistory')}>
      <span class="nav-icon">
        <Icon name="calendar" size={28} strokeWidth={1.5} />
      </span>
      <span class="nav-label">历史日推</span>
    </button>

    <div class="nav-group-label">资料库</div>

    <button class="nav-item" class:active={activeView === 'library'} onclick={() => nav('library')}>
      <span class="nav-icon">
        <Icon name="liked" size={28} strokeWidth={1.5} />
      </span>
      <span class="nav-label">我的收藏</span>
    </button>

    <button class="nav-item" class:active={activeView === 'recent'} onclick={() => nav('recent')}>
      <span class="nav-icon">
        <Icon name="clock" size={28} strokeWidth={1.5} />
      </span>
      <span class="nav-label">最近播放</span>
    </button>

    <button class="nav-item" class:active={activeView === 'messages'} onclick={() => nav('messages')}>
      <span class="nav-icon">
        <Icon name="messages" size={28} strokeWidth={1.5} />
      </span>
      <span class="nav-label">私信</span>
    </button>

    <div class="nav-group-label">设置</div>

    <button class="nav-item" onclick={(event) => onToggleTheme?.(event)} title="切换主题">
      <span class="nav-icon">
        <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={28} strokeWidth={1.5} />
      </span>
      <span class="nav-label">切换主题</span>
    </button>

    <button class="nav-item" class:active={activeView === 'settings'} onclick={() => nav('settings')} title="设置">
      <span class="nav-icon">
        <Icon name="settings" size={28} strokeWidth={1.5} />
      </span>
      <span class="nav-label">设置</span>
    </button>

    <button class="nav-item" class:active={activeView === 'about'} onclick={() => nav('about')} title="关于">
      <span class="nav-icon">
        <Icon name="about" size={28} strokeWidth={1.5} />
      </span>
      <span class="nav-label">关于</span>
    </button>

    {#if auth.isLoggedIn}
    <button class="nav-item" onclick={() => showLogoutConfirm = true} title="退出登录">
      <span class="nav-icon" style="color:var(--accent);">
        <Icon name="logout" size={28} strokeWidth={1.5} />
      </span>
      <span class="nav-label">退出登录</span>
    </button>
    {/if}

  </nav>
</aside>

<ConfirmDialog
  show={showLogoutConfirm}
  title="退出登录"
  message="确定要退出当前账号吗？"
  confirmText="退出"
  cancelText="取消"
  danger
  onConfirm={() => { showLogoutConfirm = false; auth.logout() }}
  onCancel={() => showLogoutConfirm = false}
/>
