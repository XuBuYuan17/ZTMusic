<script>
  let {
    volume = 0.8,
    disabled = false,
    onvolumechange,
  } = $props()

  let volPct = $derived(Math.max(0, Math.min(100, volume * 100)))
  let dragging = $state(false)
  let trackEl = $state(null)

  function clientXToPct(clientX) {
    if (!trackEl) return 0
    const rect = trackEl.getBoundingClientRect()
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
  }

  function setFromPct(pct) {
    onvolumechange?.(pct / 100)
  }

  function onPointerDown(e) {
    if (disabled) return
    e.preventDefault()
    dragging = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromPct(clientXToPct(e.clientX))
  }

  function onPointerMove(e) {
    if (!dragging) return
    setFromPct(clientXToPct(e.clientX))
  }

  function onPointerUp() {
    dragging = false
  }

  function onKeydown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 0.05 : -0.05
      onvolumechange?.(Math.max(0, Math.min(1, volume + step)))
    }
  }

  function toggleMute() {
    onvolumechange?.(volume === 0 ? 0.8 : 0)
  }
</script>

<div class="vs">
  <button class="vs-icon" onclick={toggleMute} aria-label={volume === 0 ? '取消静音' : '静音'} disabled={disabled}>
    {#if volume === 0}
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <line x1="23" y1="9" x2="17" y2="15"/>
        <line x1="17" y1="9" x2="23" y2="15"/>
      </svg>
    {:else if volume < 0.5}
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
    {/if}
  </button>
  <div
    class="vs-track"
    class:dragging
    role="slider"
    tabindex="0"
    aria-label="音量"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={Math.round(volPct)}
    bind:this={trackEl}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onkeydown={onKeydown}
  >
    <div class="vs-fill" style="width:{volPct}%"></div>
    <div class="vs-thumb" style="left:{volPct}%"></div>
  </div>
</div>

<style>
  .vs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .vs-icon {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0.2rem;
    display: flex;
    align-items: center;
    opacity: 0.7;
    transition: opacity 0.15s;
    flex-shrink: 0;
  }
  .vs-icon:hover:not(:disabled) {
    opacity: 1;
  }
  .vs-icon:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .vs-track {
    position: relative;
    height: 5px;
    min-width: 60px;
    background: var(--color-progress-bg, rgba(255,255,255,0.2));
    border-radius: 3px;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }
  .vs-track:focus-visible {
    box-shadow: 0 0 0 2px var(--color-accent, #ec4141);
  }
  .vs-track:hover .vs-thumb,
  .vs-track.dragging .vs-thumb {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
  .vs-track:hover,
  .vs-track.dragging {
    height: 7px;
  }
  .vs-fill {
    height: 100%;
    background: var(--color-accent, #ec4141);
    border-radius: 3px;
    transition: width 0.1s linear;
  }
  .vs-track.dragging .vs-fill {
    transition: none;
  }
  .vs-thumb {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    background: var(--color-accent, #ec4141);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 0.15s;
    pointer-events: none;
    box-shadow: 0 0 4px rgba(0,0,0,0.3);
  }
</style>
