<script>
  import { player } from '../stores/player.svelte.js';

  let { onqueue, showQueue = false } = $props();

  // Mode cycle: list -> repeat -> shuffle -> list
  const modeLabels = {
    list: '顺序播放',
    repeat: '单曲循环',
    shuffle: '随机播放'
  }

  function cycleMode() {
    let nextMode = player.mode;
    if (player.mode === 'list') nextMode = 'repeat';
    else if (player.mode === 'repeat') nextMode = 'shuffle';
    else nextMode = 'list';
    player.setMode(nextMode);
  }
</script>

<div class="am-controls-container">
  <!-- Mode Button -->
  <button class="am-mode-btn" onclick={cycleMode} aria-label={modeLabels[player.mode]}>
    {#if player.mode === 'shuffle'}
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
      </svg>
    {:else if player.mode === 'repeat'}
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 6h16M4 12h16M4 18h16"/>
      </svg>
    {/if}
  </button>

  <!-- Previous -->
  <button class="am-control-btn" onclick={() => player.prev()} aria-label="上一首">
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
    </svg>
  </button>

  <!-- Play/Pause -->
  <button class="am-play-btn" class:playing={player.playing} onclick={() => player.togglePlay()} aria-label={player.playing ? '暂停' : '播放'}>
    {#if player.playing}
      <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
        <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
    {/if}
  </button>

  <!-- Next -->
  <button class="am-control-btn" onclick={() => player.next()} aria-label="下一首">
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
    </svg>
  </button>

  <!-- Queue -->
  <button class="am-control-btn" class:active={showQueue} onclick={() => {
    console.log('AppleMusicControls: queue button clicked, onqueue:', onqueue, 'showQueue:', showQueue);
    onqueue?.();
  }} aria-label="播放列表">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" d="M4 5h16M4 11h16M4 17h10"/>
      <path fill="currentColor" d="m4 12l4 3l-4 3z"/>
    </svg>
  </button>
</div>

<style>
  .am-controls-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 16px 0;
  }

  .am-mode-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.2s ease;
  }

  .am-mode-btn:active {
    transform: scale(0.96);
    background: rgba(255, 255, 255, 0.1);
  }

  .am-control-btn {
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
    transition: all 0.2s ease;
  }

  .am-control-btn:active {
    transform: scale(0.96);
    background: rgba(255, 255, 255, 0.1);
  }

  .am-control-btn.active {
    color: #fa243c;
  }

  .am-play-btn {
    width: 72px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: none;
    color: #121212;
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .am-play-btn:active {
    transform: scale(0.92);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .am-play-btn.playing {
    background: #fa243c;
    color: white;
  }
</style>
