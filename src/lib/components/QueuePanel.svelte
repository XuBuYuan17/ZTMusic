<script>
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'
  import { coverUrl } from '../utils/image.js'
  import { extractCover } from '../utils/normalize.js'
  import ArtistNames from './ArtistNames.svelte'
  import Icon from './ui/Icon.svelte'

  let { show = false, onClose, onOpenArtist, mobileVisible = false } = $props()

  function handlePlayTrack(track, index) {
    player.playTrack(track, index)
  }

  function handleClear() {
    player.clearQueue()
  }

  function handleRemove(e, index) {
    e.stopPropagation()
    player.removeFromQueue(index)
  }

  function handleItemKeyDown(e, track, index) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handlePlayTrack(track, index)
    }
  }

  function handleBackdropKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClose?.()
    }
  }

  function scrollToCurrent(behavior = 'smooth') {
    if (!queueListEl) return
    const item = queueListEl.querySelector('.queue-item.active')
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

  let queueListEl = $state(null)

  $effect(() => {
    if (show && player.queue.length) {
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToCurrent(mobileVisible ? 'auto' : 'smooth')))
    }
  })

  function coverOf(track) {
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
            role="button"
            tabindex="0"
            onclick={() => handlePlayTrack(track, i)}
            onkeydown={(e) => handleItemKeyDown(e, track, i)}
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
                <ArtistNames artists={track.ar || track.artists || []} {onOpenArtist} />
              </div>
            </div>
            <div class="queue-item-duration">
              {formatDuration(track.dt || track.duration || 0)}
            </div>
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
    z-index: 45;
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
    border-radius: 16px;
    border: 1px solid var(--border);
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
    z-index: 50;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideIn 0.3s var(--ease-out);
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
    transition: all 0.15s;
  }

  .queue-close-btn:active {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }

  .queue-title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }

  .queue-clear-btn {
    background: none;
    border: none;
    color: var(--accent);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: all 0.15s;
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
    cursor: pointer;
    transition: background 0.1s;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    color: inherit;
  }

  .queue-item:hover {
    background: var(--bg-hover);
  }

  .queue-item.active {
    color: var(--accent);
    background: var(--accent-bg);
  }

  .queue-item.active .queue-item-title {
    font-weight: 800;
  }

  .queue-item-cover {
    width: 44px;
    height: 44px;
    border-radius: 6px;
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
      border-radius: 18px 18px 0 0;
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
      border-radius: 14px;
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
