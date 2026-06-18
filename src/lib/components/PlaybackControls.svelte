<script>
  import Spinner from './Spinner.svelte'

  let {
    /** 'compact' (PlayerBar) | 'lyrics' (LyricsPage with large circular buttons) */
    variant = 'compact',
    size = 'md',
    mode = 'list',
    playing = false,
    loading = false,
    disabled = false,
    onshuffle,
    onprev,
    onplaypause,
    onnext,
    onrepeat,
    onqueue,
    showQueue = false,
  } = $props()

  let sz = $derived(size === 'lg' ? 26 : size === 'sm' ? 22 : 24)
  let gap = $derived(size === 'lg' ? '1rem' : '0.5rem')

  let isLyrics = $derived(variant === 'lyrics')
  let btnClass = $derived(isLyrics ? 'ly-ctrl-btn' : 'pc-btn')
  let playClass = $derived(isLyrics ? 'ly-play-btn' : 'pc-btn pc-btn--play')

  // Mode cycle: list -> repeat -> shuffle -> list
  const modeLabels = {
    list: '顺序播放',
    repeat: '单曲循环',
    shuffle: '随机播放'
  }

  function cycleMode() {
    let nextMode = mode
    if (mode === 'list') nextMode = 'repeat'
    else if (mode === 'repeat') nextMode = 'shuffle'
    else nextMode = 'list'

    // Trigger appropriate callback
    if (nextMode === 'repeat') {
      onrepeat?.()
    } else if (nextMode === 'shuffle') {
      onshuffle?.()
    } else {
      // Go back to list mode - turn off both
      if (mode === 'repeat') onrepeat?.()
      else if (mode === 'shuffle') onshuffle?.()
    }

    // Show toast notification
    showToast(modeLabels[nextMode])
  }

  function showToast(text) {
    // Remove existing toast
    const existing = document.querySelector('.play-mode-toast')
    if (existing) existing.remove()

    const toast = document.createElement('div')
    toast.className = 'play-mode-toast'
    toast.textContent = text
    toast.style.cssText = `
      position: fixed;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 10px 20px;
      border-radius: 22px;
      font-size: 14px;
      font-weight: 500;
      z-index: 9999;
      animation: modeToastFadeIn 0.2s ease-out;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `
    document.body.appendChild(toast)

    setTimeout(() => {
      toast.style.animation = 'modeToastFadeOut 0.3s ease-out forwards'
      setTimeout(() => toast.remove(), 300)
    }, 1500)
  }

  // Add toast keyframes if not present
  function ensureKeyframes() {
    if (typeof document === 'undefined') return
    if (document.getElementById('play-mode-toast-styles')) return
    const style = document.createElement('style')
    style.id = 'play-mode-toast-styles'
    style.textContent = `
      @keyframes modeToastFadeIn {
        from { opacity: 0; transform: translateX(-50%) translateY(10px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      @keyframes modeToastFadeOut {
        from { opacity: 1; transform: translateX(-50%) translateY(0); }
        to { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      }
    `
    document.head.appendChild(style)
  }
  if (typeof document !== 'undefined') ensureKeyframes()
</script>

<div class="pc" class:ly-play-row={isLyrics} class:pc-disabled={disabled} style:gap={isLyrics ? undefined : gap}>
  <!-- 播放模式循环按钮: list → repeat → shuffle → list -->
  <button class={btnClass} class:active={mode === 'repeat' || mode === 'shuffle'}
    onclick={cycleMode} aria-label={modeLabels[mode]}
    disabled={isLyrics ? false : disabled}>
    {#if mode === 'shuffle'}
      <svg viewBox="0 0 640 640" width={sz} height={sz} fill="currentColor">
        <path d="M467.8 98.4c12-5 25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64c-9.2 9.2-22.9 11.9-34.9 6.9S448 268.9 448 256v-32h-32c-10.1 0-19.6 4.7-25.6 12.8L358 280l-40-53.3l21.2-28.3c18.1-24.2 46.6-38.4 76.8-38.4h32v-32c0-12.9 7.8-24.6 19.8-29.6M218 360l40 53.3l-21.2 28.3C218.7 465.8 190.2 480 160 480H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h64c10.1 0 19.6-4.7 25.6-12.8zm284.6 174.6c-9.2 9.2-22.9 11.9-34.9 6.9S448 524.9 448 512v-32h-32c-30.2 0-58.7-14.2-76.8-38.4L185.6 236.8c-6-8.1-15.5-12.8-25.6-12.8H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h64c30.2 0 58.7 14.2 76.8 38.4l153.6 204.8c6 8.1 15.5 12.8 25.6 12.8h32v-32c0-12.9 7.8-24.6 19.8-29.6s25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64z"/>
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" width={sz} height={sz} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 12V9a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3m3 3v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3"/>
      </svg>
    {/if}
  </button>

  <!-- 上一首 -->
  <button class={btnClass} onclick={() => onprev?.()} aria-label="上一首" disabled={isLyrics ? false : disabled}>
    <svg viewBox="0 0 24 24" width={sz} height={sz} fill="currentColor">
      <path d="M2.5 9.402c-2 1.155-2 4.041 0 5.196l9 5.196c1.515.875 3.317.259 4.102-1.096l1.898 1.096c2 1.155 4.5-.288 4.5-2.598V6.804c0-2.31-2.5-3.753-4.5-2.598l-1.898 1.096c-.785-1.355-2.587-1.971-4.102-1.096zM16 7.382v9.237l2.5 1.443a1 1 0 0 0 1.5-.866V6.804a1 1 0 0 0-1.5-.866z" fill-rule="evenodd" clip-rule="evenodd"/>
    </svg>
  </button>

  <!-- 播放/暂停 -->
  <button class={playClass} onclick={() => onplaypause?.()} aria-label={playing ? '暂停' : '播放'} disabled={isLyrics ? false : disabled}>
    {#if loading}
      <Spinner size={isLyrics ? 'md' : (size === 'lg' ? 'md' : 'sm')} />
    {:else if playing}
      <svg viewBox="0 0 24 24" width={isLyrics ? 28 : (size === 'lg' ? 28 : 24)} height={isLyrics ? 28 : (size === 'lg' ? 28 : 24)} fill="currentColor">
        <path d="M9 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m8 0h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/>
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" width={isLyrics ? 28 : (size === 'lg' ? 28 : 24)} height={isLyrics ? 28 : (size === 'lg' ? 28 : 24)} fill="currentColor">
        <path d="M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z" fill-rule="evenodd" clip-rule="evenodd"/>
      </svg>
    {/if}
  </button>

  <!-- 下一首 -->
  <button class={btnClass} onclick={() => onnext?.()} aria-label="下一首" disabled={isLyrics ? false : disabled}>
    <svg viewBox="0 0 24 24" width={sz} height={sz} fill="currentColor">
      <path d="M5.5 5.938a1 1 0 0 0-1.5.866v10.392a1 1 0 0 0 1.5.866L8 16.62V7.38zm2.898-.636L6.5 4.206l-.5.866l.5-.866C4.5 3.05 2 4.494 2 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598l1.898-1.096c.785 1.355 2.587 1.971 4.102 1.096l9-5.196c2-1.155 2-4.041 0-5.196l-9-5.196c-1.515-.875-3.317-.259-4.102 1.096" fill-rule="evenodd" clip-rule="evenodd"/>
    </svg>
  </button>

  <!-- 播放列表 - 歌词模式下在PC端显示，移动端在下方操作按钮组显示 -->
  <!-- 播放列表按钮 - 总是显示 -->
  <button class={btnClass} class:active={showQueue} class:ly-queue-btn={true} onclick={() => { console.log('queue button clicked, onqueue:', onqueue); onqueue?.(); }} aria-label="播放列表" style="display: flex !important; visibility: visible; opacity: 1; color: white;">
    <svg viewBox="0 0 24 24" width={sz} height={sz} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
      <path stroke-linecap="round" d="M4 5h16M4 11h16M4 17h10"/>
      <path fill="currentColor" d="m4 12l4 3l-4 3z"/>
    </svg>
  </button>

</div>

<style>
  .pc {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pc-btn {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.8;
    transition: opacity 0.15s, transform 0.15s;
  }
  .pc-btn:hover:not(:disabled) { opacity: 1; transform: scale(1.1); }
  .pc-btn:active:not(:disabled) { transform: scale(0.95); }
  .pc-btn:disabled { opacity: 0.35; cursor: default; }
  .pc-btn.active { opacity: 1; color: var(--color-accent, #ec4141); }
  .pc-btn--play { padding: 0.3rem; }
  /* lyrics variant: disabled is visual only, never blocks clicks */
  .pc-disabled .pc-btn,
  .pc-disabled .ly-ctrl-btn,
  .pc-disabled .ly-play-btn {
    opacity: 0.38;
    cursor: default;
  }
  .pc-disabled .ly-ctrl-btn:hover,
  .pc-disabled .ly-play-btn:hover {
    color: rgba(255,255,255,0.5);
    background: none;
  }
</style>
