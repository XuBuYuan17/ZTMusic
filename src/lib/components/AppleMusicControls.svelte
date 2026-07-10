<script>
  import { player } from '../stores/player.svelte.js';
  import Spinner from './Spinner.svelte';

  let { onqueue, showQueue = false } = $props();

  let disabled = $derived(!player.id);

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

  function handleQueue(event) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    onqueue?.();
  }

  function handleButton(event, action) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    action();
  }

  function handleQueueKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    handleQueue(event);
  }
</script>

<div class="am-play-row">
  <!-- Mode -->
  <button class="am-ctrl-btn" class:active={player.mode === 'repeat' || player.mode === 'shuffle'} onclick={(event) => handleButton(event, cycleMode)} aria-label={modeLabels[player.mode]} disabled={disabled}>
    {#if player.mode === 'shuffle'}
      <svg viewBox="0 0 640 640" fill="currentColor" class="am-icon am-icon--fill">
        <path d="M467.8 98.4c12-5 25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64c-9.2 9.2-22.9 11.9-34.9 6.9S448 268.9 448 256v-32h-32c-10.1 0-19.6 4.7-25.6 12.8L358 280l-40-53.3l21.2-28.3c18.1-24.2 46.6-38.4 76.8-38.4h32v-32c0-12.9 7.8-24.6 19.8-29.6M218 360l40 53.3l-21.2 28.3C218.7 465.8 190.2 480 160 480H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h64c10.1 0 19.6-4.7 25.6-12.8zm284.6 174.6c-9.2 9.2-22.9 11.9-34.9 6.9S448 524.9 448 512v-32h-32c-30.2 0-58.7-14.2-76.8-38.4L185.6 236.8c-6-8.1-15.5-12.8-25.6-12.8H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h64c30.2 0 58.7 14.2 76.8 38.4l153.6 204.8c6 8.1 15.5 12.8 25.6 12.8h32v-32c0-12.9 7.8-24.6 19.8-29.6s25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64z"/>
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="am-icon am-icon--stroke">
        <path d="M4 12V9a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3m3 3v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3"/>
      </svg>
    {/if}
  </button>

  <!-- Prev -->
  <button class="am-ctrl-btn" onclick={(event) => handleButton(event, () => player.prev())} aria-label="上一首" disabled={disabled}>
    <svg viewBox="0 0 24 24" fill="currentColor" class="am-icon am-icon--fill">
      <path d="M2.5 9.402c-2 1.155-2 4.041 0 5.196l9 5.196c1.515.875 3.317.259 4.102-1.096l1.898 1.096c2 1.155 4.5-.288 4.5-2.598V6.804c0-2.31-2.5-3.753-4.5-2.598l-1.898 1.096c-.785-1.355-2.587-1.971-4.102-1.096zM16 7.382v9.237l2.5 1.443a1 1 0 0 0 1.5-.866V6.804a1 1 0 0 0-1.5-.866z" fill-rule="evenodd" clip-rule="evenodd"/>
    </svg>
  </button>

  <!-- Play/Pause -->
  <button class="am-play-btn" class:playing={player.playing} onclick={(event) => handleButton(event, () => player.togglePlay())} aria-label={player.playing ? '暂停' : '播放'} disabled={disabled || player.loading}>
    {#if player.loading}
      <Spinner size="md" />
    {:else if player.playing}
      <svg viewBox="0 0 24 24" fill="currentColor" class="am-icon am-icon--play">
        <path d="M9 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m8 0h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/>
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="currentColor" class="am-icon am-icon--play">
        <path d="M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z" fill-rule="evenodd" clip-rule="evenodd"/>
      </svg>
    {/if}
  </button>

  <!-- Next -->
  <button class="am-ctrl-btn" onclick={(event) => handleButton(event, () => player.next())} aria-label="下一首" disabled={disabled}>
    <svg viewBox="0 0 24 24" fill="currentColor" class="am-icon am-icon--fill">
      <path d="M5.5 5.938a1 1 0 0 0-1.5.866v10.392a1 1 0 0 0 1.5.866L8 16.62V7.38zm2.898-.636L6.5 4.206l-.5.866l.5-.866C4.5 3.05 2 4.494 2 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598l1.898-1.096c.785 1.355 2.587 1.971 4.102 1.096l9-5.196c2-1.155 2-4.041 0-5.196l-9-5.196c-1.515-.875-3.317-.259-4.102 1.096" fill-rule="evenodd" clip-rule="evenodd"/>
    </svg>
  </button>

  <!-- Queue -->
  <button class="am-ctrl-btn" class:active={showQueue} onpointerup={handleQueue} onkeydown={handleQueueKeydown} aria-label="播放列表" disabled={disabled}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" class="am-icon am-icon--stroke">
      <path stroke-linecap="round" d="M4 5h16M4 11h16M4 17h10"/>
      <path fill="currentColor" d="m4 12l4 3l-4 3z"/>
    </svg>
  </button>
</div>

<style>
  .am-play-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    width: 100%;
    padding: 4px 0;
  }

  .am-ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: none;
    background: none;
    color: rgba(255,255,255,0.5);
    cursor: pointer;
    transition: color 0.15s, transform 0.15s cubic-bezier(.2,.9,.2,1);
    flex-shrink: 0;
  }

  .am-ctrl-btn:active {
    transform: scale(0.82);
  }

  .am-ctrl-btn:disabled,
  .am-play-btn:disabled {
    cursor: default;
    opacity: 0.35;
    transform: none;
  }

  .am-ctrl-btn.active {
    color: var(--accent, #fc3c44);
  }

  .am-play-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: none;
    color: rgba(255,255,255,0.9);
    border: none;
    cursor: pointer;
    transition: color 0.15s, transform 0.15s cubic-bezier(.2,.9,.2,1);
    flex-shrink: 0;
  }

  .am-play-btn:active {
    transform: scale(0.85);
  }

  .am-play-btn:hover,
  .am-ctrl-btn:hover {
    color: #fff;
  }

  .am-icon {
    width: 32px;
    height: 32px;
    pointer-events: none;
  }

  .am-icon--play {
    width: 36px;
    height: 36px;
  }

  .am-icon--fill {
    opacity: 0.95;
  }

  .am-icon--stroke {
    opacity: 0.92;
  }
</style>
