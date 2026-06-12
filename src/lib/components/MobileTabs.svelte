<script>
  let { activeView = 'home', onNavigate } = $props()

  const tabs = [
    {
      id: 'home',
      label: '主页',
      icon: 'M3 11.5 12 4l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    },
    {
      id: 'search',
      label: '搜索',
      icon: 'M10.5 19a8.5 8.5 0 1 1 6.01-2.49L22 22l-1.5 1.5l-5.49-5.49A8.47 8.47 0 0 1 10.5 19m0-2a6.5 6.5 0 1 0 0-13a6.5 6.5 0 0 0 0 13',
    },
    {
      id: 'explore',
      label: '发现',
      icon: 'M12 2a10 10 0 1 1 0 20a10 10 0 0 1 0-20m3.6 6.4l-5.2 2l-2 5.2l5.2-2z',
    },
    {
      id: 'library',
      label: '收藏',
      icon: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5A5.45 5.45 0 0 1 7.5 3c1.74 0 3.41.81 4.5 2.08A6 6 0 0 1 16.5 3A5.45 5.45 0 0 1 22 8.5c0 3.77-3.4 6.86-8.55 11.54z',
    },
    {
      id: 'settings',
      label: '我的',
      icon: 'M12 8a4 4 0 1 1 0 8a4 4 0 0 1 0-8m0-6a10 10 0 0 1 8.94 14.48A7.98 7.98 0 0 0 12 12a7.98 7.98 0 0 0-8.94 4.48A10 10 0 0 1 12 2',
    },
  ]

  function isActive(id) {
    if (id === 'home') return activeView === 'home'
    if (id === 'settings') return ['settings', 'messages', 'dailyHistory', 'recent', 'about'].includes(activeView)
    return activeView === id
  }
</script>

<nav class="mobile-tabs" aria-label="手机端导航">
  {#each tabs as tab}
    <button class="mobile-tab" class:active={isActive(tab.id)} onclick={() => onNavigate?.(tab.id)} aria-label={tab.label}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d={tab.icon} />
      </svg>
      <span>{tab.label}</span>
    </button>
  {/each}
</nav>
