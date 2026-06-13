<script>
  import { player } from '../stores/player.svelte.js'
  import { auth } from '../stores/auth.svelte.js'
  import { ncm } from '../api/client.js'
  import { parseLyricResponse } from '../utils/lyrics.js'
  import { getStorage } from '../utils/storage.js'
  import Spinner from './Spinner.svelte'
  import QueuePanel from './QueuePanel.svelte'
  import ArtistNames from './ArtistNames.svelte'

  let { show = false, onClose, lyricsOrigin = null, onOpenArtist } = $props()

  let lyrics = $state([])
  let currentTrack = $derived(player.currentTrack || player.queue?.find(track => track?.id === player.id) || player.queue?.[player.queueIndex])
  let currentArtists = $derived(currentTrack?.ar || currentTrack?.artists || [])
  let highlightIndex = $state(0)
  let lyricsEl = $state(null)
  let timer
  let animating = $state(false)
  let mounted = $state(false)
  let contentEntered = $state(false)
  let closing = $state(false)
  let containerEl = $state(null)
  let showMenu = $state(false)
  let menuBtnEl = $state(null)
  let menuY = $state(0)
  let menuRight = $state(0)
  let liked = $state(false)
  let showPlaylistPicker = $state(false)
  let userPlaylists = $state([])
  let showCopied = $state(false)
  let toastText = $state('已复制')
  let volumeOpen = $state(false)
  let showLocalQueue = $state(false)
  let songComments = $state([])
  let similarSongs = $state([])
  let similarPlaylists = $state([])
  let extrasLoading = $state(false)
  let showContextStrip = $state(false)
  let contextPanel = $state(null)
  let selectedSimilarPlaylist = $state(null)
  let selectedPlaylistTracks = $state([])
  let selectedPlaylistLoading = $state(false)
  let lyricsBlur = $state(getStorage('lyrics_blur_effect', 'true') === 'true')
  let lyricsTextBlur = $state(getStorage('lyrics_text_blur_effect', 'true') === 'true')
  let queueLength = $derived(player.queue?.length || 0)
  let hasPlayableTrack = $derived(Boolean(player.id))

  let lyricsMode = $state(false)
  function toggleLyricsMode() {
    lyricsMode = !lyricsMode
  }

  $effect(() => {
    const handleLyricsBlurChange = (event) => {
      lyricsBlur = Boolean(event.detail)
    }
    window.addEventListener('lyrics-blur-change', handleLyricsBlurChange)
    return () => window.removeEventListener('lyrics-blur-change', handleLyricsBlurChange)
  })

  $effect(() => {
    const handleLyricsTextBlurChange = (event) => {
      lyricsTextBlur = Boolean(event.detail)
    }
    window.addEventListener('lyrics-text-blur-change', handleLyricsTextBlurChange)
    return () => window.removeEventListener('lyrics-text-blur-change', handleLyricsTextBlurChange)
  })

  $effect(() => {
    if (show) {
      animating = true
      contentEntered = false
      closing = false
      document.body.style.overflow = 'hidden'
      startTimer()
      checkLiked()

      if (containerEl && lyricsOrigin) {
        const scale = 0.18
        containerEl.style.transformOrigin = `${lyricsOrigin.x}px ${lyricsOrigin.y}px`
        containerEl.style.transition = 'none'
        containerEl.style.transform = `scale(${scale})`
        containerEl.style.opacity = '0'
        mounted = true

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            containerEl.style.transition = 'transform 0.6s cubic-bezier(0.32, 1.25, 0.38, 1), opacity 0.3s ease'
            containerEl.style.transform = 'scale(1)'
            containerEl.style.opacity = '1'
          })
        })
      } else {
        mounted = true
      }

      setTimeout(() => { contentEntered = true }, 200)
    } else if (!closing) {
      closing = true
      contentEntered = false

      if (containerEl && lyricsOrigin) {
        const scale = 0.18
        containerEl.style.transition = 'transform 0.5s cubic-bezier(0.32, 1.25, 0.38, 1), opacity 0.25s ease'
        containerEl.style.transform = `scale(${scale})`
        containerEl.style.opacity = '0'

        containerEl.addEventListener('transitionend', function cleanup() {
          containerEl.removeEventListener('transitionend', cleanup)
          containerEl.style.transition = ''
          containerEl.style.transform = ''
          containerEl.style.opacity = ''
          mounted = false
          document.body.style.overflow = ''
          animating = false
        })
      } else {
        mounted = false
        document.body.style.overflow = ''
        animating = false
      }

      stopTimer()
      clearLyricAnimations()
      lyrics = []
      highlightIndex = 0
      showMenu = false
      showPlaylistPicker = false
      volumeOpen = false
      songComments = []
      similarSongs = []
      similarPlaylists = []
      showContextStrip = false
      contextPanel = null
      selectedSimilarPlaylist = null
      selectedPlaylistTracks = []
      selectedPlaylistLoading = false
    }
  })

  $effect(() => {
    if (show && player.id) {
      fetchLyrics()
      fetchSongExtras()
    }
  })

  $effect(() => {
    if (!player.playing && lyricsEl) {
      clearLyricAnimations()
    }
  })

  $effect(() => {
    if (lyricsMode) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToLine(highlightIndex))
      })
    }
  })

  function onKeydown(e) {
    if (!show) return
    if (e.key === 'Escape') onClose?.()
    if ((e.code === 'Space' || e.key === ' ') && !e.repeat && !isEditableTarget(e.target)) {
      e.preventDefault()
      player.togglePlay()
    }
  }

  function isEditableTarget(target) {
    const tag = target?.tagName?.toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable
  }

  function splitWords(text = '') {
    return (text || '').trim().split(/\s+/).map(w => w.trim()).filter(Boolean)
  }

  async function fetchLyrics() {
    if (!player.id) { lyrics = []; return }
    try {
      const res = await ncm.lyric(player.id)
      const parsed = parseLyricResponse(res)
      lyrics = parsed.map(l => ({ time: l.time, text: l.content, translation: l.translation, words: splitWords(l.content) }))
    } catch { lyrics = [] }
  }

  function normalizeTrack(track) {
    if (!track) return null
    return {
      ...track,
      id: track.id,
      name: track.name,
      ar: track.ar || track.artists || [],
      al: track.al || track.album || {},
      dt: track.dt || track.duration || 0,
      picUrl: track.al?.picUrl || track.album?.picUrl || track.picUrl || track.coverImgUrl || '',
    }
  }

  async function fetchSongExtras() {
    if (!player.id) return
    extrasLoading = true
    try {
      const [commentRes, simiSongRes, simiPlaylistRes] = await Promise.all([
        ncm.commentMusic(player.id, 8).catch(() => ({ hotComments: [], comments: [] })),
        ncm.simiSong(player.id).catch(() => ({ songs: [] })),
        ncm.simiPlaylist(player.id).catch(() => ({ playlists: [] })),
      ])
      songComments = (commentRes?.hotComments?.length ? commentRes.hotComments : commentRes?.comments || []).slice(0, 6)
      similarSongs = (simiSongRes?.songs || []).map(normalizeTrack).filter(Boolean).slice(0, 6)
      similarPlaylists = (simiPlaylistRes?.playlists || []).slice(0, 6)
    } catch {
      songComments = []
      similarSongs = []
      similarPlaylists = []
    }
    extrasLoading = false
  }

  function playSimilarSong(track) {
    const idx = similarSongs.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(similarSongs, idx)
    else player.playTrack(track, 0)
  }

  async function loadSimilarPlaylist(pl) {
    if (!pl?.id) return
    selectedSimilarPlaylist = pl
    selectedPlaylistTracks = []
    selectedPlaylistLoading = true
    try {
      const res = await ncm.playlistTracks(pl.id, 20)
      const tracks = res?.songs || res?.playlist?.tracks || res?.privileges?.map((_, index) => res?.songs?.[index]).filter(Boolean) || []
      selectedPlaylistTracks = tracks.map(normalizeTrack).filter(Boolean)
    } catch {
      selectedPlaylistTracks = []
    }
    selectedPlaylistLoading = false
  }

  function playSelectedPlaylistTrack(track) {
    const idx = selectedPlaylistTracks.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(selectedPlaylistTracks, idx)
    else player.playTrack(track, 0)
  }

  async function checkLiked() {
    if (!auth.isLoggedIn) return
    const uid = auth.user?.userId || auth.user?.id
    if (!uid) return
    try {
      const res = await ncm.likelist(uid)
      liked = (res.ids || []).includes(player.id)
    } catch {}
  }

  function toggleLike() {
    if (!auth.isLoggedIn) return
    const uid = auth.user?.userId || auth.user?.id
    if (!uid) return
    const nextLiked = !liked
    liked = nextLiked
    ncm.like(player.id, nextLiked, uid).then(() => {
      toastText = nextLiked ? '已添加喜欢' : '已取消喜欢'
      showCopied = true
      setTimeout(() => showCopied = false, 2000)
    }).catch(() => { liked = !nextLiked })
  }

  function startTimer() {
    stopTimer()
    timer = setInterval(() => {
      if (lyrics.length === 0) return
      const now = player.currentTime
      let idx = -1
      for (let i = lyrics.length - 1; i >= 0; i--) {
        if (now >= lyrics[i].time) { idx = i; break }
      }
      if (idx !== highlightIndex) {
        highlightIndex = idx
        scrollToLine(idx)
      }
    }, 100)
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null }
  }

  function clearLyricAnimations() {
    const el = lyricsEl
    el?.querySelectorAll('.ly-line.animate-words').forEach(line => {
      line.classList.remove('animate-words')
    })
  }

  function scrollToLine(idx) {
    const el = lyricsEl
    if (!el) return
    const line = el.querySelector(`[data-idx="${idx}"]`)
    if (line && el.clientHeight > 0) {
      el.scrollTo({
        top: line.offsetTop - el.clientHeight / 3,
        behavior: 'smooth'
      })
      line.classList.remove('animate-words')
      void line.offsetWidth
      line.classList.add('animate-words')
      const words = line.querySelectorAll('.ly-word')
      const lastWord = words[words.length - 1]
      if (lastWord) {
        const cleanup = () => {
          line.classList.remove('animate-words')
          lastWord.removeEventListener('animationend', cleanup)
        }
        lastWord.addEventListener('animationend', cleanup)
      } else {
        setTimeout(() => line.classList.remove('animate-words'), 520)
      }
    }
  }

  function seekTo(time) {
    if (!player.duration) return
    clearLyricAnimations()
    player.seek(Math.max(0, Math.min(player.duration, time)))
  }

  function onLyricLineClick(event, time) {
    event.currentTarget?.blur?.()
    seekTo(time)
  }

  function getProgress() {
    if (!player.duration) return 0
    return (player.currentTime / player.duration) * 100
  }

  function fmt(sec) {
    if (!sec || isNaN(sec)) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function fmtRemaining(sec) {
    if (!sec || isNaN(sec)) return '0:00'
    const remaining = Math.max(0, player.duration - player.currentTime)
    const m = Math.floor(remaining / 60)
    const s = Math.floor(remaining % 60)
    return `-${m}:${s.toString().padStart(2, '0')}`
  }

  function seekFromClientX(target, clientX) {
    if (!player.duration || !target) return
    const rect = target.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    player.seek(pct * player.duration)
  }

  function onProgressPointerDown(e) {
    if (!player.duration) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    seekFromClientX(e.currentTarget, e.clientX)
  }

  function onProgressPointerMove(e) {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return
    seekFromClientX(e.currentTarget, e.clientX)
  }

  function onProgressKeydown(e) {
    if (!player.duration) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 5 : -5
      player.seek(Math.max(0, Math.min(player.duration, player.currentTime + step)))
    }
  }

  function setVolumeFromClientX(target, clientX) {
    if (!target) return
    const pct = (clientX - target.getBoundingClientRect().left) / target.offsetWidth
    player.setVolume(Math.max(0, Math.min(1, pct)))
  }

  function onVolumePointerDown(e) {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setVolumeFromClientX(e.currentTarget, e.clientX)
  }

  function onVolumePointerMove(e) {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return
    setVolumeFromClientX(e.currentTarget, e.clientX)
  }

  function onVolumeKeydown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 0.05 : -0.05
      player.setVolume(Math.max(0, Math.min(1, player.volume + step)))
    }
  }

  async function loadPlaylists() {
    if (!auth.isLoggedIn) return
    const uid = auth.user?.userId || auth.user?.id
    if (!uid) return
    try {
      const res = await ncm.userPlaylist(uid)
      userPlaylists = (res.playlist || []).slice(0, 20)
    } catch {}
  }

  async function addToPlaylist(plId) {
    try {
      await ncm.playlistAddTrack(plId, player.id)
      showPlaylistPicker = false
      showMenu = false
      toastText = '已添加到歌单'
      showCopied = true
      setTimeout(() => showCopied = false, 2000)
    } catch {}
  }

  async function removeFromPlaylist(plId) {
    try {
      await ncm.playlistRemoveTrack(plId, player.id)
      showPlaylistPicker = false
      showMenu = false
      toastText = '已从歌单移除'
      showCopied = true
      setTimeout(() => showCopied = false, 2000)
    } catch {}
  }

  function copyLink() {
    navigator.clipboard?.writeText(`https://music.163.com/#/song?id=${player.id}`).catch(() => {})
    toastText = '已复制'
    showCopied = true
    setTimeout(() => showCopied = false, 2000)
    showMenu = false
  }

  function openPlaylistPicker() {
    showMenu = false
    showPlaylistPicker = true
    loadPlaylists()
  }

  function openCurrentArtist(id) {
    showMenu = false
    if (!id) return
    onOpenArtist?.(id)
    onClose?.()
  }

  function closeMenu(e) {
    if (e.target === e.currentTarget) {
      showMenu = false
      showPlaylistPicker = false
    }
  }

  function closeMenuByKeyboard(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      showMenu = false
      showPlaylistPicker = false
    }
  }

  function onMenuBtnClick(e) {
    const rect = menuBtnEl?.getBoundingClientRect() || e.currentTarget.getBoundingClientRect()
    menuRight = Math.max(12, window.innerWidth - rect.right)
    menuY = Math.max(12, rect.top - 8)
    showMenu = !showMenu
  }

  function onMenuBackdropClick(e) {
    if (e.target === e.currentTarget) showMenu = false
  }

  function toggleContextStrip() {
    showContextStrip = !showContextStrip
    if (!showContextStrip) contextPanel = null
  }

  function closeContextStrip() {
    showContextStrip = false
    contextPanel = null
    selectedSimilarPlaylist = null
    selectedPlaylistTracks = []
    selectedPlaylistLoading = false
  }

  function openContextPanel(type) {
    contextPanel = contextPanel === type ? null : type
    if (type !== 'playlists') {
      selectedSimilarPlaylist = null
      selectedPlaylistTracks = []
      selectedPlaylistLoading = false
    }
  }

  function contextPanelTitle() {
    if (contextPanel === 'songs') return '相似歌曲'
    if (contextPanel === 'playlists') return '相似歌单'
    if (contextPanel === 'comments') return '热评'
    return '相关内容'
  }

  function toggleLocalQueue(event) {
    event?.preventDefault()
    event?.stopPropagation()
    if (!hasPlayableTrack) return
    showLocalQueue = !showLocalQueue
  }

  function toggleVolumePanel(event) {
    event?.preventDefault()
    event?.stopPropagation()
    volumeOpen = !volumeOpen
  }

  // ---
</script>

<svelte:window onkeydown={onKeydown} />

{#if animating}
  <div
    class="ly-fullscreen"
    class:mounted
    class:closing
    class:entered={contentEntered}
    class:ly-no-blur={!lyricsBlur}
    class:ly-no-text-blur={!lyricsTextBlur}
    style={player.cover && lyricsBlur ? `--ly-cover: url(${player.cover}?param=1080y1080)` : ''}
    bind:this={containerEl}
    role="presentation"
    onclick={onClose}
  >
    <div class="ly-container" class:ly-mobile-lyrics-mode={lyricsMode} role="presentation" onclick={(e) => e.stopPropagation()}>

      <div class="ly-top-bar">
        <button class="ly-queue-btn" onclick={toggleLocalQueue} aria-label="播放列表" aria-expanded={showLocalQueue} disabled={!hasPlayableTrack}>
          <svg viewBox="0 0 48 48" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><path stroke-linecap="round" d="M24 19h16m-16-9h16M8 38h32M8 28h32"/><path fill="currentColor" d="m8 10l8 5l-8 5z"/></svg>
        </button>
        <div class="ly-volume-area" class:open={volumeOpen}>
          <button class="ly-vol-btn" onclick={toggleVolumePanel} aria-label="音量" aria-expanded={volumeOpen}>
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          </button>
          <div class="ly-vol-track" role="slider" tabindex="0" aria-label="音量" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(player.volume * 100)} onpointerdown={onVolumePointerDown} onpointermove={onVolumePointerMove} onkeydown={onVolumeKeydown}>
            <div class="ly-vol-fill" style="width:{player.volume * 100}%"></div>
          </div>
        </div>
      </div>
      <button class="ly-back-btn" onclick={onClose} aria-label="关闭">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <!-- Menu popup (fixed, top-level) -->
      {#if showMenu}
        <div class="ly-menu-backdrop" role="button" tabindex="0" aria-label="关闭菜单" onclick={onMenuBackdropClick} onkeydown={closeMenuByKeyboard}>
          <div class="ly-menu" role="presentation" style="right:{menuRight}px;top:{menuY}px" onclick={(e) => e.stopPropagation()}>
            <div class="ly-menu-header">{player.title || '未知歌曲'}</div>
            <button class="ly-menu-item" onclick={openPlaylistPicker}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              添加到歌单
            </button>
            <div class="ly-menu-item ly-menu-item--artists">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              <span>演奏者：</span><ArtistNames artists={currentArtists} onOpenArtist={openCurrentArtist} fallback={player.artist || '未知'} />
            </div>
            <button class="ly-menu-item" onclick={() => { showMenu = false }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              专辑：{player.album || '未知'}
            </button>
            <button class="ly-menu-item" onclick={() => { showMenu = false; showCopied = true; setTimeout(() => showCopied = false, 2000) }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              分享
            </button>
            <button class="ly-menu-item" onclick={copyLink}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              复制链接
            </button>
          </div>
        </div>
      {/if}

      {#if showLocalQueue}
        <div class="ly-local-queue" role="presentation" onclick={(e) => e.stopPropagation()}>
          <QueuePanel show={true} mobileVisible={true} onClose={() => { showLocalQueue = false }} {onOpenArtist} />
        </div>
      {/if}

      <!-- Left: Cover + Track info + Controls -->
      {#snippet leftPanel()}
        <div class="ly-left-cover">
          <div class="ly-cover-wrap" role="button" tabindex="0" onclick={toggleLyricsMode} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleLyricsMode() } }}>
            <img class="ly-cover" src={(player.cover || '') + '?param=600y600'} alt="" />
          </div>
          <div class="ly-track-wrap">
            <div class="ly-track-top">
              <div class="ly-track-title">{player.title || '未在播放'}</div>
            </div>
            <div class="ly-track-sub">
              <div class="ly-track-info">
                <span class="ly-artist"><ArtistNames artists={currentArtists} onOpenArtist={openCurrentArtist} fallback={player.artist || ''} /></span>
                {#if player.artist && player.album}
                  <span class="ly-sep">—</span>
                {/if}
                <span class="ly-album">{player.album || player.title || ''}</span>
              </div>
              <div class="ly-track-actions">
                <button class="ly-star-btn" class:active={liked} onclick={(e) => { e.stopPropagation(); toggleLike() }} aria-label="喜欢">
                  {#if liked}
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  {:else}
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  {/if}
                </button>
                <div class="ly-menu-wrap">
                  <button class="ly-menu-btn" bind:this={menuBtnEl} onclick={(e) => { e.stopPropagation(); onMenuBtnClick(e) }} aria-label="菜单">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="3" cy="12" r="2.8"/><circle cx="12" cy="12" r="2.8"/><circle cx="21" cy="12" r="2.8"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="ly-left-controls">
          <div class="ly-progress-row">
            <div class="ly-progress-track" role="slider" tabindex="0" aria-label="播放进度" aria-valuemin="0" aria-valuemax={Math.floor(player.duration || 0)} aria-valuenow={Math.floor(player.currentTime || 0)} aria-disabled={!player.duration} onpointerdown={onProgressPointerDown} onpointermove={onProgressPointerMove} onkeydown={onProgressKeydown}>
              <div class="ly-progress-fill" style="width:{getProgress()}%"></div>
            </div>
            <div class="ly-time-row">
              <span class="ly-time">{fmt(player.currentTime)}</span>
              <span class="ly-time">{fmtRemaining(player.duration)}</span>
            </div>
          </div>
          <div class="ly-play-row">
            <button class="ly-ctrl-btn" class:active={player.mode === 'shuffle'} onclick={() => player.setMode(player.mode === 'shuffle' ? 'list' : 'shuffle')} aria-label="随机播放" disabled={!hasPlayableTrack}>
              <svg viewBox="0 0 640 640" width="22" height="22" fill="currentColor"><path d="M467.8 98.4c12-5 25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64c-9.2 9.2-22.9 11.9-34.9 6.9S448 268.9 448 256v-32h-32c-10.1 0-19.6 4.7-25.6 12.8L358 280l-40-53.3l21.2-28.3c18.1-24.2 46.6-38.4 76.8-38.4h32v-32c0-12.9 7.8-24.6 19.8-29.6M218 360l40 53.3l-21.2 28.3C218.7 465.8 190.2 480 160 480H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h64c10.1 0 19.6-4.7 25.6-12.8zm284.6 174.6c-9.2 9.2-22.9 11.9-34.9 6.9S448 524.9 448 512v-32h-32c-30.2 0-58.7-14.2-76.8-38.4L185.6 236.8c-6-8.1-15.5-12.8-25.6-12.8H96c-17.7 0-32-14.3-32-32s14.3-32 32-32h64c30.2 0 58.7 14.2 76.8 38.4l153.6 204.8c6 8.1 15.5 12.8 25.6 12.8h32v-32c0-12.9 7.8-24.6 19.8-29.6s25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64z"/></svg>
            </button>
            <button class="ly-ctrl-btn" onclick={() => player.prev()} aria-label="上一首" disabled={queueLength === 0}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M2.5 9.402c-2 1.155-2 4.041 0 5.196l9 5.196c1.515.875 3.317.259 4.102-1.096l1.898 1.096c2 1.155 4.5-.288 4.5-2.598V6.804c0-2.31-2.5-3.753-4.5-2.598l-1.898 1.096c-.785-1.355-2.587-1.971-4.102-1.096zM16 7.382v9.237l2.5 1.443a1 1 0 0 0 1.5-.866V6.804a1 1 0 0 0-1.5-.866z" fill-rule="evenodd" clip-rule="evenodd"/></svg>
            </button>
            <button class="ly-play-btn" onclick={() => player.togglePlay()} aria-label={player.playing ? '暂停' : '播放'} disabled={!hasPlayableTrack || player.loading}>
              {#if player.loading}
                <span class="ly-play-spinner">
                  <Spinner size="md" />
                </span>
              {:else if player.playing}
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M9 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m8 0h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/></svg>
              {:else}
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z" fill-rule="evenodd" clip-rule="evenodd"/></svg>
              {/if}
            </button>
            <button class="ly-ctrl-btn" onclick={() => player.next()} aria-label="下一首" disabled={queueLength === 0}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M5.5 5.938a1 1 0 0 0-1.5.866v10.392a1 1 0 0 0 1.5.866L8 16.62V7.38zm2.898-.636L6.5 4.206l-.5.866l.5-.866C4.5 3.05 2 4.494 2 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598l1.898-1.096c.785 1.355 2.587 1.971 4.102 1.096l9-5.196c2-1.155 2-4.041 0-5.196l-9-5.196c-1.515-.875-3.317-.259-4.102 1.096" fill-rule="evenodd" clip-rule="evenodd"/></svg>
            </button>
            <button class="ly-ctrl-btn" class:active={player.mode === 'repeat'} onclick={() => player.setMode(player.mode === 'repeat' ? 'list' : 'repeat')} aria-label="单曲循环" disabled={!hasPlayableTrack}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12V9a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3m3 3v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3"/></svg>
            </button>
          </div>
          <div class="ly-mobile-volume-row">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>
            <div class="ly-mobile-vol-track" role="slider" tabindex="0" aria-label="音量" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(player.volume * 100)} onpointerdown={onVolumePointerDown} onpointermove={onVolumePointerMove} onkeydown={onVolumeKeydown}>
              <div class="ly-vol-fill" style="width:{player.volume * 100}%"></div>
            </div>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
          </div>
          <div class="ly-mobile-action-row">
            <button class="ly-mobile-action-btn" class:active={showContextStrip} onclick={(e) => { e.stopPropagation(); toggleContextStrip() }} aria-label="歌词相关内容">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16"/><path d="M4 12h10"/><path d="M4 19h16"/></svg>
            </button>
            <button class="ly-mobile-action-btn" onclick={toggleLocalQueue} aria-label="播放列表" aria-expanded={showLocalQueue} disabled={!hasPlayableTrack}>
              <svg viewBox="0 0 48 48" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"><path stroke-linecap="round" d="M24 19h16m-16-9h16M8 38h32M8 28h32"/><path fill="currentColor" d="m8 10l8 5l-8 5z"/></svg>
            </button>
          </div>
        </div>
      {/snippet}

      <div class="ly-left">
        {@render leftPanel()}
      </div>

      <!-- Right: Lyrics -->
      <div class="ly-right">
        <div class="ly-right-panel">
          <div class="ly-lyrics-scroll" bind:this={lyricsEl}>
          {#if lyrics.length > 0}
            <div class="ly-lyrics-inner">
            {#each lyrics as line, i}
              <button
                class="ly-line"
                class:active={i === highlightIndex}
                class:sung={i < highlightIndex}
                data-idx={i}
                aria-current={i === highlightIndex ? 'true' : undefined}
                onclick={(event) => onLyricLineClick(event, line.time)}
              >
                <span class="ly-line-text">
                  {#if line.words?.length}
                    {#each line.words as w, wi}
                      <span class="ly-word" style="--i:{wi}">{w}</span>{wi < line.words.length - 1 ? '\u00A0' : ''}
                    {/each}
                  {:else}
                    {line.text || '...'}
                  {/if}
                </span>
                {#if line.translation}
                  <span class="ly-line-trans">{line.translation}</span>
                {/if}
              </button>
            {/each}
            </div>
          {:else}
            <div class="ly-no-lyric">暂无歌词</div>
          {/if}
          </div>

          {#if extrasLoading || similarSongs.length > 0 || similarPlaylists.length > 0 || songComments.length > 0}
            <button class="ly-context-toggle" class:open={showContextStrip} onclick={toggleContextStrip} aria-label="相关内容" aria-expanded={showContextStrip}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.22.65.22 1h.29a2 2 0 0 1 0 4h-.29c0 .35-.08.69-.22 1Z"/></svg>
            </button>

            {#if showContextStrip}
              <button class="ly-context-scrim" aria-label="隐藏相关内容" onclick={closeContextStrip}></button>
              <div class="ly-context-strip" aria-label="歌曲相关内容">
                {#if extrasLoading}
                  <div class="ly-context-card ly-context-loading">加载相关内容…</div>
                {/if}

                {#each similarSongs.slice(0, 1) as track (track.id)}
                  <button class="ly-context-card ly-context-song" class:active={contextPanel === 'songs'} onclick={() => openContextPanel('songs')}>
                    {#if track.picUrl}
                      <img src={track.picUrl + '?param=96y96'} alt="" loading="lazy" />
                    {:else}
                      <span class="ly-context-cover-ph">♫</span>
                    {/if}
                    <span class="ly-context-copy">
                      <small>相似歌曲</small>
                      <strong>{track.name}</strong>
                      <em><ArtistNames artists={track.ar || track.artists || []} onOpenArtist={(id) => { onOpenArtist?.(id); onClose?.() }} /></em>
                    </span>
                  </button>
                {/each}

                {#if similarPlaylists.length > 0}
                  <button class="ly-context-card ly-context-playlists" class:active={contextPanel === 'playlists'} onclick={() => openContextPanel('playlists')}>
                    <span class="ly-context-cover-stack">
                      {#each similarPlaylists.slice(0, 3) as pl (pl.id)}
                        {#if pl.coverImgUrl}
                          <img src={pl.coverImgUrl + '?param=96y96'} alt="" loading="lazy" />
                        {/if}
                      {/each}
                    </span>
                    <span class="ly-context-copy">
                      <small>相似歌单</small>
                      <strong>{similarPlaylists[0]?.name}</strong>
                      <em>{similarPlaylists.length} 个灵感歌单</em>
                    </span>
                  </button>
                {/if}

                {#each songComments.slice(0, 1) as comment, index (comment.commentId || index)}
                  <button class="ly-context-card ly-context-comment" class:active={contextPanel === 'comments'} onclick={() => openContextPanel('comments')}>
                    <span class="ly-context-copy">
                      <small>热评 · {comment.user?.nickname || '听众'}</small>
                      <strong>{comment.content}</strong>
                    </span>
                  </button>
                {/each}
              </div>

              {#if contextPanel}
                <section class="ly-context-detail" aria-label={contextPanelTitle()}>
                  <div class="ly-context-detail-head">
                    <span>{contextPanelTitle()}</span>
                    <button onclick={() => { contextPanel = null; selectedSimilarPlaylist = null; selectedPlaylistTracks = [] }} aria-label="关闭详情">×</button>
                  </div>

                  {#if contextPanel === 'songs'}
                    <div class="ly-context-detail-list">
                      {#each similarSongs as track (track.id)}
                        <button class="ly-context-detail-row" onclick={() => playSimilarSong(track)}>
                          {#if track.picUrl}
                            <img src={track.picUrl + '?param=96y96'} alt="" loading="lazy" />
                          {:else}
                            <span class="ly-context-cover-ph">♫</span>
                          {/if}
                          <span>
                            <strong>{track.name}</strong>
                            <em><ArtistNames artists={track.ar || track.artists || []} onOpenArtist={(id) => { onOpenArtist?.(id); onClose?.() }} /></em>
                          </span>
                        </button>
                      {/each}
                    </div>
                  {:else if contextPanel === 'playlists'}
                    {#if selectedSimilarPlaylist}
                      <div class="ly-context-subhead">
                        <button onclick={() => { selectedSimilarPlaylist = null; selectedPlaylistTracks = [] }}>‹ 歌单</button>
                        <span>{selectedSimilarPlaylist.name}</span>
                      </div>
                      {#if selectedPlaylistLoading}
                        <div class="ly-context-empty">加载歌单歌曲…</div>
                      {:else if selectedPlaylistTracks.length > 0}
                        <div class="ly-context-detail-list">
                          {#each selectedPlaylistTracks as track (track.id)}
                            <button class="ly-context-detail-row" onclick={() => playSelectedPlaylistTrack(track)}>
                              {#if track.picUrl}
                                <img src={track.picUrl + '?param=96y96'} alt="" loading="lazy" />
                              {:else}
                                <span class="ly-context-cover-ph">♫</span>
                              {/if}
                              <span>
                                <strong>{track.name}</strong>
                                <em><ArtistNames artists={track.ar || track.artists || []} onOpenArtist={(id) => { onOpenArtist?.(id); onClose?.() }} /></em>
                              </span>
                            </button>
                          {/each}
                        </div>
                      {:else}
                        <div class="ly-context-empty">这个歌单暂时没有可预览的歌曲</div>
                      {/if}
                    {:else}
                      <div class="ly-context-detail-grid">
                        {#each similarPlaylists as pl (pl.id)}
                          <button class="ly-context-detail-playlist" onclick={() => loadSimilarPlaylist(pl)}>
                            {#if pl.coverImgUrl}
                              <img src={pl.coverImgUrl + '?param=180y180'} alt="" loading="lazy" />
                            {:else}
                              <span class="ly-context-cover-ph">♫</span>
                            {/if}
                            <strong>{pl.name}</strong>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  {:else if contextPanel === 'comments'}
                    <div class="ly-context-comment-list">
                      {#each songComments as comment, index (comment.commentId || index)}
                        <article class="ly-context-comment-row">
                          <strong>{comment.user?.nickname || '听众'}</strong>
                          <p>{comment.content}</p>
                        </article>
                      {/each}
                    </div>
                  {/if}
                </section>
              {/if}
            {/if}
          {/if}
        </div>
      </div>

      <!-- Mobile: single .ly-left with lyrics toggle -->
      <div class="ly-left ly-mobile-player" class:lyrics-mode={lyricsMode}>
        {@render leftPanel()}
        {#if lyricsMode}
          <div class="ly-mobile-lyrics" bind:this={lyricsEl}>
            {#if lyrics.length > 0}
              <div class="ly-lyrics-inner">
              {#each lyrics as line, i}
                <button
                  class="ly-line"
                  class:active={i === highlightIndex}
                  class:sung={i < highlightIndex}
                  data-idx={i}
                  aria-current={i === highlightIndex ? 'true' : undefined}
                  onclick={(event) => onLyricLineClick(event, line.time)}
                >
                  <span class="ly-line-text">
                    {#if line.words?.length}
                      {#each line.words as w, wi}
                        <span class="ly-word" style="--i:{wi}">{w}</span>{wi < line.words.length - 1 ? '\u00A0' : ''}
                      {/each}
                    {:else}
                      {line.text || '...'}
                    {/if}
                  </span>
                  {#if line.translation}
                    <span class="ly-line-trans">{line.translation}</span>
                  {/if}
                </button>
              {/each}
              </div>
            {:else}
              <div class="ly-no-lyric">暂无歌词</div>
            {/if}
          </div>
        {/if}
      </div>

    </div>

    {#if showCopied}
      <div class="ly-toast">{toastText}</div>
    {/if}

    {#if showPlaylistPicker}
      <div class="ly-picker-overlay" role="button" tabindex="0" aria-label="关闭歌单选择" onclick={closeMenu} onkeydown={closeMenuByKeyboard}>
        <div class="ly-picker" role="presentation" onclick={(e) => e.stopPropagation()}>
          <div class="ly-picker-header">
            <span>添加到歌单</span>
            <button onclick={() => showPlaylistPicker = false}>✕</button>
          </div>
          <div class="ly-picker-list">
            {#each userPlaylists as pl}
              <div class="ly-picker-item-row">
              <button class="ly-picker-item" onclick={() => addToPlaylist(pl.id)}>
                {#if pl.coverImgUrl}
                  <img class="ly-picker-cover" src={pl.coverImgUrl + '?param=60y60'} alt="" />
                {:else}
                  <div class="ly-picker-cover ly-picker-cover-ph">♫</div>
                {/if}
                <div class="ly-picker-info">
                  <div class="ly-picker-name">{pl.name}</div>
                  <div class="ly-picker-count">{pl.trackCount} 首</div>
                </div>
              </button>
              <button class="ly-picker-remove" onclick={() => removeFromPlaylist(pl.id)}>移除</button>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

  </div>
{/if}
