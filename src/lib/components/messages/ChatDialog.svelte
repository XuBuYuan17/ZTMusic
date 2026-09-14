<script lang="ts">
  import type { CompactTrackInput } from '../../player/queue.ts'
  import { player } from '../../stores/player.svelte.ts'
  import { ncm } from '../../api/client.ts'
  import Spinner from '../Spinner.svelte'
  import { coverUrl } from '../../utils/image.ts'
  import {
    extractMessageList,
    formatMessageTime,
    getMessageAvatar,
    getMessageNickname,
    getMessageSongArtists,
    getMessageUserId,
    parseChatMessage,
  } from '../../services/message-data.ts'

  type Msg = Record<string, unknown>

  function rec(value: unknown): Msg | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Msg : null
  }

  let {
    msg,
    onClose,
    onNavigate,
  }: {
    msg: Msg
    onClose?: () => void
    onNavigate?: (view: string, extra?: number | null) => void
  } = $props()

  let chatMessages = $state<Msg[]>([])
  let chatLoading = $state(false)
  let chatError = $state('')
  let chatScrollEl = $state<HTMLElement | null>(null)
  let shouldScrollToBottom = $state(false)
  let loadRequestId = 0

  let fromItem = $derived(Boolean(msg.userId || msg.fromUserId || msg.id))

  $effect(() => {
    const current = msg
    const requestId = ++loadRequestId
    chatMessages = []
    chatError = ''
    const uid = getMessageUserId(current)
    if (!uid) {
      chatError = '无法获取用户 ID'
      return
    }
    chatLoading = true
    ncm.msgPrivateHistory(uid, 50)
      .then((res) => {
        if (requestId !== loadRequestId) return
        chatMessages = extractMessageList(res) as Msg[]
      })
      .catch((e) => {
        if (requestId !== loadRequestId) return
        chatError = '加载聊天记录失败'
        console.error(e)
      })
      .finally(() => {
        if (requestId !== loadRequestId) return
        chatLoading = false
        shouldScrollToBottom = true
      })
  })

  $effect(() => {
    const el = chatScrollEl
    if (shouldScrollToBottom && el && chatMessages.length > 0) {
      shouldScrollToBottom = false
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    }
  })

  function stopEvent(e: Event): void {
    e.stopPropagation()
  }

  function getSongCover(song: unknown): string {
    const s = rec(song)
    const album = rec(s?.al) || rec(s?.album) || {}
    const cover = album.picUrl || s?.coverImgUrl || s?.picUrl
    return typeof cover === 'string' ? cover : ''
  }

  function getShareCover(data: unknown): string {
    const d = rec(data)
    const album = rec(d?.al) || rec(d?.album) || {}
    const cover = album.picUrl || d?.picUrl || d?.coverImgUrl
    return typeof cover === 'string' ? cover : ''
  }

  function playSongFromMessage(song: unknown): void {
    const s = rec(song)
    if (!s?.id) return
    player.playTrack(s as CompactTrackInput, -1)
  }

  function openAlbumFromMessage(album: unknown): void {
    const a = rec(album)
    if (!a?.id) return
    onClose?.()
    onNavigate?.('album', a.id as number)
  }

  function openPlaylistFromMessage(playlist: unknown): void {
    const p = rec(playlist)
    if (!p?.id) return
    onClose?.()
    onNavigate?.('playlist', p.id as number)
  }
</script>

<div class="chat-modal-backdrop" onclick={() => onClose?.()} role="presentation" class:from-item={fromItem}>
  <div class="chat-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-label="与 {getMessageNickname(msg)} 的私信" onclick={stopEvent} onkeydown={stopEvent}>
    <div class="chat-titlebar">
      <div class="dialog-user">
        {#if getMessageAvatar(msg)}
          <img class="title-avatar" src={coverUrl(getMessageAvatar(msg), 72)} alt="" referrerpolicy="no-referrer" />
        {:else}
          <div class="title-avatar avatar-placeholder">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        {/if}
        <div class="title-meta">
          <h2>{getMessageNickname(msg)}</h2>
          <p>私人会话</p>
        </div>
      </div>
      <button class="close-btn" onclick={() => onClose?.()} aria-label="关闭对话框">
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
            {@const parsed = parseChatMessage(item.msg || item.lastMsg)}
            <div class="chat-message" class:mine={getMessageUserId(item) !== getMessageUserId(msg)}>
              <div class="chat-message-content">
                {#if parsed.type === 'song'}
                  {#if parsed.text}<div class="chat-bubble"><div class="chat-text">{parsed.text}</div></div>{/if}
                  <button type="button" class="shared-card song-card" onclick={() => playSongFromMessage(parsed.data)} aria-label="播放歌曲 {(parsed.data.name as string) || ''}">
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
                      <div class="shared-card-title">{(parsed.data.name as string) || '未知歌曲'}</div>
                      <div class="shared-card-subtitle">{getMessageSongArtists(parsed.data) || '未知歌手'}</div>
                    </div>
                    <div class="shared-card-play">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                        <path d="M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z"/>
                      </svg>
                    </div>
                  </button>
                {:else if parsed.type === 'album'}
                  {#if parsed.text}<div class="chat-bubble"><div class="chat-text">{parsed.text}</div></div>{/if}
                  <button type="button" class="shared-card album-card" onclick={() => openAlbumFromMessage(parsed.data)} aria-label="打开专辑 {(parsed.data.name as string) || ''}">
                    {#if getShareCover(parsed.data)}
                      <img class="shared-card-cover" src={coverUrl(getShareCover(parsed.data), 240)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                    {:else}
                      <div class="shared-card-cover shared-card-cover-placeholder">💿</div>
                    {/if}
                    <div class="shared-card-info">
                      <div class="shared-card-title">{(parsed.data.name as string) || '未知专辑'}</div>
                      <div class="shared-card-subtitle">{((parsed.data.artist as { name?: string } | null | undefined)?.name) || '点击打开专辑'}</div>
                    </div>
                    <div class="shared-card-play">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                        <path d="M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z"/>
                      </svg>
                    </div>
                  </button>
                {:else if parsed.type === 'playlist'}
                  {#if parsed.text}<div class="chat-bubble"><div class="chat-text">{parsed.text}</div></div>{/if}
                  <button type="button" class="shared-card playlist-card" onclick={() => openPlaylistFromMessage(parsed.data)} aria-label="打开歌单 {(parsed.data.name as string) || ''}">
                    {#if getShareCover(parsed.data)}
                      <img class="shared-card-cover" src={coverUrl(getShareCover(parsed.data), 240)} alt="" loading="lazy" referrerpolicy="no-referrer" />
                    {:else}
                      <div class="shared-card-cover shared-card-cover-placeholder">♪</div>
                    {/if}
                    <div class="shared-card-info">
                      <div class="shared-card-title">{(parsed.data.name as string) || '未知歌单'}</div>
                      <div class="shared-card-subtitle">{parsed.data.trackCount ? (parsed.data.trackCount as number) + ' 首' : '点击打开歌单'}</div>
                    </div>
                  </button>
                {:else}
                  <div class="chat-bubble"><div class="chat-text">{parsed.text}</div></div>
                {/if}
                <div class="chat-time">{formatMessageTime(item.time || item.lastMsgTime)}</div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
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
    border-radius: var(--radius-xl);
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
    font-weight: 700;
    letter-spacing: 0;
  }

  .title-meta p {
    margin: 1px 0 0;
    font-size: 11.5px;
    color: var(--text-tertiary);
  }

  .title-avatar {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: linear-gradient(145deg, var(--bg-hover), var(--bg-surface));
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
    object-fit: cover;
  }

  .avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--text-tertiary);
  }

  .close-btn {
    border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    background: color-mix(in srgb, var(--bg-surface) 76%, white 8%);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.16s, transform 0.12s, border-color 0.16s;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: color-mix(in srgb, var(--bg-hover) 86%, white 10%);
  }

  .close-btn:active,
  .shared-card:active {
    transform: scale(0.98);
  }

  .close-btn:focus-visible,
  .shared-card:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 68%, white);
    outline-offset: 2px;
  }

  .dialog-state {
    min-height: 260px;
    display: grid;
    place-items: center;
    padding: 24px;
    color: var(--text-tertiary);
    text-align: center;
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
    border-radius: var(--radius-lg);
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
    border-radius: var(--radius-lg);
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
    font-weight: 700;
    letter-spacing: 0;
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
    .chat-modal-backdrop {
      padding: 12px;
      place-items: center;
    }

    .chat-dialog {
      width: min(100%, 680px);
      height: min(82vh, 680px);
      min-height: 360px;
      border-radius: var(--radius-xl);
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
