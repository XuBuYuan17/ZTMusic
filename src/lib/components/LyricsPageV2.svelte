<script>
  import { player } from '../stores/player.svelte.js';
  import { responsive } from '../utils/responsive.js';
  import AppleMusicPlayer from './AppleMusicPlayer.svelte';
  import PCPlayer from './PCPlayer.svelte';

  let { show = false, onClose, onOpenArtist } = $props();

  let showLocalQueue = $state(false);
  let lyricsMode = $state(false);
  let mounted = $state(false);
  let contentEntered = $state(false);
  let closing = $state(false);

  function toggleLocalQueue() {
    showLocalQueue = !showLocalQueue;
    console.log('toggleLocalQueue called, showLocalQueue:', showLocalQueue);
  }

  function toggleLyricsMode() {
    lyricsMode = !lyricsMode;
  }

  // 入场动画
  $effect(() => {
    if (show) {
      mounted = true;
      setTimeout(() => { contentEntered = true; }, 10);
    } else {
      contentEntered = false;
      setTimeout(() => { mounted = false; }, 300);
    }
  });

  function handleClose(e) {
    if (e.target.closest('.ly-keep-open')) return;
    closing = true;
    setTimeout(() => { onClose?.(); closing = false; }, 280);
  }
</script>

{#if mounted}
  <div class="ly-fullscreen" class:mounted={contentEntered} class:closing={closing}
    style={player.cover ? `--ly-cover: url(${player.cover})` : ''}
    role="presentation" onclick={handleClose}>

    <div class="ly-container" role="presentation" onclick={(e) => e.stopPropagation()}>
      <!-- Top bar (PC only) - now empty, queue button moved to controls -->
      <div class="ly-top-bar"></div>

      <button class="ly-back-btn" onclick={handleClose} aria-label="关闭">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      {#if $responsive.isMobile}
        <AppleMusicPlayer
          {onClose}
          {onOpenArtist}
          {showLocalQueue}
          {toggleLocalQueue}
        />
      {:else}
        <PCPlayer
          {onClose}
          {onOpenArtist}
          {showLocalQueue}
          {toggleLocalQueue}
        />
      {/if}
    </div>
  </div>
{/if}
