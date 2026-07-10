<script>
  import { auth } from '../../stores/auth.svelte.js'
  import { player } from '../../stores/player.svelte.js'
  import { ncm } from '../../api/client.js'
  import Spinner from '../../components/Spinner.svelte'
  import { coverUrl } from '../../utils/image.js'
  import {
    applyMessageReadState,
    getInitialMessageReadState,
    getMessageIdentity,
    getMessageUnreadCount,
    loadMessageReadState,
    saveMessageReadState,
  } from '../../services/message-read-state.js'

  let { onNavigate = () => {}, targetUser = null, onUnreadChange = () => {} } = $props()

  let messages = $state([])
  let loading = $state(false)
  let error = $state('')
  let selectedMsg = $state(null)
  let chatMessages = $state([])
  let chatLoading = $state(false)
  let chatError = $state('')
  let chatScrollEl = $state(null)
  let shouldScrollToBottom = $state(false)
  let originMsgId = $state(null)
  let handledTargetUserId = $state(null)
  let messagesLoaded = $state(false)
  let readState = $state(getInitialMessageReadState())

  let unreadTotal = $derived(messages.reduce((total, msg) => total + getMessageUnreadCount(msg), 0))

  function extractMessages(res) {
    if (Array.isArray(res)) return res
    if (Array.isArray(res?.msgs)) return res.msgs
    if (Array.isArray(res?.messages)) return res.messages
    if (Array.isArray(res?.data)) return res.data
    if (Array.isArray(res?.data?.msgs)) return res.data.msgs
    if (Array.isArray(res?.data?.messages)) return res.data.messages
    if (Array.isArray(res?.notices)) return res.notices
    if (Array.isArray(res?.forwards)) return res.forwards
    if (Array.isArray(res?.data?.notices)) return res.data.notices
    if (Array.isArray(res?.data?.forwards)) return res.data.forwards
    return []
  }

  async function loadMessageList() {
    const loaders = [
      () => ncm.msgPrivate(30, 0),
      () => ncm.msgRecentContact(),
      () => ncm.msgNotices(30),
      () => ncm.msgForwards(30, 0),
    ]
    const results = await Promise.allSettled(loaders.map(load => load()))
    const values = results.filter(result => result.status === 'fulfilled').map(result => result.value)
    const list = values.flatMap(extractMessages)
    if (list.length > 0) return list
    // 登录失效：网易云对未登录返回 code 301 且 HTTP 301
    if (values.some(value => value?.code === 301 || value?.code === 302)) {
      const err = new Error('登录已失效，请重新登录')
      err.code = 301
      throw err
    }
    const error = results.find(result => result.status === 'rejected')?.reason
    if (error) throw error instanceof Error ? error : new Error(String(error))
    return []
  }

  async function loadMessages() {
    if (!auth.isLoggedIn) return
    loading = true
    error = ''
    try {
      readState = await loadMessageReadState().catch(() => getInitialMessageReadState())
      messages = (await loadMessageList()).map(msg => applyMessageReadState(msg, readState))
      messagesLoaded = true
    } catch (e) {
      // 登录已失效（网易云返回 301/302）：校验并清理过期登录态，避免反复报错
      if (e?.code === 301 || e?.code === 302) {
        auth.checkLoginStatus()
        error = '登录已失效，请重新登录'
      } else {
        const detail = e?.message || (typeof e === 'string' ? e : '')
        error = detail ? `加载提醒失败：${detail}` : '加载提醒失败'
      }
      console.error(e)
    }
    loading = false
  }

  function formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' +
           d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  function getAvatar(msg) {
    const user = msg.fromUser || msg.toUser || msg.user || {}
    return user.avatarUrl || user.avatar || ''
  }

  function getNickname(msg) {
    const user = msg.fromUser || msg.toUser || msg.user || {}
    return user.nickname || user.name || '未知用户'
  }

  function getUserId(msg) {
    const user = msg.fromUser || msg.toUser || msg.user || {}
    return user.userId || user.id || msg.fromUserId || msg.toUserId || msg.userId
  }

  function saveReadState(nextState) {
    readState = nextState
    saveMessageReadState(nextState)
  }

  function clearUnread(msg) {
    const messageId = getMessageIdentity(msg)
    if (messageId) saveReadState({ ...readState, [messageId]: Date.now() })
    messages = messages.map(item => getMessageIdentity(item) === messageId ? { ...item, newMsgCount: 0, unreadCount: 0, unread: 0 } : item)
  }

  function markAllRead() {
    saveReadState(Object.fromEntries(messages.map(item => [getMessageIdentity(item), Date.now()]).filter(([id]) => id)))
    messages = messages.map(item => ({ ...item, newMsgCount: 0, unreadCount: 0, unread: 0 }))
  }

  function createMessageFromUser(user) {
    return {
      userId: user.userId || user.id,
      user: {
        userId: user.userId || user.id,
        nickname: user.nickname || user.name || '用户',
        avatarUrl: user.avatarUrl || user.avatar || '',
      },
      lastMsgTime: Date.now(),
      lastMsg: JSON.stringify({ msg: '从关注列表打开会话' }),
    }
  }

  async function openChat(msg) {
    clearUnread(msg)
    selectedMsg = msg
    originMsgId = msg.userId || msg.fromUserId || msg.id
    chatMessages = []
    chatError = ''
    const uid = getUserId(msg)
    if (!uid) {
      chatError = '无法获取用户 ID'
      return
    }
    chatLoading = true
    try {
      const res = await ncm.msgPrivateHistory(uid, 50)
      chatMessages = extractMessages(res)
    } catch (e) {
      chatError = '加载聊天记录失败'
      console.error(e)
    }
    chatLoading = false
    shouldScrollToBottom = true
  }

  function closeChat() {
    selectedMsg = null
    chatMessages = []
    chatError = ''
    originMsgId = null
  }

  function stopEvent(e) {
    e.stopPropagation()
  }

  function parseMsg(raw) {
    if (!raw) return { type: 'text', text: '' }
    try {
      let msg = raw
      if (typeof raw === 'string') msg = JSON.parse(raw)
      if (msg.song) return { type: 'song', data: msg.song, text: msg.msg || '' }
      if (msg.album) return { type: 'album', data: msg.album, text: msg.msg || '' }
      if (msg.playlist) return { type: 'playlist', data: msg.playlist, text: msg.msg || '' }
      if (msg.msg) return { type: 'text', text: msg.msg }
      return { type: 'text', text: typeof raw === 'string' ? raw : JSON.stringify(raw).slice(0, 80) }
    } catch (e) {
      return { type: 'text', text: typeof raw === 'string' ? raw.slice(0, 80) : JSON.stringify(raw).slice(0, 80) }
    }
  }

  function getSongCover(song) {
    const album = song?.al || song?.album || {}
    return album.picUrl || song?.coverImgUrl || song?.picUrl || ''
  }

  function getShareCover(data) {
    const album = data?.al || data?.album || {}
    return album.picUrl || data?.picUrl || data?.coverImgUrl || ''
  }

  function getSongArtists(song) {
    return (song?.ar || song?.artists || []).map(a => a.name).filter(Boolean).join(' / ')
  }

  function playSongFromMessage(song) {
    if (!song?.id) return
    player.playTrack(song, -1)
  }

  function openAlbumFromMessage(album) {
    if (!album?.id) return
    closeChat()
    onNavigate?.('album', album.id)
  }

  function openPlaylistFromMessage(playlist) {
    if (!playlist?.id) return
    closeChat()
    onNavigate?.('playlist', playlist.id)
  }

  function getMsgPreview(raw) {
    const parsed = parseMsg(raw)
    if (parsed.type === 'song') return `🎵 ${parsed.data.name || ''}${getSongArtists(parsed.data) ? ' - ' + getSongArtists(parsed.data) : ''}`.trim()
    if (parsed.type === 'album') return `💿 ${parsed.data.name || ''} - ${parsed.text || ''}`.trim()
    if (parsed.type === 'playlist') return `📋 ${parsed.data.name || ''} - ${parsed.text || ''}`.trim()
    return parsed.text
  }

  $effect(() => {
    if (auth.isLoggedIn) {
      loadMessages()
    }
  })

  $effect(() => {
    const targetId = targetUser?.userId || targetUser?.id
    if (auth.isLoggedIn && targetUser && targetId !== handledTargetUserId) {
      handledTargetUserId = targetId
      openChat(createMessageFromUser(targetUser))
    }
  })

  $effect(() => {
    if (shouldScrollToBottom && chatScrollEl && chatMessages.length > 0) {
      shouldScrollToBottom = false
      requestAnimationFrame(() => {
        chatScrollEl.scrollTop = chatScrollEl.scrollHeight
      })
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
        <button class="icon-btn" onclick={() => loadMessages()} disabled={loading} aria-label="刷新提醒">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <section class="messages-card">
    {#if !auth.isLoggedIn}
      <div class="empty-state">登录后查看提醒</div>
    {:else if loading}
      <div class="empty-state"><Spinner size="md" label="加载提醒..." /></div>
    {:else if error}
      <div class="empty-state">
        <p>{error}</p>
        <button class="plain-btn" onclick={() => loadMessages()}>重试</button>
      </div>
    {:else if messages.length === 0}
      <div class="empty-state">暂无提醒</div>
    {:else}
      <div class="messages-list">
        {#each messages as msg}
          {@const unreadCount = getMessageUnreadCount(msg)}
          <button class="message-item" class:unread={unreadCount > 0} onclick={() => openChat(msg)}>
            <div class="msg-avatar">
              {#if unreadCount > 0}<span class="msg-dot" aria-hidden="true"></span>{/if}
              {#if getAvatar(msg)}
                <img src={coverUrl(getAvatar(msg), 80)} alt="" referrerpolicy="no-referrer" />
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
                <span class="msg-name">{getNickname(msg)}</span>
                <span class="msg-time">{formatTime(msg.time || msg.lastMsgTime)}</span>
              </div>
              <div class="msg-preview">{getMsgPreview(msg.lastMsg || msg.msg)}</div>
            </div>
            {#if unreadCount > 0}<span class="msg-unread-count">{unreadCount > 99 ? '99+' : unreadCount}</span>{/if}
            <svg class="item-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  {#if selectedMsg}
    <div class="chat-modal-backdrop" onclick={closeChat} role="presentation" class:from-item={!!originMsgId}>
      <div class="chat-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-label="与 {getNickname(selectedMsg)} 的私信" onclick={stopEvent} onkeydown={stopEvent}>
        <div class="chat-titlebar">
          <div class="dialog-user">
            {#if getAvatar(selectedMsg)}
              <img class="title-avatar" src={coverUrl(getAvatar(selectedMsg), 72)} alt="" referrerpolicy="no-referrer" />
            {:else}
              <div class="title-avatar avatar-placeholder">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
            {/if}
            <div class="title-meta">
              <h2>{getNickname(selectedMsg)}</h2>
              <p>私人会话</p>
            </div>
          </div>
          <button class="close-btn" onclick={closeChat} aria-label="关闭对话框">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="chat-scroll" bind:this={chatScrollEl}>
          {#if chatLoading}
            <div class="dialog-state"><Spinner size="md" label="加载聊天记录..." /></div>
          {:else if chatError}
            <div class="dialog-state"><p>{chatError}</p></div>
          {:else if chatMessages.length === 0}
            <div class="dialog-state"><p>暂无聊天记录</p></div>
          {:else}
            <div class="chat-list">
              {#each chatMessages as item}
                {@const parsed = parseMsg(item.msg || item.lastMsg)}
                <div class="chat-message" class:mine={getUserId(item) !== getUserId(selectedMsg)}>
                  <div class="chat-message-content">
                    {#if parsed.type === 'song'}
                      {#if parsed.text}<div class="chat-bubble"><div class="chat-text">{parsed.text}</div></div>{/if}
                      <button type="button" class="shared-card song-card" onclick={() => playSongFromMessage(parsed.data)} aria-label="播放歌曲 {parsed.data.name || ''}">
                        {#if getSongCover(parsed.data)}
                          <img class="shared-card-cover" src={coverUrl(getSongCover(parsed.data), 120)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                        {:else}
                          <div class="shared-card-cover shared-card-cover-placeholder">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                            </svg>
                          </div>
                        {/if}
                        <div class="shared-card-info">
                          <div class="shared-card-title">{parsed.data.name || '未知歌曲'}</div>
                          <div class="shared-card-subtitle">{getSongArtists(parsed.data) || '未知歌手'}</div>
                        </div>
                        <div class="shared-card-play">
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                            <path d="M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z"/>
                          </svg>
                        </div>
                      </button>
                    {:else if parsed.type === 'album'}
                      {#if parsed.text}<div class="chat-bubble"><div class="chat-text">{parsed.text}</div></div>{/if}
                      <button type="button" class="shared-card album-card" onclick={() => openAlbumFromMessage(parsed.data)} aria-label="打开专辑 {parsed.data.name || ''}">
                        {#if getShareCover(parsed.data)}
                          <img class="shared-card-cover" src={coverUrl(getShareCover(parsed.data), 240)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                        {:else}
                          <div class="shared-card-cover shared-card-cover-placeholder">💿</div>
                        {/if}
                        <div class="shared-card-info">
                          <div class="shared-card-title">{parsed.data.name || '未知专辑'}</div>
                          <div class="shared-card-subtitle">{parsed.data.artist?.name || '点击打开专辑'}</div>
                        </div>
                        <div class="shared-card-play">
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                            <path d="M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z"/>
                          </svg>
                        </div>
                      </button>
                    {:else if parsed.type === 'playlist'}
                      {#if parsed.text}<div class="chat-bubble"><div class="chat-text">{parsed.text}</div></div>{/if}
                      <button type="button" class="shared-card playlist-card" onclick={() => openPlaylistFromMessage(parsed.data)} aria-label="打开歌单 {parsed.data.name || ''}">
                        {#if getShareCover(parsed.data)}
                          <img class="shared-card-cover" src={coverUrl(getShareCover(parsed.data), 240)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                        {:else}
                          <div class="shared-card-cover shared-card-cover-placeholder">♪</div>
                        {/if}
                        <div class="shared-card-info">
                          <div class="shared-card-title">{parsed.data.name || '未知歌单'}</div>
                          <div class="shared-card-subtitle">{parsed.data.trackCount ? parsed.data.trackCount + ' 首' : '点击打开歌单'}</div>
                        </div>
                      </button>
                    {:else}
                      <div class="chat-bubble"><div class="chat-text">{parsed.text}</div></div>
                    {/if}
                    <div class="chat-time">{formatTime(item.time || item.lastMsgTime)}</div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
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
    font-weight: 760;
    letter-spacing: -0.04em;
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

  .messages-card {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    border-radius: 22px;
    background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.08);
  }

  .icon-btn,
  .plain-btn,
  .close-btn {
    border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    background: color-mix(in srgb, var(--bg-surface) 76%, white 8%);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.16s, transform 0.12s, border-color 0.16s;
  }

  .icon-btn,
  .close-btn {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .icon-btn:hover,
  .plain-btn:hover,
  .close-btn:hover {
    background: color-mix(in srgb, var(--bg-hover) 86%, white 10%);
  }

  .icon-btn:active,
  .plain-btn:active,
  .close-btn:active,
  .message-item:active,
  .shared-card:active {
    transform: scale(0.98);
  }

  .icon-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .plain-btn {
    padding: 7px 14px;
    border-radius: 999px;
    font: inherit;
    font-size: 13px;
  }

  .empty-state,
  .dialog-state {
    min-height: 260px;
    display: grid;
    place-items: center;
    padding: 24px;
    color: var(--text-tertiary);
    text-align: center;
  }

  .messages-list {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px;
  }

  .message-item {
    display: flex;
    align-items: center;
    gap: 13px;
    width: 100%;
    padding: 13px 14px;
    border: 1px solid transparent;
    border-radius: 16px;
    background: transparent;
    color: inherit;
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition: background 0.16s, transform 0.12s, border-color 0.16s;
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

  .message-item:focus-visible,
  .shared-card:focus-visible,
  .icon-btn:focus-visible,
  .close-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 68%, white);
    outline-offset: 2px;
  }

  .msg-avatar,
  .title-avatar {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: linear-gradient(145deg, var(--bg-hover), var(--bg-surface));
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  }

  .title-avatar {
    width: 40px;
    height: 40px;
  }

  .msg-avatar img,
  .title-avatar {
    object-fit: cover;
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

  .msg-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 680;
    font-size: 14px;
    letter-spacing: -0.01em;
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
    font-weight: 800;
    line-height: 1;
    flex-shrink: 0;
  }

  .item-chevron {
    flex-shrink: 0;
    color: var(--text-tertiary);
    opacity: 0.65;
  }

  .chat-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 28px;
    background: rgba(255, 255, 255, 0.035);
    backdrop-filter: blur(9px) saturate(1.08);
    animation: modal-backdrop-in 180ms ease-out both;
  }

  .chat-dialog {
    position: relative;
    width: min(680px, calc(100vw - 32px));
    height: min(720px, calc(100vh - 40px));
    min-height: 420px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
    border-radius: 24px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 94%, white 4%), color-mix(in srgb, var(--bg) 92%, transparent));
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.22);
    transform-origin: center center;
    animation: chat-dialog-pop 520ms cubic-bezier(0.18, 1.12, 0.24, 1) both;
    will-change: transform, opacity;
  }

  .chat-modal-backdrop.from-item .chat-dialog {
    animation: chat-dialog-from-item 520ms cubic-bezier(0.18, 1.12, 0.24, 1) both;
  }

  @keyframes modal-backdrop-in {
    from {
      opacity: 0;
      backdrop-filter: blur(0) saturate(1);
    }
    to {
      opacity: 1;
      backdrop-filter: blur(9px) saturate(1.08);
    }
  }

  @keyframes chat-dialog-pop {
    0% {
      opacity: 0;
      transform: scale(0.92);
    }
    56% {
      opacity: 1;
      transform: scale(1.015);
    }
    76% {
      transform: scale(0.995);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes chat-dialog-from-item {
    0% {
      opacity: 0;
      transform: scale(0.86);
    }
    55% {
      opacity: 1;
      transform: scale(1.025);
    }
    75% {
      transform: scale(0.992);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chat-modal-backdrop,
    .chat-dialog {
      animation: none;
    }
  }

  .chat-titlebar {
    height: 68px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 0 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
    background: color-mix(in srgb, var(--bg-surface) 78%, transparent);
  }

  .dialog-user {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .title-meta h2 {
    margin: 0;
    font-size: 15.5px;
    font-weight: 720;
    letter-spacing: -0.02em;
  }

  .title-meta p {
    margin: 1px 0 0;
    font-size: 11.5px;
    color: var(--text-tertiary);
  }

  .chat-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 22px 22px;
  }

  .chat-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .chat-message {
    display: flex;
    justify-content: flex-start;
  }

  .chat-message.mine {
    justify-content: flex-end;
  }

  .chat-message-content {
    max-width: min(82%, 440px);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .chat-message.mine .chat-message-content {
    align-items: flex-end;
  }

  .chat-bubble {
    width: fit-content;
    max-width: 100%;
    padding: 9px 12px;
    border-radius: 18px;
    border-bottom-left-radius: 6px;
    background: color-mix(in srgb, var(--bg-surface) 88%, white 4%);
    color: var(--text-primary);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.04);
    line-height: 1.48;
  }

  .chat-message.mine .chat-bubble {
    border-bottom-left-radius: 18px;
    border-bottom-right-radius: 6px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 82%, white), var(--accent));
    color: white;
  }

  .chat-text {
    font-size: 14px;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .shared-card {
    position: relative;
    width: 236px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--border) 52%, transparent);
    border-radius: 17px;
    background: color-mix(in srgb, var(--bg-surface) 96%, white 4%);
    color: var(--text-primary);
    text-align: left;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.11);
  }

  .shared-card.song-card,
  .shared-card.album-card,
  .shared-card.playlist-card {
    display: block;
    padding: 0;
    font: inherit;
    cursor: pointer;
    transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.16s, filter 0.16s;
  }

  .shared-card.song-card:hover,
  .shared-card.album-card:hover,
  .shared-card.playlist-card:hover {
    transform: scale(0.94);
    filter: brightness(1.02);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.15);
  }

  .shared-card-cover {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    background: var(--bg-hover);
  }

  .shared-card-cover-placeholder {
    display: grid;
    place-items: center;
    font-size: 32px;
    color: var(--text-tertiary);
  }

  .shared-card-info {
    padding: 10px 12px 12px;
    min-width: 0;
  }

  .shared-card-title {
    font-size: 13.5px;
    font-weight: 720;
    letter-spacing: -0.02em;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shared-card-subtitle {
    margin-top: 2px;
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shared-card-play {
    position: absolute;
    right: 10px;
    bottom: 50px;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.92);
    color: var(--accent);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
  }

  .chat-time {
    padding: 0 4px;
    font-size: 10.5px;
    color: var(--text-tertiary);
  }

  @media (max-width: 760px) {
    .messages-page {
      padding: 16px;
    }

    .page-header h1 {
      font-size: 25px;
    }

    .chat-modal-backdrop {
      padding: 12px;
      place-items: center;
    }

    .chat-dialog {
      width: min(100%, 680px);
      height: min(82vh, 680px);
      min-height: 360px;
      border-radius: 22px;
    }

    .chat-scroll {
      padding: 16px 14px 18px;
    }

    .chat-message-content {
      max-width: 88%;
    }

    .shared-card {
      width: 218px;
    }
  }
</style>
