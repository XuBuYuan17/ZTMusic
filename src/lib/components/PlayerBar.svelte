<script>
  import { player } from '../stores/player.svelte.js'
  import Spinner from './Spinner.svelte'
  let { onOpenSheet } = $props()

  function fmt(t) {
    if (!t || isNaN(t)) return '0:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  let clickTarget
  function handleClick(e) {
    if (e.target === clickTarget && player.id) onOpenSheet?.()
  }
  function handleMouseDown(e) { clickTarget = e.target }

  function onProgClick(e) {
    e.stopPropagation()
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    player.seek(pct * player.duration)
  }

  function onVolClick(e) {
    e.stopPropagation()
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    player.setVolume(pct)
  }
</script>

<div class="player-bar" onclick={handleClick} onmousedown={handleMouseDown}>
  <div class="track-info">
    {#if player.cover}
      <div class="cover-wrap" class:playing={player.playing} class:paused={!player.playing}>
        <img class="cover-img" src={player.cover + '?param=88y88'} alt="">
      </div>
    {:else}
      <div class="cover-wrap">
        <div class="cover-placeholder">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
      </div>
    {/if}
    <div class="track-text">
      <div class="track-title">{player.title || '未在播放'}</div>
      <div class="track-artist">{player.artist || ''}</div>
    </div>
  </div>

  <div class="controls">
    <div class="ctrl-btns">
      <button class="ctrl-btn" class:active={player.mode === 'shuffle'}
        onclick={(e) => { e.stopPropagation(); player.setMode(player.mode === 'shuffle' ? 'list' : 'shuffle') }}
        title="随机播放">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16,3 21,3 21,8"/>
          <line x1="4" y1="20" x2="21" y2="3"/>
          <polyline points="21,16 21,21 16,21"/>
          <line x1="15" y1="15" x2="21" y2="21"/>
          <line x1="4" y1="4" x2="9" y2="9"/>
        </svg>
      </button>
      <button class="ctrl-btn" onclick={(e) => { e.stopPropagation(); player.prev() }} title="上一首">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="19,20 9,12 19,4"/><line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="1.5"/></svg>
      </button>
      <button class="play-btn" onclick={(e) => { e.stopPropagation(); player.togglePlay() }}>
        {#if player.loading}
          <div style="display:flex;align-items:center;justify-content:center;width:14px;height:14px;">
            <Spinner size="sm" />
          </div>
        {:else if player.playing}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>
        {/if}
      </button>
      <button class="ctrl-btn" onclick={(e) => { e.stopPropagation(); player.next() }} title="下一首">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="1.5"/></svg>
      </button>
      <button class="ctrl-btn" class:active={player.mode === 'repeat'}
        onclick={(e) => { e.stopPropagation(); player.setMode(player.mode === 'repeat' ? 'list' : 'repeat') }}
        title="单曲循环">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="17,1 21,5 17,9"/>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <polyline points="7,23 3,19 7,15"/>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
      </button>
    </div>
    <div class="progress-row">
      <span class="prog-time">{fmt(player.currentTime)}</span>
      <button class="prog-bar" onclick={onProgClick} aria-label="进度">
        <div class="prog-fill" style="width:{player.duration ? (player.currentTime / player.duration * 100) : 0}%"></div>
        <div class="prog-thumb" style="left:{player.duration ? (player.currentTime / player.duration * 100) : 0}%"></div>
      </button>
      <span class="prog-time">{fmt(player.duration)}</span>
    </div>
  </div>

  <div class="extra">
    <button class="vol-btn" onclick={(e) => { e.stopPropagation(); player.setVolume(player.volume === 0 ? 0.8 : 0) }} title="静音">
      {#if player.volume === 0}
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
          <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      {:else if player.volume < 0.5}
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
      {/if}
    </button>
    <button class="vol-wrap" onclick={onVolClick} aria-label="音量">
      <div class="vol-fill" style="width:{player.volume * 100}%"></div>
      <div class="vol-thumb" style="left:{player.volume * 100}%"></div>
    </button>
  </div>
</div>
