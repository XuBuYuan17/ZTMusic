<script lang="ts">
  import type { SongId } from '../types/music.ts'
  import type { CompactTrack, CompactArtist } from '../player/queue.ts'
  import { player } from '../stores/player.svelte.ts'
  import { formatDuration } from '../format.ts'
  import { coverUrl } from '../utils/image.ts'
  import { extractCover } from '../utils/normalize.ts'
  import ArtistNames from './ArtistNames.svelte'
  import Icon from './ui/Icon.svelte'

  let { show = false, onClose, onOpenArtist, mobileVisible = false }: {
    show?: boolean
    onClose?: () => void
    onOpenArtist?: (id: number | null) => void
    mobileVisible?: boolean
  } = $props()

  // 接缝：下游 ArtistNames 收 SongId，上游 PCPlayer/App 透传的 router 回调收 number|null（在线 id 恒为 number）
  function handleOpenArtist(id: SongId): void {
    onOpenArtist?.(id as number | null)
  }

  function handlePlayTrack(track: CompactTrack, index: number): void {
    player.playTrack(track, index)
  }

  function handleClear(): void {
    player.clearQueue()
  }

  function handlePlayNext(e: MouseEvent, track: CompactTrack): void {
    e.stopPropagation()
    player.playNext(track)
  }

  function handleRemove(e: MouseEvent, index: number): void {
    e.stopPropagation()
    player.removeQueueItem(index)
  }

  function handleItemKeyDown(e: KeyboardEvent, track: CompactTrack, index: number): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handlePlayTrack(track, index)
    }
  }

  function handleBackdropKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClose?.()
    }
  }

  function scrollToCurrent(behavior: ScrollBehavior = 'smooth'): void {
    if (!queueListEl) return
    const item = queueListEl.querySelector<HTMLElement>('.queue-item.active')
    if (!item) return
    const container = queueListEl
    const itemTop = item.offsetTop - container.offsetTop
    const itemHeight = item.offsetHeight
    const containerHeight = container.clientHeight
    const centerTarget = itemTop - containerHeight / 2 + itemHeight / 2
    if (itemTop < containerHeight / 2) {
      container.scrollTo({ top: 0, behavior })
      return
    }
    container.scrollTo({ top: centerTarget, behavior })
  }

  let queueListEl = $state<HTMLDivElement | null>(null)
  let dragIndex = $state<number | null>(null)
  let dragOverIndex = $state<number | null>(null)

  function handleDragStart(e: DragEvent, index: number): void {
    dragIndex = index
    // dataTransfer 为 null 时与原 JS 一样直接抛 TypeError，不做防御
    e.dataTransfer!.effectAllowed = 'move'
  }

  function handleDragOver(e: DragEvent, index: number): void {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'move'
    if (dragOverIndex !== index) dragOverIndex = index
  }

  function handleDragLeave(): void {
    dragOverIndex = null
  }

  function handleDrop(e: DragEvent, index: number): void {
    e.preventDefault()
    const from = dragIndex
    if (from === null || from === index) { dragIndex = null; dragOverIndex = null; return }
    player.moveQueueItem(from, index)
    dragIndex = null
    dragOverIndex = null
  }

  function handleDragEnd(): void {
    dragIndex = null
    dragOverIndex = null
  }

  $effect(() => {
    if (show && player.queue.length) {
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToCurrent(mobileVisible ? 'auto' : 'smooth')))
    }
  })

  function coverOf(track: CompactTrack): string {
    return extractCover(track)
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="queue-panel-backdrop" class:queue-panel-mobile-visible={mobileVisible} role="button" tabindex="0" aria-label="关闭面板" onclick={onClose} onkeydown={handleBackdropKeyDown}></div>
  <div class="queue-panel" class:queue-panel-mobile-visible={mobileVisible}>
    <div class="queue-header">
      <div class="queue-title">待播清单</div>
      <div class="queue-header-actions">
        <button class="queue-clear-btn" onclick={handleClear} disabled={player.queue.length === 0}>
          清除
        </button>
        <button class="queue-close-btn" onclick={onClose} aria-label="关闭">
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
    <div class="queue-list" bind:this={queueListEl}>
      {#if player.queue.length === 0}
        <div class="queue-empty">
          <div class="queue-empty-icon">
            <Icon name="music" size={48} strokeWidth={1.2} />
          </div>
          <div class="queue-empty-text">暂无播放列表</div>
        </div>
      {:else}
        {#each player.queue as track, i}
          <div
            class="queue-item"
            class:active={player.queueIndex === i}
            class:drag-over={dragOverIndex === i}
            class:dragging={dragIndex === i}
            draggable="true"
            role="button"
            tabindex="0"
            onclick={() => handlePlayTrack(track, i)}
            onkeydown={(e) => handleItemKeyDown(e, track, i)}
            ondragstart={(e) => handleDragStart(e, i)}
            ondragover={(e) => handleDragOver(e, i)}
            ondragleave={handleDragLeave}
            ondrop={(e) => handleDrop(e, i)}
            ondragend={handleDragEnd}
          >
            <div class="queue-item-cover">
              {#if coverOf(track)}
                <img
                  src={coverUrl(coverOf(track), 100)}
                  alt={track.name}
                  loading="lazy"
                  referrerpolicy="no-referrer"
                />
              {:else}
                <div class="queue-item-cover-placeholder">
                  <Icon name="music" size={20} strokeWidth={1.5} />
                </div>
              {/if}
            </div>
            <div class="queue-item-info">
              <div class="queue-item-title">{track.name}</div>
              <div class="queue-item-artist">
                <ArtistNames artists={track.ar || (track as CompactTrack & { artists?: CompactArtist[] }).artists || []} onOpenArtist={handleOpenArtist} />
              </div>
            </div>
            <div class="queue-item-duration">
              {formatDuration(track.dt || (track as CompactTrack & { duration?: number }).duration || 0)}
            </div>
            <button class="queue-item-playnext" onclick={(e) => handlePlayNext(e, track)} aria-label="下一首播放" title="下一首播放">
              <Icon name="arrow-up" size={14} />
            </button>
            <button class="queue-item-remove" onclick={(e) => handleRemove(e, i)} aria-label="移除" title="移除">
              <Icon name="close" size={14} />
            </button>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .queue-panel-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
  }

  .queue-panel {
    position: fixed;
    top: 12px;
    right: 12px;
    bottom: 12px;
    width: 340px;
    background: var(--bg-surface);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
    z-index: calc(var(--z-overlay) + 1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideIn var(--dur-slow) var(--ease-out);
  }

  /* 桌面自定义标题栏：面板从标题栏下方 12px 开始；≤760px 是移动底部 sheet，不避让 */
  @media (min-width: 761px) {
    :global(html.desktop-titlebar) .queue-panel {
      top: calc(var(--titlebar-h) + 12px);
    }
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .queue-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--border);
  }

  .queue-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .queue-close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: 50%;
    transition: all var(--dur-fast);
  }

  .queue-close-btn:active {
    background: var(--bg-active);
    color: var(--text);
  }

  .queue-title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .queue-clear-btn {
    background: none;
    border: none;
    color: var(--accent);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-xs);
    transition: all var(--dur-fast);
  }

  .queue-clear-btn:hover:not(:disabled) {
    background: var(--accent-bg);
  }

  .queue-clear-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .queue-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .queue-list::-webkit-scrollbar {
    width: 4px;
  }

  .queue-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .queue-list::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.15);
    border-radius: 2px;
  }

  .queue-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    cursor: grab;
    transition: background 0.1s, opacity 0.15s;
    width: 100%;
    text-align: left;
    border: none;
    position: relative;
  }
  .queue-item:active { cursor: grabbing; }
  .queue-item.dragging { opacity: 0.4; }
  .queue-item.drag-over::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
  }

  .queue-item:hover {
    background: var(--bg-hover);
  }

  .queue-item.active {
    color: var(--accent);
    background: var(--accent-bg);
  }

  .queue-item.active .queue-item-title {
    font-weight: 700;
  }

  .queue-item-cover {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-xs);
    overflow: hidden;
    flex-shrink: 0;
    background: var(--bg-layer);
  }

  .queue-item-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .queue-item-cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
  }

  .queue-item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .queue-item-title {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .queue-item-artist {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .queue-item-duration {
    font-size: 12px;
    color: var(--text-tertiary);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .queue-item-playnext,
  .queue-item-remove {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    opacity: 0;
    flex-shrink: 0;
    transition: opacity 0.15s, background 0.15s, color 0.15s;
  }
  .queue-item-playnext:hover { background: var(--accent-bg); color: var(--accent); }
  .queue-item-remove:hover { background: rgba(255, 59, 48, 0.12); color: #ff3b30; }
  .queue-item:hover .queue-item-playnext,
  .queue-item:hover .queue-item-remove { opacity: 1; }

  .queue-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
  }

  .queue-empty-icon {
    color: var(--text-tertiary);
    opacity: 0.5;
    margin-bottom: 12px;
  }

  .queue-empty-text {
    color: var(--text-secondary);
    font-size: 14px;
  }

  @media (max-width: 760px) {
    .queue-panel-backdrop,
    .queue-panel {
      display: none;
    }

    .queue-panel-backdrop.queue-panel-mobile-visible {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 100;
      background: transparent;
    }

    .queue-panel.queue-panel-mobile-visible {
      display: flex;
      position: fixed;
      left: 0;
      right: 0;
      top: auto;
      bottom: 0;
      z-index: 101;
      width: 100%;
      height: 68vh;
      max-height: 520px;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      border: 1px solid var(--border);
      border-bottom: none;
      background: var(--bg-surface);
      backdrop-filter: blur(40px) saturate(180%);
      -webkit-backdrop-filter: blur(40px) saturate(180%);
      box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
      animation: queue-slide-up 0.32s var(--ease-out);
    }

    .queue-panel.queue-panel-mobile-visible .queue-list {
      padding: calc(50% - 32px) 0;
      scroll-padding-block: 50%;
    }

    .queue-panel.queue-panel-mobile-visible .queue-item.active {
      margin: 4px 10px;
      width: calc(100% - 20px);
      border-radius: var(--radius-lg);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent);
    }
  }

  @keyframes queue-slide-up {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes queue-drop-down {
    from {
      transform: translateY(-22px) scale(0.98);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }
</style>
