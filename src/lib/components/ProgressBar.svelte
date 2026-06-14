<script>
  let {
    currentTime = 0,
    duration = 0,
    disabled = false,
    onseek,
  } = $props()

  let progressPct = $derived(duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0)
  let dragging = $state(false)
  let dragPct = $state(0)
  let trackEl = $state(null)

  function fmt(sec) {
    if (!sec || isNaN(sec)) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function fmtRemaining(sec) {
    if (!sec || isNaN(sec)) return '0:00'
    const remaining = Math.max(0, duration - currentTime)
    const m = Math.floor(remaining / 60)
    const s = Math.floor(remaining % 60)
    return `-${m}:${s.toString().padStart(2, '0')}`
  }

  function clientXToPct(clientX) {
    if (!trackEl) return 0
    const rect = trackEl.getBoundingClientRect()
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
  }

  function seekFromPct(pct) {
    if (!duration) return
    onseek?.((pct / 100) * duration)
  }

  function onPointerDown(e) {
    if (!duration || disabled) return
    e.preventDefault()
    dragging = true
    e.currentTarget.setPointerCapture(e.pointerId)
    const pct = clientXToPct(e.clientX)
    dragPct = pct
    seekFromPct(pct)
  }

  function onPointerMove(e) {
    if (!dragging) return
    const pct = clientXToPct(e.clientX)
    dragPct = pct
    seekFromPct(pct)
  }

  function onPointerUp() {
    dragging = false
  }

  function onKeydown(e) {
    if (!duration) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 5 : -5
      onseek?.(Math.max(0, Math.min(duration, currentTime + step)))
    }
  }
</script>

<div class="pb">
  <div
    class="pb-track"
    class:dragging
    role="slider"
    tabindex="0"
    aria-label="播放进度"
    aria-valuemin="0"
    aria-valuemax={Math.floor(duration || 0)}
    aria-valuenow={Math.floor(currentTime || 0)}
    aria-disabled={!duration || disabled}
    bind:this={trackEl}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onkeydown={onKeydown}
  >
    <div class="pb-fill" style="width:{dragging ? dragPct : progressPct}%"></div>
    {#if (dragging ? dragPct : progressPct) > 0}
      <div class="pb-thumb" style="left:{dragging ? dragPct : progressPct}%"></div>
    {/if}
  </div>
  <div class="pb-times">
    <span class="pb-time">{fmt(dragging ? (dragPct / 100) * duration : currentTime)}</span>
    <span class="pb-time">{fmtRemaining(duration)}</span>
  </div>
</div>

<style>
  .pb {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .pb-track {
    position: relative;
    height: 5px;
    background: var(--color-progress-bg, rgba(255,255,255,0.2));
    border-radius: 3px;
    cursor: pointer;
    touch-action: none;
    outline: none;
  }
  .pb-track:focus-visible {
    box-shadow: 0 0 0 2px var(--color-accent, #ec4141);
  }
  .pb-track:hover .pb-thumb,
  .pb-track.dragging .pb-thumb {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  .pb-track:hover,
  .pb-track.dragging {
    height: 7px;
  }
  .pb-fill {
    height: 100%;
    background: var(--color-accent, #ec4141);
    border-radius: 3px;
    transition: width 0.1s linear;
  }
  .pb-track.dragging .pb-fill {
    transition: none;
  }
  .pb-thumb {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    background: var(--color-accent, #ec4141);
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
    transition: opacity 0.15s, transform 0.15s;
    pointer-events: none;
    box-shadow: 0 0 4px rgba(0,0,0,0.3);
  }
  .pb-times {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    opacity: 0.6;
  }
  .pb-time {
    font-variant-numeric: tabular-nums;
  }
</style>
