<script>
  import { player } from '../stores/player.svelte.js';
  import { responsive } from '../utils/responsive.js';
  import AppleMusicPlayer from './AppleMusicPlayer.svelte';
  import PCPlayer from './PCPlayer.svelte';

  let { show = false, onClose, onOpenArtist } = $props();

  let showLocalQueue = $state(false);
  let lyricsMode = $state(false);
  let controlsVisible = $state(true);
  let mounted = $state(false);
  let entered = $state(false);
  let closing = $state(false);
  let hideTimer = $state(null);

  function showControls() {
    controlsVisible = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { controlsVisible = false; }, 4000);
  }

  function resetControls() {
    showControls();
  }

  // Auto-hide after entering
  $effect(() => {
    if (entered) {
      hideTimer = setTimeout(() => { controlsVisible = false; }, 4000);
    }
    return () => { if (hideTimer) clearTimeout(hideTimer); };
  });

  function toggleLocalQueue() {
    showLocalQueue = !showLocalQueue;
    console.log('toggleLocalQueue called, showLocalQueue:', showLocalQueue);
  }

  function toggleLyricsMode() {
    lyricsMode = !lyricsMode;
  }

  // 开/关动画
  $effect(() => {
    if (show) {
      mounted = true;
      setTimeout(() => { entered = true; }, 10);
    } else {
      entered = false;
      closing = true;
      setTimeout(() => { mounted = false; closing = false; }, 250);
    }
  });

  function handleClose(e) {
    if (e.target.closest('.ly-keep-open')) return;
    closing = true;
    setTimeout(() => { onClose?.(); }, 250);
  }
</script>

{#if mounted}
  <div class="ly-fullscreen" class:mounted class:entered class:closing
    class:ly-no-blur={$responsive.isMobile}
    style={player.cover ? `--ly-cover: url(${player.cover})` : ''}
    role="presentation" onclick={handleClose}>

    <div class="ly-container" class:controls-hidden={!controlsVisible} role="presentation"
      onclick={(e) => { e.stopPropagation(); resetControls(); }}
      ontouchstart={() => resetControls()}
      onpointerdown={() => resetControls()}>
      
      <!-- Top bar (PC only) - now empty, queue button moved to controls -->
      <div class="ly-top-bar"></div>

      <button class="ly-back-btn" class:visible={controlsVisible} onclick={(e) => { handleClose(e); }} aria-label="关闭">
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
