<script>
  import { player } from '../stores/player.svelte.js'
  import { auth } from '../stores/auth.svelte.js'
  import { ncm } from '../api/client.js'
  import { coverUrl } from '../utils/image.js'
  import { parseLyricResponse, parseYrc } from '../utils/lyrics.js'
  import { getStorage } from '../utils/storage.js'
  import Spinner from './Spinner.svelte'
  import QueuePanel from './QueuePanel.svelte'
  import ArtistNames from './ArtistNames.svelte'
  import PlaybackControls from './PlaybackControls.svelte'
  import ProgressBar from './ProgressBar.svelte'
  import VolumeSlider from './VolumeSlider.svelte'

  let { show = false, onClose, lyricsOrigin = null, onOpenArtist } = $props()

  // ---- State ----
  let lyrics = $state([])
  let yrcLines = $state([])
  let hasYrc = $derived(yrcLines.length > 0)
  let currentTrack = $derived(player.currentTrack || player.queue?.find(t => t?.id === player.id) || player.queue?.[player.queueIndex])
  let currentArtists = $derived(currentTrack?.ar || currentTrack?.artists || [])

  let highlightIndex = $derived.by(() => {
    if (lyrics.length === 0) return -1
    const now = player.currentTime
    for (let i = lyrics.length - 1; i >= 0; i--) if (now >= lyrics[i].time) return i
    return -1
  })
  let _prevHighlightIdx = -2
  let lyricsEl = $state(null)
  let animating = $state(false)
  let mounted = $state(false)
  let contentEntered = $state(false)
  let closing = $state(false)
  let containerEl = $state(null)

  // Menu
  let showMenu = $state(false)
  let menuBtnEl = $state(null)
  let menuY = $state(0)
  let menuRight = $state(0)
  let showPlaylistPicker = $state(false)
  let userPlaylists = $state([])
  let liked = $state(false)

  // Context strip
  let showContextStrip = $state(false)
  let contextPanel = $state(null)
  let songComments = $state([])
  let similarSongs = $state([])
  let similarPlaylists = $state([])
  let extrasLoading = $state(false)
  let selectedSimilarPlaylist = $state(null)
  let selectedPlaylistTracks = $state([])
  let selectedPlaylistLoading = $state(false)

  // Queue / toast
  let showLocalQueue = $state(false)
  let showCopied = $state(false)
  let toastText = $state('已复制')
  let lyricsBlur = $state(getStorage('lyrics_blur_effect', 'true') === 'true')
  let lyricsTextBlur = $state(getStorage('lyrics_text_blur_effect', 'true') === 'true')
  let lyricsMode = $state(false)

  let hasPlayableTrack = $derived(Boolean(player.id))
  let queueLength = $derived(player.queue?.length || 0)

  // ---- Derived helpers ----
  function fmt(sec) {
    if (!sec || isNaN(sec)) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function splitWords(text = '') {
    return (text || '').trim().split(/\s+/).map(w => w.trim()).filter(Boolean)
  }

  // ---- Lyrics fetching (two-phase: fast /lyric first, then upgrade to yrc) ----
  let _lyricReqId = 0

  async function fetchLyrics() {
    const id = player.id
    if (!id) { lyrics = []; yrcLines = []; return }
    const reqId = ++_lyricReqId

    // Phase 1: /lyric 快速加载传统歌词
    try {
      const res = await ncm.lyric(id).catch(() => null)
      if (reqId !== _lyricReqId || player.id !== id) return
      const base = parseLyricResponse(res || {})
      lyrics = base.lines.map(l => ({
        time: l.time, text: l.content,
        translation: l.translation,
        words: l.content ? splitWords(l.content) : [],
      }))
    } catch {}

    // Phase 2: 后台升级到 /lyric/new 逐字歌词（如果有）
    try {
      const newRes = await ncm.lyricNew(id).catch(() => null)
      if (reqId !== _lyricReqId || player.id !== id) return
      if (newRes?.yrc?.lyric) {
        const yrc = parseYrc(newRes.yrc.lyric)
        if (yrc.length > 0) yrcLines = yrc
      }
    } catch {}
  }

  // ---- Song extras ----
  function normalizeTrack(track) {
    if (!track) return null
    return {
      ...track, id: track.id, name: track.name,
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
      const [cr, sr, pr] = await Promise.all([
        ncm.commentMusic(player.id, 8).catch(() => ({ hotComments: [], comments: [] })),
        ncm.simiSong(player.id).catch(() => ({ songs: [] })),
        ncm.simiPlaylist(player.id).catch(() => ({ playlists: [] })),
      ])
      songComments = (cr?.hotComments?.length ? cr.hotComments : cr?.comments || []).slice(0, 6)
      similarSongs = (sr?.songs || []).map(normalizeTrack).filter(Boolean).slice(0, 6)
      similarPlaylists = (pr?.playlists || []).slice(0, 6)
    } catch { songComments = []; similarSongs = []; similarPlaylists = [] }
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
      const tracks = res?.songs || res?.playlist?.tracks || []
      selectedPlaylistTracks = tracks.map(normalizeTrack).filter(Boolean)
    } catch { selectedPlaylistTracks = [] }
    selectedPlaylistLoading = false
  }

  function playSelectedPlaylistTrack(track) {
    const idx = selectedPlaylistTracks.findIndex(t => t.id === track.id)
    if (idx >= 0) player.playQueue(selectedPlaylistTracks, idx)
    else player.playTrack(track, 0)
  }

  // ---- Like ----
  async function checkLiked() {
    if (!auth.isLoggedIn) return
    const uid = auth.user?.userId || auth.user?.id
    if (!uid) return
    try { const r = await ncm.likelist(uid); liked = (r.ids || []).includes(player.id) } catch {}
  }

  function toggleLike() {
    if (!auth.isLoggedIn) return
    const uid = auth.user?.userId || auth.user?.id
    if (!uid) return
    const next = !liked; liked = next
    ncm.like(player.id, next, uid).then(() => {
      toastText = next ? '已添加喜欢' : '已取消喜欢'; showCopied = true; setTimeout(() => showCopied = false, 2000)
    }).catch(() => { liked = !next })
  }

  // ---- Playlist picker ----
  async function loadPlaylists() {
    if (!auth.isLoggedIn) return
    const uid = auth.user?.userId || auth.user?.id
    if (!uid) return
    try { const r = await ncm.userPlaylist(uid); userPlaylists = (r.playlist || []).slice(0, 20) } catch {}
  }

  async function addToPlaylist(plId) {
    try { await ncm.playlistAddTrack(plId, player.id); showPlaylistPicker = false; showMenu = false; toastText = '已添加到歌单'; showCopied = true; setTimeout(() => showCopied = false, 2000) } catch {}
  }

  async function removeFromPlaylist(plId) {
    try { await ncm.playlistRemoveTrack(plId, player.id); showPlaylistPicker = false; showMenu = false; toastText = '已从歌单移除'; showCopied = true; setTimeout(() => showCopied = false, 2000) } catch {}
  }

  function copyLink() {
    navigator.clipboard?.writeText(`https://music.163.com/#/song?id=${player.id}`).catch(() => {})
    toastText = '已复制'; showCopied = true; setTimeout(() => showCopied = false, 2000); showMenu = false
  }

  function openPlaylistPicker() { showMenu = false; showPlaylistPicker = true; loadPlaylists() }
  function openCurrentArtist(id) { showMenu = false; if (!id) return; onOpenArtist?.(id); onClose?.() }

  // ---- Context strip ----
  function toggleContextStrip() { showContextStrip = !showContextStrip; if (!showContextStrip) contextPanel = null }
  function closeContextStrip() { showContextStrip = false; contextPanel = null; selectedSimilarPlaylist = null; selectedPlaylistTracks = []; selectedPlaylistLoading = false }
  function openContextPanel(type) { contextPanel = contextPanel === type ? null : type; if (type !== 'playlists') { selectedSimilarPlaylist = null; selectedPlaylistTracks = []; selectedPlaylistLoading = false } }
  function contextPanelTitle() { if (contextPanel === 'songs') return '相似歌曲'; if (contextPanel === 'playlists') return '相似歌单'; if (contextPanel === 'comments') return '热评'; return '相关内容' }

  // ---- Lyrics scrolling ----
  function scrollToLine(idx) {
    const el = lyricsEl; if (!el) return
    const line = el.querySelector(`[data-idx="${idx}"]`)
    if (!line || el.clientHeight <= 0) return
    el.scrollTo({ top: line.offsetTop - el.clientHeight / 3, behavior: 'smooth' })
    // word animation
    line.classList.remove('animate-words')
    void line.offsetWidth
    line.classList.add('animate-words')
    const lastWord = line.querySelectorAll('.ly-word')[line.querySelectorAll('.ly-word').length - 1]
    if (lastWord) { const c = () => { line.classList.remove('animate-words'); lastWord.removeEventListener('animationend', c) }; lastWord.addEventListener('animationend', c) }
    else setTimeout(() => line.classList.remove('animate-words'), 520)
  }

  $effect(() => {
    const idx = highlightIndex
    if (!show || idx < 0 || idx === _prevHighlightIdx || !lyricsEl) return
    _prevHighlightIdx = idx
    scrollToLine(idx)
  })

  // ---- Enter/leave animation ----
  $effect(() => {
    if (show) {
      animating = true; contentEntered = false; closing = false
      document.body.style.overflow = 'hidden'
      checkLiked()
      if (containerEl && lyricsOrigin) {
        containerEl.style.transformOrigin = `${lyricsOrigin.x}px ${lyricsOrigin.y}px`
        containerEl.style.transition = 'none'; containerEl.style.transform = 'scale(0.18)'; containerEl.style.opacity = '0'
        mounted = true
        requestAnimationFrame(() => requestAnimationFrame(() => {
          containerEl.style.transition = 'transform 0.6s cubic-bezier(0.32,1.25,0.38,1), opacity 0.3s ease'
          containerEl.style.transform = 'scale(1)'; containerEl.style.opacity = '1'
        }))
      } else { mounted = true }
      setTimeout(() => { contentEntered = true }, 200)
    } else if (!closing) {
      closing = true; contentEntered = false
      if (containerEl && lyricsOrigin) {
        containerEl.style.transition = 'transform 0.5s cubic-bezier(0.32,1.25,0.38,1), opacity 0.25s ease'
        containerEl.style.transform = 'scale(0.18)'; containerEl.style.opacity = '0'
        containerEl.addEventListener('transitionend', function cu() {
          containerEl.removeEventListener('transitionend', cu)
          containerEl.style.transition = ''; containerEl.style.transform = ''; containerEl.style.opacity = ''
          mounted = false; document.body.style.overflow = ''; animating = false
        })
      } else { mounted = false; document.body.style.overflow = ''; animating = false }
      lyricsEl?.querySelectorAll('.ly-line.animate-words').forEach(l => l.classList.remove('animate-words'))
      yrcLines = []
      // 延迟清除歌词，让关闭动画期间歌词保持可见
      setTimeout(() => { lyrics = [] }, 500)
      showMenu = false; showPlaylistPicker = false
      songComments = []; similarSongs = []; similarPlaylists = []; showContextStrip = false; contextPanel = null
      selectedSimilarPlaylist = null; selectedPlaylistTracks = []; selectedPlaylistLoading = false
    }
  })

  $effect(() => { if (show && player.id) { fetchLyrics(); fetchSongExtras() } })
  $effect(() => { if (!player.playing && lyricsEl) lyricsEl.querySelectorAll('.ly-line.animate-words').forEach(l => l.classList.remove('animate-words')) })

  $effect(() => {
    if (lyricsMode) {
      const idx = highlightIndex; if (idx >= 0) { _prevHighlightIdx = idx; requestAnimationFrame(() => requestAnimationFrame(() => scrollToLine(idx))) }
    }
  })

  // ---- Keyboard ----
  function onKeydown(e) {
    if (!show) return
    if (e.key === 'Escape') onClose?.()
    if ((e.code === 'Space' || e.key === ' ') && !e.repeat && !isEditableTarget(e.target)) { e.preventDefault(); player.togglePlay() }
  }
  function isEditableTarget(t) { const tag = t?.tagName?.toLowerCase(); return tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable }

  // ---- Menu actions ----
  function onMenuBtnClick(e) {
    const rect = menuBtnEl?.getBoundingClientRect() || e.currentTarget.getBoundingClientRect()
    menuRight = Math.max(12, window.innerWidth - rect.right); menuY = Math.max(12, rect.top - 8); showMenu = !showMenu
  }

  // ---- Event listeners ----
  $effect(() => {
    const h1 = (e) => { lyricsBlur = Boolean(e.detail) }; window.addEventListener('lyrics-blur-change', h1)
    const h2 = (e) => { lyricsTextBlur = Boolean(e.detail) }; window.addEventListener('lyrics-text-blur-change', h2)
    return () => { window.removeEventListener('lyrics-blur-change', h1); window.removeEventListener('lyrics-text-blur-change', h2) }
  })
</script>

<svelte:window onkeydown={onKeydown} />

{#if animating}
  <div class="ly-fullscreen" class:mounted class:closing class:entered={contentEntered}
    class:ly-no-blur={!lyricsBlur} class:ly-no-text-blur={!lyricsTextBlur}
    style={player.cover && lyricsBlur ? `--ly-cover: url(${coverUrl(player.cover, 1080)})` : ''}
    bind:this={containerEl} role="presentation" onclick={onClose}>
    <div class="ly-container" class:ly-mobile-lyrics-mode={lyricsMode} role="presentation" onclick={(e) => e.stopPropagation()}>

      <!-- Top bar -->
      <div class="ly-top-bar">
        <button class="ly-queue-btn" onclick={() => showLocalQueue = !showLocalQueue} aria-label="播放列表" disabled={!hasPlayableTrack}>
          <svg viewBox="0 0 48 48" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><path stroke-linecap="round" d="M24 19h16m-16-9h16M8 38h32M8 28h32"/><path fill="currentColor" d="m8 10l8 5l-8 5z"/></svg>
        </button>
        <div class="ly-volume-area">
          <VolumeSlider volume={player.volume} onvolumechange={(v) => player.setVolume(v)} />
        </div>
      </div>
      <button class="ly-back-btn" onclick={onClose} aria-label="关闭">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <!-- Menu popup -->
      {#if showMenu}
        <div class="ly-menu-backdrop" role="button" tabindex="0" aria-label="关闭菜单" onclick={() => showMenu = false} onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); showMenu = false } }}>
          <div class="ly-menu" role="presentation" style="right:{menuRight}px;top:{menuY}px" onclick={(e) => e.stopPropagation()}>
            <div class="ly-menu-header">{player.title || '未知歌曲'}</div>
            <button class="ly-menu-item" onclick={openPlaylistPicker}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>添加到歌单</button>
            <div class="ly-menu-item ly-menu-item--artists"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>演奏者：</span><ArtistNames artists={currentArtists} onOpenArtist={openCurrentArtist} fallback={player.artist || '未知'} /></div>
            <button class="ly-menu-item" onclick={() => showMenu = false}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>专辑：{player.album || '未知'}</button>
            <button class="ly-menu-item" onclick={() => { showMenu = false; showCopied = true; setTimeout(() => showCopied = false, 2000) }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>分享</button>
            <button class="ly-menu-item" onclick={copyLink}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>复制链接</button>
          </div>
        </div>
      {/if}

      <!-- Playlist picker -->
      {#if showPlaylistPicker}
        <div class="ly-menu-backdrop" role="button" tabindex="0" aria-label="关闭" onclick={() => showPlaylistPicker = false} onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); showPlaylistPicker = false } }}>
          <div class="ly-menu" role="presentation" style="right:{menuRight}px;top:{menuY}px" onclick={(e) => e.stopPropagation()}>
            <div class="ly-menu-header">添加到歌单</div>
            {#each userPlaylists as pl (pl.id)}
              <button class="ly-menu-item" onclick={() => addToPlaylist(pl.id)}>{pl.name}</button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Local queue popup -->
      {#if showLocalQueue}
        <div class="ly-local-queue" role="presentation" onclick={(e) => e.stopPropagation()}>
          <QueuePanel show={true} mobileVisible={true} onClose={() => showLocalQueue = false} {onOpenArtist} />
        </div>
      {/if}

      <!-- ===== LEFT PANEL: Cover + Controls ===== -->
      <div class="ly-left">
        <div class="ly-left-cover">
          <div class="ly-cover-wrap" role="button" tabindex="0" onclick={() => lyricsMode = !lyricsMode} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lyricsMode = !lyricsMode } }}>
            <img class="ly-cover" src={coverUrl(player.cover, 600)} alt="" referrerpolicy="no-referrer" />
          </div>
          <div class="ly-track-wrap">
            <div class="ly-track-top"><div class="ly-track-title">{player.title || '未在播放'}</div></div>
            <div class="ly-track-sub">
              <div class="ly-track-info">
                <span class="ly-artist"><ArtistNames artists={currentArtists} onOpenArtist={openCurrentArtist} fallback={player.artist || ''} /></span>
                {#if player.artist && player.album}<span class="ly-sep">—</span>{/if}
                <span class="ly-album">{player.album || player.title || ''}</span>
              </div>
              <div class="ly-track-actions">
                <button class="ly-star-btn" class:active={liked} onclick={toggleLike} aria-label="喜欢">
                  {#if liked}
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  {:else}
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  {/if}
                </button>
                <button class="ly-menu-btn" bind:this={menuBtnEl} onclick={onMenuBtnClick} aria-label="菜单">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="3" cy="12" r="2.8"/><circle cx="12" cy="12" r="2.8"/><circle cx="21" cy="12" r="2.8"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="ly-left-controls">
          <ProgressBar currentTime={player.currentTime} duration={player.duration} disabled={!hasPlayableTrack} onseek={(t) => { player.seek(t) }} />

          <PlaybackControls
            variant="lyrics"
            mode={player.mode}
            playing={player.playing}
            loading={player.loading}
            disabled={!hasPlayableTrack}
            onshuffle={() => player.setMode(player.mode === 'shuffle' ? 'list' : 'shuffle')}
            onprev={() => player.prev()}
            onplaypause={() => player.togglePlay()}
            onnext={() => player.next()}
            onrepeat={() => player.setMode(player.mode === 'repeat' ? 'list' : 'repeat')}
          />

          <div class="ly-mobile-volume-row">
            <VolumeSlider volume={player.volume} disabled={false} onvolumechange={(v) => player.setVolume(v)} />
          </div>

          <!-- Mobile action buttons -->
          <div class="ly-mobile-action-row">
            <button class="ly-mobile-action-btn" class:active={showContextStrip} onclick={toggleContextStrip} aria-label="相关内容">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16"/><path d="M4 12h10"/><path d="M4 19h16"/></svg>
            </button>
            <button class="ly-mobile-action-btn" onclick={() => showLocalQueue = !showLocalQueue} aria-label="播放列表" disabled={!hasPlayableTrack}>
              <svg viewBox="0 0 48 48" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"><path stroke-linecap="round" d="M24 19h16m-16-9h16M8 38h32M8 28h32"/><path fill="currentColor" d="m8 10l8 5l-8 5z"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- ===== RIGHT PANEL: Lyrics + Context ===== -->
      <div class="ly-right">
        <div class="ly-right-panel">
          <div class="ly-lyrics-scroll" bind:this={lyricsEl}>
            {#if lyrics.length > 0}
              <div class="ly-lyrics-inner">
                {#each lyrics as line, i}
                  <button class="ly-line" class:active={i === highlightIndex} class:sung={i < highlightIndex} data-idx={i}
                    aria-current={i === highlightIndex ? 'true' : undefined}
                    onclick={() => { if (player.duration) player.seek(Math.max(0, Math.min(player.duration, line.time))) }}>
                    <span class="ly-line-text">
                      {#if line.words?.length}
                        {#each line.words as w, wi}<span class="ly-word" style="--i:{wi}">{w}</span>{wi < line.words.length - 1 ? '\u00A0' : ''}{/each}
                      {:else}{line.text || '...'}{/if}
                    </span>
                    {#if line.translation}<span class="ly-line-trans">{line.translation}</span>{/if}
                  </button>
                {/each}
              </div>
            {:else}
              <div class="ly-no-lyric">暂无歌词</div>
            {/if}
          </div>

          <!-- Context toggle & strip -->
          {#if extrasLoading || similarSongs.length > 0 || similarPlaylists.length > 0 || songComments.length > 0}
            <button class="ly-context-toggle" class:open={showContextStrip} onclick={toggleContextStrip} aria-label="相关内容">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.22.65.22 1h.29a2 2 0 0 1 0 4h-.29c0 .35-.08.69-.22 1Z"/></svg>
            </button>
            {#if showContextStrip}
              <button class="ly-context-scrim" aria-label="隐藏相关内容" onclick={closeContextStrip}></button>
              <div class="ly-context-strip">
                {#if extrasLoading}<div class="ly-context-card ly-context-loading">加载相关内容…</div>{/if}
                {#each similarSongs.slice(0,1) as track (track.id)}
                  <button class="ly-context-card ly-context-song" class:active={contextPanel==='songs'} onclick={()=>openContextPanel('songs')}>
                    {#if track.picUrl}<img src={coverUrl(track.picUrl,96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}
                    <span class="ly-context-copy"><small>相似歌曲</small><strong>{track.name}</strong><em><ArtistNames artists={track.ar||[]} onOpenArtist={(id)=>{onOpenArtist?.(id);onClose?.()}}/></em></span>
                  </button>
                {/each}
                {#if similarPlaylists.length>0}
                  <button class="ly-context-card ly-context-playlists" class:active={contextPanel==='playlists'} onclick={()=>openContextPanel('playlists')}>
                    <span class="ly-context-cover-stack">{#each similarPlaylists.slice(0,3) as pl (pl.id)}{#if pl.coverImgUrl}<img src={coverUrl(pl.coverImgUrl,96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{/if}{/each}</span>
                    <span class="ly-context-copy"><small>相似歌单</small><strong>{similarPlaylists[0]?.name}</strong><em>{similarPlaylists.length} 个灵感歌单</em></span>
                  </button>
                {/if}
                {#each songComments.slice(0,1) as c,i (c.commentId||i)}
                  <button class="ly-context-card ly-context-comment" class:active={contextPanel==='comments'} onclick={()=>openContextPanel('comments')}>
                    <span class="ly-context-copy"><small>热评 · {c.user?.nickname||'听众'}</small><strong>{c.content}</strong></span>
                  </button>
                {/each}
              </div>
              {#if contextPanel}
                <section class="ly-context-detail">
                  <div class="ly-context-detail-head"><span>{contextPanelTitle()}</span><button onclick={()=>{contextPanel=null;selectedSimilarPlaylist=null;selectedPlaylistTracks=[]}} aria-label="关闭">×</button></div>
                  {#if contextPanel==='songs'}
                    <div class="ly-context-detail-list">{#each similarSongs as track (track.id)}<button class="ly-context-detail-row" onclick={()=>playSimilarSong(track)}>{#if track.picUrl}<img src={coverUrl(track.picUrl,96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}<span><strong>{track.name}</strong><em><ArtistNames artists={track.ar||[]} onOpenArtist={(id)=>{onOpenArtist?.(id);onClose?.()}}/></em></span></button>{/each}</div>
                  {:else if contextPanel==='playlists'}
                    {#if selectedSimilarPlaylist}
                      <div class="ly-context-subhead"><button onclick={()=>{selectedSimilarPlaylist=null;selectedPlaylistTracks=[]}}>‹ 歌单</button><span>{selectedSimilarPlaylist.name}</span></div>
                      {#if selectedPlaylistLoading}<div class="ly-context-empty">加载歌单歌曲…</div>
                      {:else if selectedPlaylistTracks.length>0}<div class="ly-context-detail-list">{#each selectedPlaylistTracks as track (track.id)}<button class="ly-context-detail-row" onclick={()=>playSelectedPlaylistTrack(track)}>{#if track.picUrl}<img src={coverUrl(track.picUrl,96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}<span><strong>{track.name}</strong><em><ArtistNames artists={track.ar||[]} onOpenArtist={(id)=>{onOpenArtist?.(id);onClose?.()}}/></em></span></button>{/each}</div>
                      {:else}<div class="ly-context-empty">这个歌单暂时没有可预览的歌曲</div>{/if}
                    {:else}<div class="ly-context-detail-grid">{#each similarPlaylists as pl (pl.id)}<button class="ly-context-detail-playlist" onclick={()=>loadSimilarPlaylist(pl)}>{#if pl.coverImgUrl}<img src={coverUrl(pl.coverImgUrl,180)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}<strong>{pl.name}</strong></button>{/each}</div>{/if}
                  {:else if contextPanel==='comments'}
                    <div class="ly-context-comment-list">{#each songComments as c,i (c.commentId||i)}<article class="ly-context-comment-row"><strong>{c.user?.nickname||'听众'}</strong><p>{c.content}</p></article>{/each}</div>
                  {/if}
                </section>
              {/if}
            {/if}
          {/if}
        </div>
      </div>

      <!-- ===== MOBILE PANEL ===== -->
      <div class="ly-left ly-mobile-player" class:lyrics-mode={lyricsMode} class:context-open={contextPanel && !lyricsMode}>
        <!-- Same cover+controls as left panel but in mobile position -->
        <div class="ly-left-cover">
          <div class="ly-cover-wrap" role="button" tabindex="0" onclick={() => lyricsMode = !lyricsMode} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lyricsMode = !lyricsMode } }}>
            <img class="ly-cover" src={coverUrl(player.cover, 600)} alt="" referrerpolicy="no-referrer" />
          </div>
          <div class="ly-track-wrap">
            <div class="ly-track-top"><div class="ly-track-title">{player.title || '未在播放'}</div></div>
            <div class="ly-track-sub">
              <div class="ly-track-info">
                <span class="ly-artist"><ArtistNames artists={currentArtists} onOpenArtist={openCurrentArtist} fallback={player.artist || ''} /></span>
                {#if player.artist && player.album}<span class="ly-sep">—</span>{/if}
                <span class="ly-album">{player.album || player.title || ''}</span>
              </div>
              <div class="ly-track-actions">
                <button class="ly-star-btn" class:active={liked} onclick={toggleLike} aria-label="喜欢">
                  {#if liked}
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  {:else}
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  {/if}
                </button>
                <button class="ly-menu-btn" bind:this={menuBtnEl} onclick={onMenuBtnClick} aria-label="菜单">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="3" cy="12" r="2.8"/><circle cx="12" cy="12" r="2.8"/><circle cx="21" cy="12" r="2.8"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="ly-left-controls">
          <ProgressBar currentTime={player.currentTime} duration={player.duration} disabled={!hasPlayableTrack} onseek={(t) => { player.seek(t) }} />
          <PlaybackControls variant="lyrics" mode={player.mode} playing={player.playing} loading={player.loading}
            disabled={!hasPlayableTrack}
            onshuffle={() => player.setMode(player.mode === 'shuffle' ? 'list' : 'shuffle')}
            onprev={() => player.prev()} onplaypause={() => player.togglePlay()} onnext={() => player.next()}
            onrepeat={() => player.setMode(player.mode === 'repeat' ? 'list' : 'repeat')} />
          <div class="ly-mobile-volume-row">
            <VolumeSlider volume={player.volume} onvolumechange={(v) => player.setVolume(v)} />
          </div>
          <div class="ly-mobile-action-row">
            <button class="ly-mobile-action-btn" class:active={showContextStrip} onclick={toggleContextStrip} aria-label="相关内容">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16"/><path d="M4 12h10"/><path d="M4 19h16"/></svg>
            </button>
            <button class="ly-mobile-action-btn" onclick={() => showLocalQueue = !showLocalQueue} aria-label="播放列表" disabled={!hasPlayableTrack}>
              <svg viewBox="0 0 48 48" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"><path stroke-linecap="round" d="M24 19h16m-16-9h16M8 38h32M8 28h32"/><path fill="currentColor" d="m8 10l8 5l-8 5z"/></svg>
            </button>
          </div>
        </div>
        <!-- Mobile context strip -->
        {#if !lyricsMode && (extrasLoading || similarSongs.length > 0 || similarPlaylists.length > 0 || songComments.length > 0)}
          <div class="ly-mobile-context">
            <div class="ly-context-strip">
              {#if extrasLoading}<div class="ly-context-card ly-context-loading">加载相关内容…</div>{/if}
              {#each similarSongs.slice(0,1) as track (track.id)}
                <button class="ly-context-card ly-context-song" class:active={contextPanel==='songs'} onclick={()=>openContextPanel('songs')}>
                  {#if track.picUrl}<img src={coverUrl(track.picUrl,96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}
                  <span class="ly-context-copy"><small>相似歌曲</small><strong>{track.name}</strong><em><ArtistNames artists={track.ar||[]} onOpenArtist={(id)=>{onOpenArtist?.(id);onClose?.()}}/></em></span>
                </button>
              {/each}
              {#if similarPlaylists.length>0}
                <button class="ly-context-card ly-context-playlists" class:active={contextPanel==='playlists'} onclick={()=>openContextPanel('playlists')}>
                  <span class="ly-context-cover-stack">{#each similarPlaylists.slice(0,3) as pl (pl.id)}{#if pl.coverImgUrl}<img src={coverUrl(pl.coverImgUrl,96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{/if}{/each}</span>
                  <span class="ly-context-copy"><small>相似歌单</small><strong>{similarPlaylists[0]?.name}</strong><em>{similarPlaylists.length} 个灵感歌单</em></span>
                </button>
              {/if}
              {#each songComments.slice(0,1) as c,i (c.commentId||i)}
                <button class="ly-context-card ly-context-comment" class:active={contextPanel==='comments'} onclick={()=>openContextPanel('comments')}>
                  <span class="ly-context-copy"><small>热评 · {c.user?.nickname||'听众'}</small><strong>{c.content}</strong></span>
                </button>
              {/each}
            </div>
            {#if contextPanel}
              <section class="ly-context-detail">
                <div class="ly-context-detail-head"><span>{contextPanelTitle()}</span><button onclick={()=>{contextPanel=null;selectedSimilarPlaylist=null;selectedPlaylistTracks=[]}} aria-label="关闭">×</button></div>
                {#if contextPanel==='songs'}
                  <div class="ly-context-detail-list">{#each similarSongs as track (track.id)}<button class="ly-context-detail-row" onclick={()=>playSimilarSong(track)}>{#if track.picUrl}<img src={coverUrl(track.picUrl,96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}<span><strong>{track.name}</strong><em><ArtistNames artists={track.ar||[]} onOpenArtist={(id)=>{onOpenArtist?.(id);onClose?.()}}/></em></span></button>{/each}</div>
                {:else if contextPanel==='playlists'}
                  {#if selectedSimilarPlaylist}
                    <div class="ly-context-subhead"><button onclick={()=>{selectedSimilarPlaylist=null;selectedPlaylistTracks=[]}}>‹ 歌单</button><span>{selectedSimilarPlaylist.name}</span></div>
                    {#if selectedPlaylistLoading}<div class="ly-context-empty">加载歌单歌曲…</div>
                    {:else if selectedPlaylistTracks.length>0}<div class="ly-context-detail-list">{#each selectedPlaylistTracks as track (track.id)}<button class="ly-context-detail-row" onclick={()=>playSelectedPlaylistTrack(track)}>{#if track.picUrl}<img src={coverUrl(track.picUrl,96)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}<span><strong>{track.name}</strong><em><ArtistNames artists={track.ar||[]} onOpenArtist={(id)=>{onOpenArtist?.(id);onClose?.()}}/></em></span></button>{/each}</div>
                    {:else}<div class="ly-context-empty">这个歌单暂时没有可预览的歌曲</div>{/if}
                  {:else}<div class="ly-context-detail-grid">{#each similarPlaylists as pl (pl.id)}<button class="ly-context-detail-playlist" onclick={()=>loadSimilarPlaylist(pl)}>{#if pl.coverImgUrl}<img src={coverUrl(pl.coverImgUrl,180)} alt="" loading="lazy" referrerpolicy="no-referrer"/>{:else}<span class="ly-context-cover-ph">♫</span>{/if}<strong>{pl.name}</strong></button>{/each}</div>{/if}
                {:else if contextPanel==='comments'}
                  <div class="ly-context-comment-list">{#each songComments as c,i (c.commentId||i)}<article class="ly-context-comment-row"><strong>{c.user?.nickname||'听众'}</strong><p>{c.content}</p></article>{/each}</div>
                {/if}
              </section>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Toast -->
      {#if showCopied}
        <div class="ly-toast">{toastText}</div>
      {/if}
    </div>
  </div>
{/if}
