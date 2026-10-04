<script lang="ts">
  import { auth } from '../../stores/auth.svelte.ts'
  import { coverUrl } from '../../utils/image.ts'
  import { getMessageUnreadCount } from '../../services/message-read-state.ts'
  import {
    formatMessageTime,
    getMessageAvatar,
    getMessageKind,
    getMessageKindLabel,
    getMessageNickname,
    getMessageSongArtists,
    getNoticeSummary,
    isConversationMessage,
    parseChatMessage,
  } from '../../services/message-data.ts'

  type Msg = Record<string, unknown>

  function rec(value: unknown): Msg | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Msg : null
  }

  let {
    messages,
    messagesLoaded,
    loading,
    error,
    onRetry,
    onSelect,
  }: {
    messages: Msg[]
    messagesLoaded: boolean
    loading: boolean
    error: string
    onRetry?: () => void
    onSelect?: (msg: Msg) => void
  } = $props()

  let activeFilter = $state('all')

  let filteredMessages = $derived(activeFilter === 'all'
    ? messages
    : messages.filter(msg => activeFilter === 'private'
      ? ['private', 'contact'].includes(getMessageKind(msg))
      : getMessageKind(msg) === activeFilter))
  let filterCounts = $derived({
    private: messages.filter(msg => ['private', 'contact'].includes(getMessageKind(msg))).length,
    notice: messages.filter(msg => getMessageKind(msg) === 'notice').length,
    mention: messages.filter(msg => getMessageKind(msg) === 'mention').length,
  })
  let filterTabs = $derived<Array<[string, string, number]>>([
    ['all', '全部', messages.length],
    ['private', '私信', filterCounts.private],
    ['notice', '通知', filterCounts.notice],
    ['mention', '提及', filterCounts.mention],
  ])

  function getMsgPreview(raw: unknown): string {
    const parsed = parseChatMessage(raw)
    if (parsed.type === 'song') {
      const name = typeof parsed.data.name === 'string' ? parsed.data.name : ''
      const artists = getMessageSongArtists(parsed.data)
      return `🎵 ${name}${artists ? ' - ' + artists : ''}`.trim()
    }
    if (parsed.type === 'album') {
      const name = typeof parsed.data.name === 'string' ? parsed.data.name : ''
      return `💿 ${name} - ${parsed.text || ''}`.trim()
    }
    if (parsed.type === 'playlist') {
      const name = typeof parsed.data.name === 'string' ? parsed.data.name : ''
      return `📋 ${name} - ${parsed.text || ''}`.trim()
    }
    return parsed.text
  }

  function getListPreview(msg: unknown): string {
    if (getMessageKind(msg) === 'notice') return getNoticeSummary(msg)
    if (getMessageKind(msg) === 'mention') return '有人在动态中提到了你'
    const m = rec(msg)
    const raw = m?.lastMsg ?? m?.msg ?? m?.content ?? m?.notice ?? m?.json
    const preview = getMsgPreview(raw)
    if (preview) return preview
    return '暂无消息内容'
  }

  function getListName(msg: unknown): string {
    const nickname = getMessageNickname(msg)
    if (nickname !== '未知用户') return nickname
    if (getMessageKind(msg) === 'notice') return '系统通知'
    if (getMessageKind(msg) === 'mention') return '动态提醒'
    return nickname
  }
</script>

<section class="messages-card">
  {#if auth.isLoggedIn && (messagesLoaded || loading)}
    <div class="messages-toolbar">
      <div class="filter-tabs" role="tablist" aria-label="提醒分类">
        {#each filterTabs as filter}
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === filter[0]}
            class:active={activeFilter === filter[0]}
            onclick={() => activeFilter = filter[0]}
          >
            {filter[1]}<span>{filter[2]}</span>
          </button>
        {/each}
      </div>
      {#if messagesLoaded}<span class="message-summary">{filteredMessages.length} 条</span>{/if}
    </div>
  {/if}
  {#if !auth.isLoggedIn}
    <div class="empty-state">登录后查看提醒</div>
  {:else if loading}
    <div class="messages-skeleton" aria-label="正在加载提醒" aria-busy="true">
      {#each Array(6) as _, i}
        <div class="message-item skeleton-row" aria-hidden="true">
          <span class="msg-avatar skeleton-block"></span>
          <span class="msg-content skeleton-copy">
            <span class="skeleton-line medium"></span>
            <span class="skeleton-line"></span>
          </span>
          <span class="skeleton-line short"></span>
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="empty-state">
      <p>{error}</p>
      <button class="plain-btn" onclick={() => onRetry?.()}>重试</button>
    </div>
  {:else if filteredMessages.length === 0}
    <div class="empty-state">{messages.length === 0 ? '暂无提醒' : '此分类暂无提醒'}</div>
  {:else}
    <div class="messages-list">
      {#each filteredMessages as msg}
        {@const unreadCount = getMessageUnreadCount(msg)}
        <button class="message-item" class:unread={unreadCount > 0} onclick={() => onSelect?.(msg)}>
          <div class="msg-avatar">
            {#if unreadCount > 0}<span class="msg-dot" aria-hidden="true"></span>{/if}
            {#if getMessageAvatar(msg)}
              <img src={coverUrl(getMessageAvatar(msg), 80)} alt="" referrerpolicy="no-referrer" />
            {:else}
              <div class="avatar-placeholder">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
            {/if}
          </div>
          <div class="msg-content">
            <div class="msg-header">
              <span class="msg-title-line">
                <span class="msg-name">{getListName(msg)}</span>
                <span class="msg-kind">{getMessageKindLabel(msg)}</span>
              </span>
              <span class="msg-time">{formatMessageTime(msg.time || msg.lastMsgTime)}</span>
            </div>
            <div class="msg-preview">{getListPreview(msg)}</div>
          </div>
          {#if unreadCount > 0}<span class="msg-unread-count">{unreadCount > 99 ? '99+' : unreadCount}</span>{/if}
          {#if isConversationMessage(msg)}
            <svg class="item-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .messages-card {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
    box-shadow: var(--shadow-sm);
  }

  .messages-toolbar {
    min-height: 54px;
    padding: 9px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 64%, transparent);
  }

  .filter-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .filter-tabs::-webkit-scrollbar { display: none; }

  .filter-tabs button {
    min-width: max-content;
    padding: 7px 11px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: color var(--dur-fast), background var(--dur-fast);
  }

  .filter-tabs button span {
    color: var(--text-tertiary);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .filter-tabs button:hover { background: var(--bg-hover); }

  .filter-tabs button.active {
    background: var(--bg-active);
    color: var(--text);
  }

  .filter-tabs button.active span { color: var(--accent); }

  .message-summary {
    flex-shrink: 0;
    padding-right: 4px;
    color: var(--text-tertiary);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }

  .plain-btn {
    border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    background: color-mix(in srgb, var(--bg-surface) 76%, white 8%);
    color: var(--text);
    cursor: pointer;
    transition: background 150ms var(--ease-out), border-color 150ms var(--ease-out);
  }

  .plain-btn:hover {
    background: color-mix(in srgb, var(--bg-hover) 86%, white 10%);
  }

  .plain-btn {
    padding: 7px 14px;
    border-radius: 999px;
    font: inherit;
    font-size: 13px;
  }

  .empty-state {
    min-height: 260px;
    display: grid;
    place-items: center;
    padding: 24px;
    color: var(--text-tertiary);
    text-align: center;
  }

  .messages-card > .empty-state {
    flex: 1;
    min-height: 0;
  }

  .messages-list,
  .messages-skeleton {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px;
  }

  .messages-skeleton { overflow: hidden; }

  .skeleton-copy {
    display: grid;
    gap: 9px;
  }

  .message-item {
    display: flex;
    align-items: center;
    gap: 13px;
    width: 100%;
    min-height: 56px;
    padding: 11px 13px;
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
    background: transparent;
    color: inherit;
    text-align: left;
    font: inherit;
    cursor: pointer;
    content-visibility: auto;
    contain-intrinsic-size: 56px;
    transition: background 150ms var(--ease-out), border-color 150ms var(--ease-out);
  }

  .message-item + .message-item {
    margin-top: 4px;
  }

  .message-item:hover {
    background: color-mix(in srgb, var(--bg-hover) 78%, transparent);
    border-color: color-mix(in srgb, var(--border) 48%, transparent);
  }

  .message-item.unread {
    background: color-mix(in srgb, var(--accent) 9%, var(--bg-surface));
    border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  }

  .message-item:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 68%, white);
    outline-offset: 2px;
  }

  .msg-avatar {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: linear-gradient(145deg, var(--bg-hover), var(--bg-surface));
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  }

  .msg-avatar img,
  .avatar-placeholder {
    width: 100%;
    height: 100%;
  }

  .avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
  }

  .msg-dot {
    position: absolute;
    top: 1px;
    right: 1px;
    z-index: 1;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--bg-surface);
  }

  .msg-content {
    flex: 1;
    min-width: 0;
  }

  .msg-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .msg-title-line {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .msg-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0;
  }

  .msg-kind {
    flex-shrink: 0;
    padding: 2px 5px;
    border-radius: var(--radius-xs);
    background: color-mix(in srgb, var(--bg-elevated) 74%, transparent);
    color: var(--text-tertiary);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.25;
  }

  .msg-time {
    font-size: 11.5px;
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .msg-preview {
    margin-top: 3px;
    font-size: 13px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .msg-unread-count {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    flex-shrink: 0;
  }

  .item-chevron {
    flex-shrink: 0;
    color: var(--text-tertiary);
    opacity: 0.65;
  }

  @media (max-width: 760px) {
    .messages-card {
      overflow: visible;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }

    .messages-toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
      min-height: 49px;
      padding: 0 0 8px;
      background: var(--bg);
      border-bottom-color: var(--border);
    }

    .filter-tabs { width: 100%; gap: 2px; }
    .filter-tabs button {
      flex: 1 0 auto;
      justify-content: center;
      min-height: 40px;
      padding: 8px 10px;
      border-radius: 999px;
      font-size: 13px;
    }
    .filter-tabs button.active { background: var(--md-primary-container); color: var(--md-primary); }
    .filter-tabs button.active span { color: inherit; }
    .plain-btn { min-height: 48px; padding-inline: 12px; }
    .message-summary { display: none; }

    .messages-list,
    .messages-skeleton { overflow: visible; padding: 0; }
    .message-item {
      min-height: 72px;
      padding: 10px 0;
      gap: 12px;
      border: 0;
      border-bottom: 1px solid var(--border);
      border-radius: 0;
      contain-intrinsic-size: 72px;
    }
    .message-item + .message-item { margin-top: 0; }
    .message-item:hover { border-color: var(--border); background: transparent; }
    .message-item.unread { border-color: var(--border); background: transparent; }
    .message-item.unread .msg-name { color: var(--md-primary); }
    .msg-avatar { width: 48px; height: 48px; border-radius: var(--radius-sm); box-shadow: none; }
    .msg-name { font-size: 15px; font-weight: 500; }
    .msg-preview { margin-top: 2px; font-size: 13px; line-height: 18px; }
    .msg-time { font-size: 11px; }
    .msg-unread-count { min-width: 18px; height: 18px; padding-inline: 5px; }
    .item-chevron { width: 16px; height: 16px; }
    .msg-kind { display: none; }
    .empty-state { min-height: 260px; padding: 32px 16px; border-bottom: 1px solid var(--border); }
  }
</style>
