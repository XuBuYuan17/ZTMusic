<script>
  import { ncm } from '../api/client.js'
  import { player } from '../stores/player.svelte.js'
  import { coverUrl } from '../utils/image.js'
  import { parseLyricResponse } from '../utils/lyrics.js'
  import Spinner from './Spinner.svelte'
  let { onOpenSheet, onToggleQueue, showQueuePanel = false } = $props()

  let showVolume = $state(false)
  let isPressing = $state(false)
  let barLyrics = $state([])
  let lyricTrackId = $state(null)
  let lyricLoading = $state(false)
  let currentLyric = $state(null)

  function fmt(t) {
    if (!t || isNaN(t)) return '0:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  let clickTarget
  let suppressClick = $state(false)
  function handleClick(e) {
    if (suppressClick) { suppressClick = false; return }
    if (e.target === clickTarget && player.id) {
      isPressing = true
      
      setTimeout(() => {
        isPressing = false
        onOpenSheet?.()
      }, 150)
    }
  }
  function handleMouseDown(e) { clickTarget = e.target }
  function blockPlayerBarClick() { suppressClick = true }

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

  function normalizeLyricLine(line) {
    const text = line?.content?.trim() || line?.translation?.trim() || line?.roman?.trim() || ''
    const translation = line?.translation?.trim() || ''
    return { time: line.time, text, translation }
  }

  $effect(() => {
    const id = player.id
    if (!id) {
      barLyrics = []
      lyricTrackId = null
      currentLyric = null
      lyricLoading = false
      return
    }

    if (lyricTrackId === id) return

    lyricTrackId = id
    barLyrics = []
    currentLyric = null
    lyricLoading = true

    ;(async () => {
      try {
        const res = await ncm.lyric(id)
        if (player.id !== id) return
        barLyrics = parseLyricResponse(res)
          .map(normalizeLyricLine)
          .filter((line) => line.text)
      } catch (err) {
        if (player.id === id) barLyrics = []
      } finally {
        if (player.id === id) lyricLoading = false
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

  function handleBarKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick(e)
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

  // Iconamoon / Tabler fill-style SVG paths (viewBox 0 0 24 24)
  const playPath = 'M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z'
  const pausePath = 'M9 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m8 0h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2'
  const prevPath = 'M2.5 9.402c-2 1.155-2 4.041 0 5.196l9 5.196c1.515.875 3.317.259 4.102-1.096l1.898 1.096c2 1.155 4.5-.288 4.5-2.598V6.804c0-2.31-2.5-3.753-4.5-2.598l-1.898 1.096c-.785-1.355-2.587-1.971-4.102-1.096zM16 7.382v9.237l2.5 1.443a1 1 0 0 0 1.5-.866V6.804a1 1 0 0 0-1.5-.866z'
  const nextPath = 'M5.5 5.938a1 1 0 0 0-1.5.866v10.392a1 1 0 0 0 1.5.866L8 16.62V7.38zm2.898-.636L6.5 4.206l-.5.866l.5-.866C4.5 3.05 2 4.494 2 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598l1.898-1.096c.785 1.355 2.587 1.971 4.102 1.096l9-5.196c2-1.155 2-4.041 0-5.196l-9-5.196c-1.515-.875-3.317-.259-4.102 1.096'
</script>

<div
  class="player-bar"
  class:pressing={isPressing}
  class:compact={compactMode}
  class:with-lyrics={showLyric}
  role="button"
  tabindex="0"
  onclick={handleClick}
  onmousedown={handleMouseDown}
  onkeydown={handleBarKeyDown}
  aria-label="打开歌词页"
  style="cursor: pointer;"
>
  <!-- 左侧：歌曲信息 / 当前歌词 (LCD区域) -->
  <div class="player-bar__lcd">
    {#if player.cover}
      <div class="lcd-artwork">
        <img class="lcd-artwork__img" src={coverUrl(player.cover, 88)} alt="">
      </div>
    {:else}
      <div class="lcd-artwork lcd-artwork--empty">
        <svg viewBox="0 0 20 24" width="20" height="20" fill="currentColor">
          <path fill-rule="nonzero" d="M14.5498331,5.79055576 L14.8667346,5.79824073 C15.6519271,5.85753895 17.9167852,6.09354452 19.3663083,8.18658259 C19.2454992,8.2761902 16.6786385,9.72115188 16.7091378,12.7589876 C16.7390911,16.3870553 19.9696682,17.5970079 20,17.6265086 C19.9696682,17.7155832 19.487499,19.3381578 18.3096405,21.0185738 C17.2829229,22.4941235 16.2256873,23.9394547 14.5345925,23.9689736 C12.9038728,23.9984743 12.3599697,23.0246181 10.4887983,23.0246181 C8.61624942,23.0246181 8.01243658,23.9394547 6.47193668,23.9984743 C4.84148068,24.056773 3.60409403,22.4336653 2.57735781,20.9595512 C0.463094554,17.9799264 -1.13731196,12.5531248 1.03685791,8.89465382 C2.09390733,7.06587112 4.02671959,5.91602544 6.10974825,5.88615523 C7.71015477,5.85753895 9.18984525,6.91939744 10.1566562,6.91939744 C11.1229398,6.91939744 12.8433271,5.68057112 14.8667346,5.79824073 Z M14.882569,-1.50990331e-14 C15.034318,1.42063421 14.4589476,2.81085604 13.6110595,3.84623659 C12.7325883,4.85257077 11.3405768,5.6504798 9.94727779,5.53248307 C9.76560653,4.17140151 10.4624841,2.72297789 11.2498451,1.83563692 C12.1267465,0.799444643 13.6413789,0.0602553239 14.882569,-1.50990331e-14 Z"/>
        </svg>
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
        <div class="lcd-meta__artist">{player.loading ? '正在载入…' : lyricLoading ? '正在同步歌词…' : player.artist || ''}</div>
      {/if}
    </div>
  </div>

  <!-- 中间：播放控制 + 进度条 -->
  <div class="player-bar__controls">
    <div class="playback-controls">
      <button class="ctrl-btn ctrl-btn--shuffle" class:active={player.mode === 'shuffle'}
        onclick={(e) => { e.stopPropagation(); player.setMode(player.mode === 'shuffle' ? 'list' : 'shuffle') }}
        aria-label="随机播放">
        <svg viewBox="0 0 640 640" width="18" height="18" fill="currentColor">
          <path d="M467.8 98.4c12-5 25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64c-9.2 9.2-22.9 11.9-34.9 6.9S448 268.9 448 256v-32h-32c-10.1 0-19.6 4.7-25.6 12.8L358 280l-40-53.3l21.2-28.3c18.1-24.2 46.6-38.4 76.8-38.4h32v-32c0-12.9 7.8-24.6 19.8-29.6M218 360l40 53.3l-21.2 28.3C218.7 465.8 190.2 480 160 480H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h64c10.1 0 19.6-4.7 25.6-12.8zm284.6 174.6c-9.2 9.2-22.9 11.9-34.9 6.9S448 524.9 448 512v-32h-32c-30.2 0-58.7-14.2-76.8-38.4L185.6 236.8c-6-8.1-15.5-12.8-25.6-12.8H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h64c30.2 0 58.7 14.2 76.8 38.4l153.6 204.8c6 8.1 15.5 12.8 25.6 12.8h32v-32c0-12.9 7.8-24.6 19.8-29.6s25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64z"/>
        </svg>
      </button>
      <button class="ctrl-btn ctrl-btn--prev" onclick={(e) => { e.stopPropagation(); player.prev() }} aria-label="上一首">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d={prevPath} fill-rule="evenodd" clip-rule="evenodd"/>
        </svg>
      </button>
      <button class="ctrl-btn ctrl-btn--play" onclick={(e) => { e.stopPropagation(); player.togglePlay() }} aria-label={player.playing ? '暂停' : '播放'}>
        {#if player.loading}
          <div class="ctrl-btn__spinner">
            <Spinner size="sm" />
          </div>
        {:else if player.playing}
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d={pausePath}/>
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d={playPath} fill-rule="evenodd" clip-rule="evenodd"/>
          </svg>
        {/if}
      </button>
      <button class="ctrl-btn ctrl-btn--next" onclick={(e) => { e.stopPropagation(); player.next() }} aria-label="下一首">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d={nextPath} fill-rule="evenodd" clip-rule="evenodd"/>
        </svg>
      </button>
      <button class="ctrl-btn ctrl-btn--repeat" class:active={player.mode === 'repeat'}
        onclick={(e) => { e.stopPropagation(); player.setMode(player.mode === 'repeat' ? 'list' : 'repeat') }}
        aria-label="单曲循环">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 12V9a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3m3 3v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- 右侧：音量 + 列表 -->
  <div class="player-bar__actions">
    <!-- 音量：未点击时只显示图标，点击后展开小 bar -->
    <div class="volume-slider-inline" class:open={showVolume} role="button" tabindex="0" aria-label="音量" onmousedown={blockPlayerBarClick} onclick={(e) => { e.stopPropagation(); toggleVolume() }} onkeydown={handleVolumeToggleKeyDown}>
      <div class="volume-slider-inline__bar">
        <div class="volume-slider-inline__icon">
          {#if player.volume > 0}
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
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

    <button class="action-btn" class:active={showQueuePanel} onclick={(e) => { e.stopPropagation(); onToggleQueue?.() }} aria-label="播放列表">
      <svg viewBox="0 0 48 48" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round">
        <path stroke-linecap="round" d="M24 19h16m-16-9h16M8 38h32M8 28h32" />
        <path fill="currentColor" d="m8 10l8 5l-8 5z" />
      </svg>
    </button>
  </div>

</div>
