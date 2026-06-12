<script>
  import { ncm } from '../api/client.js'

  let { show = false, user = null, onClose, onOpenMessage } = $props()

  let activeTab = $state('follows')
  let follows = $state([])
  let fans = $state([])
  let loading = $state(false)
  let error = $state('')
  let loadedKey = $state('')

  const title = $derived(activeTab === 'follows' ? '我的关注' : '我的粉丝')
  const currentList = $derived(activeTab === 'follows' ? follows : fans)

  function normalizeUser(item = {}) {
    return {
      id: item.userId || item.id,
      name: item.nickname || item.name || '用户',
      avatar: item.avatarUrl || item.avatar || '',
      signature: item.signature || item.description || '',
      followed: Boolean(item.followed),
    }
  }

  async function loadList(force = false) {
    const uid = user?.userId || user?.id
    if (!show || !uid) return
    const key = `${activeTab}:${uid}`
    if (!force && loadedKey === key && currentList.length) return

    loading = true
    error = ''
    try {
      const res = activeTab === 'follows'
        ? await ncm.userFollows(uid, 50, 0)
        : await ncm.userFolloweds(uid, 50, 0)
      const list = activeTab === 'follows'
        ? (res.follow || res.follows || res.data?.follow || res.data?.follows || [])
        : (res.followeds || res.data?.followeds || [])
      if (activeTab === 'follows') follows = list.map(normalizeUser)
      else fans = list.map(normalizeUser)
      loadedKey = key
    } catch (e) {
      error = e?.message || '加载失败'
    } finally {
      loading = false
    }
  }

  function switchTab(tab) {
    activeTab = tab
    loadList()
  }

  function openMessage(item) {
    onOpenMessage?.({
      userId: item.id,
      nickname: item.name,
      avatarUrl: item.avatar,
    })
  }

  function handleBackdropKeydown(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClose?.()
    }
  }

  $effect(() => {
    if (show) loadList()
  })
</script>

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="follow-dialog-backdrop" role="button" tabindex="0" aria-label="关闭关注列表" onclick={onClose} onkeydown={handleBackdropKeydown}></div>
  <div class="follow-dialog" role="dialog" aria-modal="true" aria-label={title}>
    <header class="follow-dialog-head">
      <div>
        <span>社交</span>
        <h2>{title}</h2>
      </div>
      <button type="button" class="follow-dialog-close" onclick={onClose} aria-label="关闭">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </header>

    <div class="follow-dialog-tabs">
      <button type="button" class:active={activeTab === 'follows'} onclick={() => switchTab('follows')}>关注</button>
      <button type="button" class:active={activeTab === 'fans'} onclick={() => switchTab('fans')}>粉丝</button>
    </div>

    <div class="follow-dialog-body">
      {#if loading}
        {#each Array(6) as _}
          <div class="follow-user-row skeleton-row">
            <span class="follow-avatar skeleton-block"></span>
            <span class="follow-user-main">
              <strong class="skeleton-line"></strong>
              <em class="skeleton-line narrow"></em>
            </span>
          </div>
        {/each}
      {:else if error}
        <div class="follow-empty">
          <p>{error}</p>
          <button type="button" onclick={() => loadList(true)}>重试</button>
        </div>
      {:else if currentList.length > 0}
        {#each currentList as item (item.id)}
          <article class="follow-user-row">
            {#if item.avatar}
              <img class="follow-avatar" src={`${item.avatar}?param=96y96`} alt="" loading="lazy" />
            {:else}
              <span class="follow-avatar follow-avatar-ph">人</span>
            {/if}
            <div class="follow-user-main">
              <strong>{item.name}</strong>
              <em>{item.signature || (item.followed ? '已关注' : '网易云用户')}</em>
            </div>
            <button type="button" class="follow-message-btn" onclick={() => openMessage(item)} aria-label="给 {item.name} 发私信">私信</button>
          </article>
        {/each}
      {:else}
        <div class="follow-empty">暂无{activeTab === 'follows' ? '关注' : '粉丝'}</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .follow-dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(0, 0, 0, 0.34);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  .follow-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 71;
    display: flex;
    flex-direction: column;
    width: min(420px, calc(100vw - 28px));
    max-height: min(640px, calc(100dvh - 72px));
    overflow: hidden;
    color: var(--text-primary);
    background: color-mix(in srgb, var(--bg-surface) 94%, transparent);
    border: 1px solid var(--border);
    border-radius: 24px;
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34);
    transform: translate(-50%, -50%);
  }

  .follow-dialog-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 20px 14px;
  }

  .follow-dialog-head span {
    color: var(--text-tertiary);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .follow-dialog-head h2 {
    margin: 4px 0 0;
    font-size: 22px;
    letter-spacing: -0.04em;
  }

  .follow-dialog-close {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 999px;
    color: var(--text-secondary);
    background: var(--bg-hover);
    cursor: pointer;
  }

  .follow-dialog-tabs {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    margin: 0 16px 12px;
    padding: 5px;
    border-radius: 999px;
    background: var(--bg-layer);
  }

  .follow-dialog-tabs button {
    height: 34px;
    border: 0;
    border-radius: 999px;
    color: var(--text-secondary);
    background: transparent;
    font-weight: 800;
    cursor: pointer;
  }

  .follow-dialog-tabs button.active {
    color: var(--text-primary);
    background: var(--bg-elevated);
    box-shadow: 0 6px 16px rgba(0,0,0,0.08);
  }

  .follow-dialog-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 12px 14px;
  }

  .follow-user-row {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-height: 66px;
    padding: 9px 8px;
    border-radius: 16px;
  }

  .follow-user-row:hover {
    background: var(--bg-hover);
  }

  .follow-message-btn {
    height: 32px;
    padding: 0 13px;
    border: 0;
    border-radius: 999px;
    color: var(--accent);
    background: var(--accent-bg);
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .follow-message-btn:hover {
    filter: brightness(1.04);
  }

  .follow-avatar {
    width: 48px;
    height: 48px;
    border-radius: 999px;
    object-fit: cover;
    background: var(--bg-layer);
  }

  .follow-avatar-ph {
    display: grid;
    place-items: center;
    color: var(--text-tertiary);
  }

  .follow-user-main {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .follow-user-main strong,
  .follow-user-main em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .follow-user-main strong {
    font-size: 14px;
  }

  .follow-user-main em {
    color: var(--text-secondary);
    font-size: 12px;
    font-style: normal;
  }

  .follow-empty {
    display: grid;
    place-items: center;
    gap: 10px;
    min-height: 220px;
    color: var(--text-tertiary);
    text-align: center;
  }

  .follow-empty p {
    margin: 0;
  }

  .follow-empty button {
    height: 34px;
    padding: 0 16px;
    border: 0;
    border-radius: 999px;
    color: #fff;
    background: var(--accent);
    font-weight: 800;
  }

  @media (max-width: 760px) {
    .follow-dialog {
      top: auto;
      left: 10px;
      right: 10px;
      bottom: calc(10px + env(safe-area-inset-bottom));
      width: auto;
      max-height: min(72dvh, 620px);
      border-radius: 26px;
      transform: none;
    }
  }
</style>
