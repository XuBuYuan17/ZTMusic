<script>
  import { player } from '../stores/player.svelte.js'
  import { getCachedLyrics, loadLyrics } from '../services/lyrics-loader.js'
  import { coverUrl } from '../utils/image.js'
  import { hapticTap } from '../utils/haptics.js'
  import ArtistNames from './ArtistNames.svelte'
  import Spinner from './Spinner.svelte'
  import Icon from './ui/Icon.svelte'
  let { onOpenSheet, onToggleQueue, showQueuePanel = false, onOpenArtist } = $props()

  let showVolume = $state(false)
  let isPressing = $state(false)
  let barLyrics = $state([])
  let lyricTrackId = $state(null)
  let lyricLoading = $state(false)
  let currentLyric = $state(null)
  let gestureStart = null
  let swipeDirection = $state('')
  let swipeTimer = null
  let lyricRequestId = 0
  let _lyricRequestedId = null

  function fmt(t) {
    if (!t || isNaN(t)) return '0:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function openLyricsFromBar(e) {
    if (!player.id) return
    const barEl = e.currentTarget?.closest?.('.player-bar') || e.currentTarget || e.target?.closest?.('.player-bar')
    const originEl = barEl?.querySelector?.('.lcd-artwork__img') || barEl
    if (originEl) onOpenSheet?.(originEl)
  }

  // 组件销毁时清理定时器
  $effect(() => () => {
    if (swipeTimer) clearTimeout(swipeTimer)
  })

  function handleBarPointerDown(e) {
    if (e.pointerType !== 'mouse') hapticTap()
    if (e.target.closest('.ctrl-btn, .action-btn, .volume-slider-inline')) return
    isPressing = true
    gestureStart = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
    try { e.currentTarget?.setPointerCapture?.(e.pointerId) } catch {}
  }

  function handleBarPointerUp(e) {
    if (!gestureStart || gestureStart.pointerId !== e.pointerId) return
    const dx = e.clientX - gestureStart.x
    const dy = e.clientY - gestureStart.y
    gestureStart = null
    isPressing = false

    if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      e.preventDefault()
      e.stopPropagation()
      playSwipeAnimation(dx < 0 ? 'next' : 'prev')
      if (dx < 0) player.next()
      else player.prev()
      return
    }

    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      openLyricsFromBar(e)
    }
  }

  function handleBarPointerCancel() {
    gestureStart = null
    isPressing = false
  }

  // ---- 定时器管理器 ----
  const timers = new Set()
  function safeTimeout(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  $effect(() => () => timers.forEach(id => clearTimeout(id)))

  function playSwipeAnimation(direction) {
    swipeDirection = ''
    clearTimeout(swipeTimer)
    timers.delete(swipeTimer)
    requestAnimationFrame(() => {
      swipeDirection = direction
      swipeTimer = safeTimeout(() => { swipeDirection = '' }, 360)
    })
  }

  function onVolBarClick(e) {
    e.stopPropagation()
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    player.setVolume(pct)
  }

  function toggleMute(e) {
    e.stopPropagation()
    player.setVolume(player.volume === 0 ? 0.8 : 0)
  }

  function toggleVolume() {
    showVolume = !showVolume
  }

  function handleVolumeBarDrag(e) {
    e.stopPropagation()
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    player.setVolume(1 - pct)
  }


  $effect(() => {
    const id = player.id
    const isLocal = player.currentTrack?.source === 'local'
    if (!id || isLocal) {
      barLyrics = []
      lyricTrackId = null
      currentLyric = null
      lyricLoading = false
      _lyricRequestedId = isLocal ? id : null
      return
    }

    // 注意：不能在这里读 lyricTrackId 做短路判断 —— effect 会追踪 lyricTrackId，
    // 导致设置 lyricTrackId = id 后 effect 重入，直接 return，歌词请求永远发不出去。
    // 改用局部变量记录已请求的 id，避免依赖自身状态。
    if (_lyricRequestedId === id) return
    _lyricRequestedId = id

    lyricTrackId = id
    barLyrics = getCachedLyrics(id) || []
    currentLyric = null
    lyricLoading = barLyrics.length === 0
    const requestId = ++lyricRequestId

    ;(async () => {
      try {
        const lines = await loadLyrics(id)
        if (requestId !== lyricRequestId) return
        barLyrics = lines
      } catch (err) {
        if (requestId === lyricRequestId) barLyrics = []
      } finally {
        if (requestId === lyricRequestId) lyricLoading = false
      }
    })()
  })

  $effect(() => {
    const now = player.currentTime
    if (!barLyrics.length) {
      currentLyric = null
      return
    }

    let idx = -1
    for (let i = barLyrics.length - 1; i >= 0; i--) {
      if (now >= barLyrics[i].time) {
        idx = i
        break
      }
    }

    currentLyric = idx >= 0 ? barLyrics[idx] : null
  })

  let showLyric = $derived(Boolean(player.playing && !player.loading && currentLyric?.text))
  let compactMode = $derived(Boolean(!player.id || player.loading || !player.playing || !showLyric))
  let currentTrack = $derived(player.currentTrack || player.queue?.find(track => track?.id === player.id) || player.queue?.[player.queueIndex])
  let currentArtists = $derived(currentTrack?.ar || currentTrack?.artists || [])
  let artistNavigation = $derived(currentTrack?.source === 'local' ? undefined : onOpenArtist)

  function handleBarKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openLyricsFromBar(e)
    }
  }
  function handleVolumeToggleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      toggleVolume()
    }
  }
  function handleVolumeTrackKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      onVolBarClick(e)
    }
  }

  // 点击外部关闭音量面板
  function handleOutsideClick(e) {
    if (showVolume && !e.target.closest('.player-bar__actions')) {
      showVolume = false
    }
  }

  // (paths moved to Icon component)
</script>

<div
  class="player-bar"
  class:pressing={isPressing}
  class:playing={player.playing && !player.loading}
  class:compact={compactMode}
  class:with-lyrics={showLyric}
  onpointerdown={handleBarPointerDown}
  onpointerup={handleBarPointerUp}
  onpointercancel={handleBarPointerCancel}
  role="group"
  style="cursor: pointer;"
>
  <button type="button" class="player-bar__open-hit" onclick={(e) => e.stopPropagation()} aria-label="打开歌词页"></button>
  <!-- 左侧：歌曲信息 / 当前歌词 (LCD区域) -->
  <div class="player-bar__lcd" class:swipe-next={swipeDirection === 'next'} class:swipe-prev={swipeDirection === 'prev'} aria-hidden="true">
    {#if player.cover}
      <div class="lcd-artwork">
        <img class="lcd-artwork__img" src={coverUrl(player.cover, 88)} alt="" referrerpolicy="no-referrer">
      </div>
    {:else}
      <div class="lcd-artwork lcd-artwork--empty">
        <Icon name="music" size={20} strokeWidth={1.8} />
      </div>
    {/if}
    <div class="lcd-meta" class:show-lyric={showLyric}>
      {#if showLyric}
        {#key `${currentLyric.time}-${currentLyric.text}`}
          <div class="lcd-meta__lyric-group">
            <div class="lcd-meta__lyric">{currentLyric.text}</div>
            {#if currentLyric.translation && currentLyric.translation !== currentLyric.text}
              <div class="lcd-meta__translation">{currentLyric.translation}</div>
            {/if}
          </div>
        {/key}
      {:else}
        <div class="lcd-meta__title">{player.title || '未在播放'}</div>
        {#if player.error}
          <div class="lcd-meta__artist">{player.error}</div>
        {:else if player.artist && !player.loading && !lyricLoading}
          <div class="lcd-meta__artist"><ArtistNames artists={currentArtists} onOpenArtist={artistNavigation} fallback={player.artist} /></div>
        {:else}
          <div class="lcd-meta__artist">{player.loading ? '正在载入…' : lyricLoading ? '正在同步歌词…' : player.artist || ''}</div>
        {/if}
      {/if}
    </div>
  </div>

  <!-- 中间：播放控制 + 进度条 -->
  <div class="player-bar__controls">
    <div class="playback-controls">
      <button class="ctrl-btn ctrl-btn--shuffle" class:active={player.mode === 'shuffle'}
        onclick={(e) => { e.stopPropagation(); player.setMode(player.mode === 'shuffle' ? 'list' : 'shuffle') }}
        aria-label="随机播放">
        <Icon name="shuffle-lg" size={24} fill="currentColor" />
      </button>
      <button class="ctrl-btn ctrl-btn--prev" onclick={(e) => { e.stopPropagation(); player.prev() }} aria-label="上一首">
        <Icon name="prev" size={24} fill="currentColor" />
      </button>
      <button class="ctrl-btn ctrl-btn--play" onclick={(e) => { e.stopPropagation(); player.togglePlay() }} aria-label={player.playing ? '暂停' : '播放'}>
        {#if player.loading}
          <div class="ctrl-btn__spinner">
            <Spinner size="sm" />
          </div>
        {:else if player.playing}
          <Icon name="pause" size={26} fill="currentColor" />
        {:else}
          <Icon name="play" size={26} fill="currentColor" />
        {/if}
      </button>
      <button class="ctrl-btn ctrl-btn--next" onclick={(e) => { e.stopPropagation(); player.next() }} aria-label="下一首">
        <Icon name="next" size={24} fill="currentColor" />
      </button>
      <button class="ctrl-btn ctrl-btn--repeat" class:active={player.mode === 'repeat'}
        onclick={(e) => { e.stopPropagation(); player.setMode(player.mode === 'repeat' ? 'list' : 'repeat') }}
        aria-label="单曲循环">
        <Icon name="repeat" size={24} strokeWidth={2.2} />
      </button>
    </div>
  </div>

  <!-- 右侧：音量 + 列表 -->
  <div class="player-bar__actions">
    <!-- 音量：未点击时只显示图标，点击后展开小 bar -->
    <div class="volume-slider-inline" class:open={showVolume} role="button" tabindex="0" aria-label="音量" onclick={(e) => { e.stopPropagation(); toggleVolume() }} onkeydown={handleVolumeToggleKeyDown}>
      <div class="volume-slider-inline__bar">
        <div class="volume-slider-inline__icon">
          {#if player.volume > 0}
            <Icon name="volume-full" size={19} strokeWidth={3} />
          {:else}
            <Icon name="volume-off" size={19} strokeWidth={3} />
          {/if}
        </div>
        {#if showVolume}
          <div class="volume-slider-inline__track" role="slider" aria-valuenow={player.volume * 100} aria-valuemin="0" aria-valuemax="100" tabindex="0" onclick={onVolBarClick} onkeydown={handleVolumeTrackKeyDown}>
            <div class="volume-slider-inline__fill" style="width:{(player.volume * 100)}%"></div>
            <div class="volume-slider-inline__thumb" style="left:{(player.volume * 100)}%"></div>
          </div>
        {/if}
      </div>
    </div>

    <button class="action-btn action-btn--queue" class:active={showQueuePanel} onclick={(e) => { e.stopPropagation(); onToggleQueue?.() }} aria-label="播放列表">
      <Icon name="list" size={24} strokeWidth={2.2} />
    </button>
    <button class="action-btn action-btn--mobile-next" onclick={(e) => { e.stopPropagation(); player.next() }} aria-label="下一首">
      <Icon name="next" size={22} fill="currentColor" />
    </button>
  </div>

</div>
