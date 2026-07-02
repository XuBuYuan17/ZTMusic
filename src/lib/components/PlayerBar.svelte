<script>
  import { ncm } from '../api/client.js'
  import { player } from '../stores/player.svelte.js'
  import { coverUrl } from '../utils/image.js'
  import { parseLyricResponse } from '../utils/lyrics.js'
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

  function fmt(t) {
    if (!t || isNaN(t)) return '0:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function handleClick(e) {
    if (player.id) {
      const barEl = e.currentTarget?.closest?.('.player-bar') || e.currentTarget || e.target?.closest?.('.player-bar')
      const originEl = barEl?.querySelector?.('.lcd-artwork__img') || barEl
      if (!originEl) return
      isPressing = true
      
      setTimeout(() => {
        isPressing = false
        onOpenSheet?.(originEl)
      }, 150)
    }
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
        barLyrics = parseLyricResponse(res).lines
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
  let currentTrack = $derived(player.currentTrack || player.queue?.find(track => track?.id === player.id) || player.queue?.[player.queueIndex])
  let currentArtists = $derived(currentTrack?.ar || currentTrack?.artists || [])

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

  // (paths moved to Icon component)
</script>

<div
  class="player-bar"
  class:pressing={isPressing}
  class:compact={compactMode}
  class:with-lyrics={showLyric}
  style="cursor: pointer;"
>
  <button type="button" class="player-bar__open-hit" onpointerdown={handleClick} onclick={(e) => e.stopPropagation()} aria-label="打开歌词页"></button>
  <!-- 左侧：歌曲信息 / 当前歌词 (LCD区域) -->
  <div class="player-bar__lcd" aria-hidden="true">
    {#if player.cover}
      <div class="lcd-artwork">
        <img class="lcd-artwork__img" src={coverUrl(player.cover, 88)} alt="" referrerpolicy="no-referrer">
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
        {#if player.error}
          <div class="lcd-meta__artist">{player.error}</div>
        {:else if player.artist && !player.loading && !lyricLoading}
          <div class="lcd-meta__artist"><ArtistNames artists={currentArtists} {onOpenArtist} fallback={player.artist} /></div>
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
        <Icon name="shuffle-lg" size={18} fill="currentColor" />
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
          <Icon name="pause" size={24} fill="currentColor" />
        {:else}
          <Icon name="play" size={24} fill="currentColor" />
        {/if}
      </button>
      <button class="ctrl-btn ctrl-btn--next" onclick={(e) => { e.stopPropagation(); player.next() }} aria-label="下一首">
        <Icon name="next" size={24} fill="currentColor" />
      </button>
      <button class="ctrl-btn ctrl-btn--repeat" class:active={player.mode === 'repeat'}
        onclick={(e) => { e.stopPropagation(); player.setMode(player.mode === 'repeat' ? 'list' : 'repeat') }}
        aria-label="单曲循环">
        <Icon name="repeat" size={18} />
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

    <button class="action-btn" class:active={showQueuePanel} onclick={(e) => { e.stopPropagation(); onToggleQueue?.() }} aria-label="播放列表">
      <Icon name="list" size={22} />
    </button>
  </div>

</div>
