<script>
  import { player } from '../stores/player.svelte.js'
  import { formatDuration } from '../format.js'
  import { extractCover } from '../utils/normalize.js'
  import ArtistNames from './ArtistNames.svelte'

  let { show = false, onClose, onOpenArtist } = $props()

  function playTrack(track, index) {
    player.playTrack(track, index)
  }

  function clearQueue(e) {
    e?.stopPropagation()
    player.clearQueue()
  }

  function removeTrack(e, index) {
    e.stopPropagation()
    player.removeFromQueue(index)
  }

  function handleItemKeyDown(e, track, index) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      playTrack(track, index)
    }
  }

  function handleBackdropKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClose?.()
    }
  }

  function coverOf(track) {
    return extractCover(track)
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="mobile-queue-backdrop" role="button" tabindex="0" aria-label="关闭播放列表" onclick={onClose} onkeydown={handleBackdropKeyDown}></div>

  <section class="mobile-queue-panel" aria-label="播放列表">
    <header class="mobile-queue-head">
      <div>
        <div class="mobile-queue-kicker">正在播放</div>
        <h2>待播清单</h2>
      </div>
      <div class="mobile-queue-actions">
        <span>{player.queue.length} 首</span>
        <button type="button" class="mobile-queue-clear" disabled={player.queue.length === 0} onclick={clearQueue}>清空</button>
      </div>
    </header>

    <div class="mobile-queue-list">
      {#if player.queue.length === 0}
        <div class="mobile-queue-empty">
          <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <p>暂无播放列表</p>
        </div>
      {:else}
        {#each player.queue as track, i}
          <div
            class="mobile-queue-item"
            class:active={player.queueIndex === i}
            role="button"
            tabindex="0"
            onclick={() => playTrack(track, i)}
            onkeydown={(e) => handleItemKeyDown(e, track, i)}
          >
            <div class="mobile-queue-cover">
              {#if coverOf(track)}
                <img src={`${coverOf(track)}?param=96y96`} alt={track.name} loading="lazy" />
              {:else}
                <div class="mobile-queue-cover-ph" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
              {/if}
            </div>

            <div class="mobile-queue-info">
              <div class="mobile-queue-title">{track.name}</div>
              <div class="mobile-queue-artist">
                <ArtistNames artists={track.ar || track.artists || []} {onOpenArtist} />
              </div>
            </div>

            <div class="mobile-queue-meta">
              {#if player.queueIndex === i}
                <span class="mobile-queue-playing">播放中</span>
              {:else}
                <span>{formatDuration(track.dt || track.duration || 0)}</span>
              {/if}
              <button type="button" class="mobile-queue-remove" aria-label="移除歌曲" onclick={(e) => removeTrack(e, i)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>
{/if}

<style>
  .mobile-queue-backdrop,
  .mobile-queue-panel {
    display: none;
  }

  @media (max-width: 760px) {
    .mobile-queue-backdrop {
      position: fixed;
      inset: 0;
      z-index: 47;
      display: block;
      background: rgba(0, 0, 0, 0.26);
      backdrop-filter: blur(3px);
      -webkit-backdrop-filter: blur(3px);
    }

    .mobile-queue-panel {
      position: fixed;
      top: calc(10px + env(safe-area-inset-top));
      left: 10px;
      right: 10px;
      z-index: 52;
      display: flex;
      flex-direction: column;
      height: min(58dvh, 480px);
      max-height: calc(100dvh - 178px - env(safe-area-inset-top));
      overflow: hidden;
      color: var(--text-primary);
      background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
      border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
      border-radius: 22px;
      box-shadow: 0 20px 52px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255,255,255,0.1);
      backdrop-filter: blur(32px) saturate(180%);
      -webkit-backdrop-filter: blur(32px) saturate(180%);
      animation: mobileQueueDrop 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .mobile-queue-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 16px 12px;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    }

    .mobile-queue-kicker {
      margin-bottom: 3px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--text-tertiary);
    }

    .mobile-queue-head h2 {
      margin: 0;
      font-size: 18px;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    .mobile-queue-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      color: var(--text-tertiary);
      font-size: 12px;
    }

    .mobile-queue-clear,
    .mobile-queue-remove {
      border: 0;
      color: inherit;
      cursor: pointer;
    }

    .mobile-queue-clear {
      height: 30px;
      padding: 0 11px;
      border-radius: 999px;
      color: var(--accent);
      background: var(--accent-bg);
      font-size: 13px;
      font-weight: 700;
    }

    .mobile-queue-clear:disabled {
      opacity: 0.42;
      cursor: not-allowed;
    }

    .mobile-queue-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 8px 8px 10px;
      overscroll-behavior: contain;
    }

    .mobile-queue-list::-webkit-scrollbar {
      width: 0;
    }

    .mobile-queue-item {
      display: grid;
      grid-template-columns: 46px minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px;
      border: 0;
      border-radius: 16px;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
      transition: background 0.15s ease, transform 0.15s ease;
    }

    .mobile-queue-item:active {
      transform: scale(0.99);
    }

    .mobile-queue-item.active {
      background: color-mix(in srgb, var(--accent) 13%, transparent);
      color: var(--accent);
    }

    .mobile-queue-cover,
    .mobile-queue-cover-ph {
      width: 46px;
      height: 46px;
      border-radius: 13px;
      overflow: hidden;
      background: var(--bg-layer);
    }

    .mobile-queue-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .mobile-queue-cover-ph {
      display: grid;
      place-items: center;
      color: var(--text-tertiary);
    }

    .mobile-queue-info {
      min-width: 0;
    }

    .mobile-queue-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.2;
    }

    .mobile-queue-artist {
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-secondary);
      font-size: 12px;
    }

    .mobile-queue-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-tertiary);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }

    .mobile-queue-playing {
      color: var(--accent);
      font-weight: 800;
    }

    .mobile-queue-remove {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--bg-hover) 72%, transparent);
      opacity: 0.74;
    }

    .mobile-queue-empty {
      display: grid;
      place-items: center;
      align-content: center;
      min-height: 260px;
      gap: 10px;
      color: var(--text-tertiary);
      text-align: center;
    }

    .mobile-queue-empty p {
      margin: 0;
      font-size: 14px;
    }

    @keyframes mobileQueueDrop {
      from {
        opacity: 0;
        transform: translateY(-24px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  }
</style>
