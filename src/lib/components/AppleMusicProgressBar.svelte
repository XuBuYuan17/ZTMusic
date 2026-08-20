<script>
  let { currentTime = 0, duration = 0, disabled = false, onseek } = $props();

  let progressBar = $state(null);
  let isDragging = $state(false);
  let dragPercent = $state(0);
  let pendingSeek = null;
  let seekFrame = null;
  let displayPercent = $derived(isDragging ? dragPercent : duration ? Math.max(0, Math.min(100, currentTime / duration * 100)) : 0);

  $effect(() => () => {
    if (seekFrame) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(seekFrame);
      else clearTimeout(seekFrame);
    }
  });

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function clientXToPercent(clientX) {
    if (!progressBar) return 0;
    const rect = progressBar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function scheduleSeek(percent) {
    pendingSeek = percent * duration;
    if (seekFrame) return;
    const frame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 16);
    seekFrame = frame(() => {
      seekFrame = null;
      if (pendingSeek !== null) onseek?.(pendingSeek);
    });
  }

  function flushSeek() {
    if (seekFrame) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(seekFrame);
      else clearTimeout(seekFrame);
      seekFrame = null;
    }
    if (pendingSeek !== null) {
      onseek?.(pendingSeek);
      pendingSeek = null;
    }
  }

  function handlePointerDown(e) {
    if (disabled || !duration) return;
    e.preventDefault();
    isDragging = true;
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    const percent = clientXToPercent(e.clientX);
    dragPercent = percent * 100;
    scheduleSeek(percent);
  }

  function handlePointerMove(e) {
    if (!isDragging) return;
    const percent = clientXToPercent(e.clientX);
    dragPercent = percent * 100;
    scheduleSeek(percent);
  }

  function handlePointerUp() {
    flushSeek();
    isDragging = false;
  }
</script>

<div class="am-progress-container">
  <div
    class="am-progress-bar"
    bind:this={progressBar}
    role="slider"
    aria-label="播放进度"
    aria-valuemin="0"
    aria-valuemax={Math.round(duration || 0)}
    aria-valuenow={Math.round(currentTime || 0)}
    tabindex={disabled ? -1 : 0}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
  >
    <div class="am-progress-track">
      <div class="am-progress-fill" style={`width: ${displayPercent}%`}></div>
    </div>
    <div class="am-progress-thumb" style={`left: ${displayPercent}%`}></div>
  </div>

  <div class="am-progress-time">
    <span class="am-time-current">{formatTime(currentTime)}</span>
    <span class="am-time-duration">{formatTime(duration)}</span>
  </div>
</div>

<style>
  .am-progress-container {
    width: min(100%, 300px);
    margin: 0 auto;
    padding: 4px 0;
  }

  .am-progress-bar {
    position: relative;
    height: 18px;
    cursor: pointer;
    touch-action: none;
    padding: 6px 0;
    outline: none;
  }

  .am-progress-bar:focus-visible {
    border-radius: 999px;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
  }

  .am-progress-track {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 8px;
    background: rgba(255, 255, 255, 0.24);
    border-radius: 999px;
    transform: translateY(-50%);
    overflow: hidden;
  }

  .am-progress-fill {
    height: 100%;
    background: #fff;
    border-radius: inherit;
    transition: width 0.1s linear;
  }

  .am-progress-thumb {
    position: absolute;
    top: 50%;
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0.62);
    opacity: 0;
    transition: all var(--dur-base) var(--ease-spring);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .am-progress-bar:hover .am-progress-thumb,
  .am-progress-bar:active .am-progress-thumb,
  .am-progress-bar:focus-visible .am-progress-thumb {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  .am-progress-bar:active .am-progress-fill {
    background: #fff;
  }

  .am-progress-time {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    color: rgba(255, 255, 255, 0.72);
  }
</style>
