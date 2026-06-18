<script>
  import { player } from '../stores/player.svelte.js';
  import { coverUrl } from '../utils/image.js';

  let { onClick } = $props();
</script>

<div class="am-mini-player" onclick={onClick}>
  <img class="am-mini-cover" src={coverUrl(player.cover, 100)} alt="" referrerpolicy="no-referrer" />
  
  <div class="am-mini-info">
    <div class="am-mini-title">{player.title || '未在播放'}</div>
    <div class="am-mini-artist">{player.artist || ''}</div>
  </div>

  <div class="am-mini-controls">
    <button class="am-mini-play-btn" onclick={(e) => { e.stopPropagation(); player.togglePlay(); }} aria-label={player.playing ? '暂停' : '播放'}>
      {#if player.playing}
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M6 4h2v16H6zM14 4h2v16h-2z"/>
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      {/if}
    </button>
  </div>

  <!-- Progress Bar -->
  <div class="am-mini-progress">
    <div class="am-mini-progress-bar" style={`width: ${player.duration ? (player.currentTime / player.duration * 100) : 0}%"></div>
  </div>
</div>

<style>
  .am-mini-player {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 64px;
    background: rgba(40, 40, 40);
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 12px;
    cursor: pointer;
    z-index: 999;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .am-mini-cover {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    object-fit: cover;
  }

  .am-mini-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
  }

  .am-mini-title {
    font-size: 14px;
    font-weight: 600;
    color: white;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .am-mini-artist {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .am-mini-controls {
    display: flex;
    align-items: center;
  }

  .am-mini-play-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    border-radius: 50%;
  }

  .am-mini-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: rgba(255, 255, 255, 0.1);
  }

  .am-mini-progress-bar {
    height: 100%;
    background: #fa243c;
    transition: width 0.1s linear;
  }
</style>
