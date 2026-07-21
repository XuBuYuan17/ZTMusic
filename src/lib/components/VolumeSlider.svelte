<script>
  import Icon from './ui/Icon.svelte'

  let {
    volume = 0.8,
    disabled = false,
    variant = 'default',
    onvolumechange,
  } = $props()

  let volPct = $derived(Math.max(0, Math.min(100, volume * 100)))
  let isAppleMusic = $derived(variant === 'apple-music')
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
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
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

<div class="vs" class:apple-music={isAppleMusic}>
  <button class="vs-icon" onclick={toggleMute} aria-label={volume === 0 ? '取消静音' : '静音'} disabled={disabled}>
    {#if volume === 0}
      <Icon name="volume-off" size={isAppleMusic ? 21 : 19} strokeWidth={2.5} />
    {:else if volume < 0.5}
      <Icon name="volume" size={isAppleMusic ? 21 : 19} strokeWidth={2.5} />
    {:else}
      <Icon name="volume-full" size={isAppleMusic ? 21 : 19} strokeWidth={2.5} />
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
    transition: opacity var(--dur-fast);
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
    box-shadow: 0 0 0 2px var(--accent);
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
    background: var(--accent);
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
    background: var(--accent);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity var(--dur-fast);
    pointer-events: none;
    box-shadow: 0 0 4px rgba(0,0,0,0.3);
  }

  .vs.apple-music {
    width: min(100%, 300px);
    gap: 10px;
    color: rgba(255, 255, 255, 0.78);
  }
  .vs.apple-music .vs-icon {
    opacity: 0.9;
    color: rgba(255, 255, 255, 0.86);
    padding: 0;
  }
  .vs.apple-music .vs-track {
    flex: 1;
    height: 8px;
    min-width: 0;
    background: rgba(255, 255, 255, 0.24);
    border-radius: 999px;
    overflow: hidden;
  }
  .vs.apple-music .vs-track:hover,
  .vs.apple-music .vs-track.dragging {
    height: 8px;
  }
  .vs.apple-music .vs-fill {
    background: #fff;
    border-radius: inherit;
  }
  .vs.apple-music .vs-thumb {
    width: 18px;
    height: 18px;
    background: #fff;
    transform: translate(-50%, -50%) scale(0.62);
    transition: all var(--dur-base) var(--ease-spring);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  .vs.apple-music .vs-track:hover .vs-thumb,
  .vs.apple-music .vs-track.dragging .vs-thumb,
  .vs.apple-music .vs-track:focus-visible .vs-thumb {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
</style>
