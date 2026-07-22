<script>
  import { player } from '../stores/player.svelte.js';
  import { responsive } from '../utils/responsive.js';
  import AppleMusicPlayer from './AppleMusicPlayer.svelte';
  import PCPlayer from './PCPlayer.svelte';

  let { show = false, origin = null, onClose, onOpenArtist, onOpenAlbum, onOpenPlaylist, onToggleTheme } = $props();

  let showLocalQueue = $state(false);
  let lyricsMode = $state(false);
  let controlsVisible = $state(true);
  let mounted = $state(false);
  let entered = $state(false);
  let closing = $state(false);
  // ---- 定时器管理器 ----
  const timers = new Set();
  function safeTimeout(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }
  function clearSafeTimer(id) {
    clearTimeout(id);
    timers.delete(id);
  }

  let hideTimer = $state(null);

  function showControls() {
    controlsVisible = true;
    if (hideTimer) clearSafeTimer(hideTimer);
    hideTimer = safeTimeout(() => { controlsVisible = false; }, 4000);
  }

  function resetControls() {
    showControls();
  }

  // Auto-hide after entering
  $effect(() => {
    if (entered) {
      hideTimer = safeTimeout(() => { controlsVisible = false; }, 4000);
    }
    // 只清 hideTimer，避免误杀开/关动画 effect 的定时器
    return () => { if (hideTimer) clearSafeTimer(hideTimer) }
  });

  function toggleLocalQueue() {
    showLocalQueue = !showLocalQueue;
  }

  function toggleLyricsMode() {
    lyricsMode = !lyricsMode;
  }

  let _fullscreenEl = null

  // focus-trap：全屏打开时锁定焦点在内部
  $effect(() => {
    if (entered && _fullscreenEl) {
      const prev = document.activeElement
      const focusable = _fullscreenEl.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])')
      if (focusable) focusable.focus()
      return () => { if (prev && document.contains(prev)) prev.focus() }
    }
  })
    if (show) {
      mounted = true;
      closing = false;
      safeTimeout(() => { entered = true; }, 10);
    } else {
      entered = false;
      closing = true;
      safeTimeout(() => { mounted = false; closing = false; }, 250);
    }
  });

  function handleClose(e) {
    if (e.target.closest('.ly-keep-open')) return;
    closing = true;
    safeTimeout(() => { onClose?.(); }, 250);
  }
</script>

{#if mounted}
  <div class="ly-fullscreen" class:mounted class:entered class:closing
    bind:this={_fullscreenEl}
    class:ly-no-blur={$responsive.isMobile}
    style={`${player.cover ? `--ly-cover: url(${player.cover});` : ''} --ly-origin-x: ${origin?.x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0)}px; --ly-origin-y: ${origin?.y ?? (typeof window !== 'undefined' ? window.innerHeight : 0)}px;`}
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
          {onOpenAlbum}
          {onOpenPlaylist}
          {onToggleTheme}
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
