<script lang="ts">
  import { untrack } from 'svelte'
  import type { SongId } from '../../types/music.ts'
  import { auth } from '../../stores/auth.svelte.ts'
  import ChatDialog from '../../components/messages/ChatDialog.svelte'
  import MessageList from '../../components/messages/MessageList.svelte'
  import type { MessageReadState } from '../../services/message-read-state.ts'
  import {
    applyMessageReadState,
    getInitialMessageReadState,
    getMessageIdentity,
    getMessageUnreadCount,
    loadMessageReadState,
    saveMessageReadState,
  } from '../../services/message-read-state.ts'
  import {
    isConversationMessage,
    loadAuxiliaryMessageGroups,
    loadPrivateMessageResponse,
    mergeMessageGroups,
  } from '../../services/message-data.ts'

  type Msg = Record<string, unknown>

  function rec(value: unknown): Msg | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Msg : null
  }

  let {
    onNavigate = () => {},
    targetUser = null,
    onUnreadChange = () => {},
  }: {
    onNavigate?: (view: string, extra?: number | null) => void
    targetUser?: unknown
    onUnreadChange?: (count: number) => void
  } = $props()

  let messages = $state<Msg[]>([])
  let loading = $state(false)
  let refreshing = $state(false)
  let error = $state('')
  let selectedMsg = $state<Msg | null>(null)
  let handledTargetUserId = $state<unknown>(null)
  let messagesLoaded = $state(false)
  let readState = $state<MessageReadState>(getInitialMessageReadState())
  let loadRequestId = 0

  let unreadTotal = $derived(messages.reduce((total, msg) => total + getMessageUnreadCount(msg), 0))

  async function loadMessages(force = false): Promise<void> {
    if (!auth.isLoggedIn) return
    const requestId = ++loadRequestId
    const hasContent = messagesLoaded && messages.length > 0
    loading = !hasContent
    refreshing = hasContent
    error = ''
    try {
      const auxiliaryPromise = loadAuxiliaryMessageGroups()
      const [nextReadState, privateResponse] = await Promise.all([
        loadMessageReadState().catch(() => getInitialMessageReadState()),
        loadPrivateMessageResponse({ force }),
      ])
      if (requestId !== loadRequestId) return
      const privateCode = rec(privateResponse)?.code
      if (privateCode === 301 || privateCode === 302) {
        const loginError = new Error('登录已失效，请重新登录') as Error & { code?: unknown }
        loginError.code = privateCode
        throw loginError
      }
      readState = nextReadState ?? getInitialMessageReadState()
      const privateGroup = { kind: 'private', response: privateResponse }
      messages = mergeMessageGroups([privateGroup]).map(msg => applyMessageReadState(msg, readState)) as Msg[]
      messagesLoaded = true
      loading = false
      refreshing = false

      const auxiliaryGroups = await auxiliaryPromise
      if (requestId !== loadRequestId) return
      messages = mergeMessageGroups([privateGroup, ...auxiliaryGroups]).map(msg => applyMessageReadState(msg, readState)) as Msg[]
    } catch (e) {
      if (requestId !== loadRequestId) return
      // 登录已失效（网易云返回 301/302）：校验并清理过期登录态，避免反复报错
      const err = e as { code?: unknown; message?: unknown } | null | undefined
      if (err?.code === 301 || err?.code === 302) {
        auth.checkLoginStatus()
        if (messages.length === 0) error = '登录已失效，请重新登录'
      } else {
        const detail = (typeof err?.message === 'string' ? err.message : '') || (typeof e === 'string' ? e : '')
        if (messages.length === 0) error = detail ? `加载提醒失败：${detail}` : '加载提醒失败'
      }
      console.error(e)
    }
    if (requestId === loadRequestId) {
      loading = false
      refreshing = false
    }
  }

  function saveReadState(nextState: MessageReadState): void {
    readState = nextState
    saveMessageReadState(nextState)
  }

  function clearUnread(msg: Msg): void {
    const messageId = getMessageIdentity(msg)
    if (messageId) saveReadState({ ...readState, [messageId]: Date.now() })
    messages = messages.map(item => getMessageIdentity(item) === messageId ? { ...item, newMsgCount: 0, unreadCount: 0, unread: 0 } : item)
  }

  function markAllRead(): void {
    saveReadState(Object.fromEntries(
      messages.map(item => [getMessageIdentity(item), Date.now()] as const)
        .filter((entry): entry is readonly [SongId, number] => Boolean(entry[0])),
    ))
    messages = messages.map(item => ({ ...item, newMsgCount: 0, unreadCount: 0, unread: 0 }))
  }

  function createMessageFromUser(user: unknown): Msg {
    const u = rec(user)
    return {
      userId: u?.userId || u?.id,
      user: {
        userId: u?.userId || u?.id,
        nickname: u?.nickname || u?.name || '用户',
        avatarUrl: u?.avatarUrl || u?.avatar || '',
      },
      lastMsgTime: Date.now(),
      lastMsg: JSON.stringify({ msg: '从关注列表打开会话' }),
    }
  }

  function openChat(msg: Msg): void {
    clearUnread(msg)
    selectedMsg = msg
  }

  function closeChat(): void {
    selectedMsg = null
  }

  function handleMessageClick(msg: Msg): void {
    if (isConversationMessage(msg)) openChat(msg)
    else clearUnread(msg)
  }

  $effect(() => {
    if (auth.isLoggedIn) {
      untrack(() => loadMessages())
    }
  })

  $effect(() => {
    const target = rec(targetUser)
    const targetId = target?.userId || target?.id
    if (auth.isLoggedIn && targetUser && targetId !== handledTargetUserId) {
      handledTargetUserId = targetId
      openChat(createMessageFromUser(targetUser))
    }
  })

  $effect(() => { if (messagesLoaded) onUnreadChange(unreadTotal) })
</script>

<div class="messages-page">
  <div class="page-header">
    <div>
      <h1>提醒</h1>
      <p>查看新歌提醒、系统通知与音乐分享</p>
    </div>
    {#if auth.isLoggedIn}
      <div class="messages-actions">
        {#if unreadTotal > 0}
          <button class="plain-btn" onclick={markAllRead}>全部已读 · {unreadTotal > 99 ? '99+' : unreadTotal}</button>
        {/if}
        <button class="icon-btn" class:spinning={refreshing} onclick={() => loadMessages(true)} disabled={loading || refreshing} aria-label="刷新提醒">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <MessageList
    {messages}
    {messagesLoaded}
    {loading}
    {error}
    onRetry={() => loadMessages()}
    onSelect={handleMessageClick}
  />

  {#if selectedMsg}
    <ChatDialog msg={selectedMsg} onClose={closeChat} {onNavigate} />
  {/if}
</div>

<style>
  .messages-page {
    height: 100%;
    padding: 24px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    color: var(--text-primary);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
    flex-shrink: 0;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .page-header p {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--text-tertiary);
  }

  .messages-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .icon-btn,
  .plain-btn {
    border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    background: color-mix(in srgb, var(--bg-surface) 76%, white 8%);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.16s, transform 0.12s, border-color 0.16s;
  }

  .icon-btn {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .icon-btn:hover,
  .plain-btn:hover {
    background: color-mix(in srgb, var(--bg-hover) 86%, white 10%);
  }

  .icon-btn:active,
  .plain-btn:active {
    transform: scale(0.98);
  }

  .icon-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .icon-btn.spinning svg { animation: spin 0.8s linear infinite; }

  .plain-btn {
    padding: 7px 14px;
    border-radius: 999px;
    font: inherit;
    font-size: 13px;
  }

  .icon-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 68%, white);
    outline-offset: 2px;
  }

  @media (max-width: 760px) {
    .messages-page {
      padding: 12px;
    }

    .page-header h1 {
      font-size: 24px;
    }

    .page-header { margin-bottom: 12px; }
    .page-header p { display: none; }
    .plain-btn { padding-inline: 10px; }
  }
</style>
