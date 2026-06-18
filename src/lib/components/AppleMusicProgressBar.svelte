<script>
  let { currentTime = 0, duration = 0, disabled = false, onseek } = $props();

  let progressBar = $state(null);
  let isDragging = $state(false);

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function handleSeek(e) {
    if (disabled) return;
    const rect = progressBar.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onseek?.(percent * duration);
  }

  function handleMouseDown(e) {
    isDragging = true;
    handleSeek(e);
    document.addEventListener('mousemove', handleSeek);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', handleSeek);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  function handleTouchStart(e) {
    isDragging = true;
    handleSeek(e);
  }

  function handleTouchMove(e) {
    if (isDragging) {
      handleSeek(e);
    }
  }

  function handleTouchEnd() {
    isDragging = false;
  }
</script>

<div class="am-progress-container">
  <div 
    class="am-progress-bar" 
    bind:this={progressBar}
    onmousedown={handleMouseDown}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
  >
    <div class="am-progress-track">
      <div class="am-progress-fill" style={`width: ${duration ? (currentTime / duration * 100) : 0}%`}></div>
    </div>
    <div class="am-progress-thumb" style={`left: ${duration ? (currentTime / duration * 100) : 0}%`}></div>
  </div>
  
  <div class="am-progress-time">
    <span class="am-time-current">{formatTime(currentTime)}</span>
    <span class="am-time-duration">{formatTime(duration)}</span>
  </div>
</div>

<style>
  .am-progress-container {
    width: 100%;
    padding: 8px 0;
  }

  .am-progress-bar {
    position: relative;
    height: 8px;
    cursor: pointer;
    touch-action: none;
    padding: 4px 0;
  }

  .am-progress-track {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    transform: translateY(-50%);
    overflow: hidden;
  }

  .am-progress-fill {
    height: 100%;
    background: #fff;
    border-radius: 2px;
    transition: width 0.1s linear;
  }

  .am-progress-thumb {
    position: absolute;
    top: 50%;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0.6);
    opacity: 0;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .am-progress-bar:hover .am-progress-thumb,
  .am-progress-bar:active .am-progress-thumb {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  .am-progress-bar:hover .am-progress-fill {
    background: #fa243c;
  }

  .am-progress-bar:active .am-progress-fill {
    background: #fa243c;
  }

  .am-progress-time {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
  }
</style>
