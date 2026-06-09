<script>
  import { player } from '../stores/player.svelte.js'
  import { auth } from '../stores/auth.svelte.js'
  import { ncm } from '../api/client.js'
  import { parseLyricResponse } from '../utils/lyrics.js'
  import Spinner from './Spinner.svelte'

  let { show = false, onClose } = $props()

  let lyrics = $state([])
  let highlightIndex = $state(0)
  let lyricsEl = $state(null)
  let timer
  let animating = $state(false)
  let mounted = $state(false)
  let showMenu = $state(false)
  let liked = $state(false)
  let showPlaylistPicker = $state(false)
  let userPlaylists = $state([])
  let showCopied = $state(false)
  let bgCoverStyle = $state('')

  $effect(() => {
    if (show) {
      animating = true
      document.body.style.overflow = 'hidden'
      setTimeout(() => { mounted = true }, 10)
      startTimer()
      checkLiked()
    } else {
      mounted = false
      setTimeout(() => {
        document.body.style.overflow = ''
        animating = false
      }, 400)
      stopTimer()
      lyrics = []
      highlightIndex = 0
      showMenu = false
      showPlaylistPicker = false
    }
  })

  $effect(() => {
    if (show && player.id) fetchLyrics()
  })

  $effect(() => {
    if (show && player.cover) updateBackground()
  })

  function onKeydown(e) {
    if (!show) return
    if (e.key === 'Escape') onClose?.()
  }

  function updateBackground() {
    bgCoverStyle = player.cover ? `--bg-cover:url('${player.cover}')` : ''
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
    liked = !liked
    ncm.like(player.id, liked).catch(() => { liked = !liked })
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

  function scrollToLine(idx) {
    if (!lyricsEl) return
    const line = lyricsEl.querySelector(`[data-idx="${idx}"]`)
    if (line) {
      line.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
    player.seek(time)
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

  function onProgressClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    player.seek(pct * player.duration)
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
      await fetch(`http://localhost:3456/playlist/tracks?op=add&id=${plId}&tracks=${player.id}${auth._getCookie ? '&cookie=' + auth._getCookie() : ''}`)
      showPlaylistPicker = false
      showMenu = false
      showCopied = true
      setTimeout(() => showCopied = false, 2000)
    } catch {}
  }

  function copyLink() {
    navigator.clipboard?.writeText(`https://music.163.com/#/song?id=${player.id}`).catch(() => {})
    showCopied = true
    setTimeout(() => showCopied = false, 2000)
    showMenu = false
  }

  function openPlaylistPicker() {
    showMenu = false
    showPlaylistPicker = true
    loadPlaylists()
  }

  function closeMenu(e) {
    if (e.target === e.currentTarget) {
      showMenu = false
      showPlaylistPicker = false
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if show && animating}
  <div
    class="ly-fullscreen"
    class:mounted
    style={bgCoverStyle}
    onclick={onClose}
  >
    <div class="ly-container" onclick={(e) => e.stopPropagation()}>

      <button class="ly-back-btn" onclick={onClose} aria-label="关闭">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 15l5-5 5 5"/></svg>
      </button>

      <!-- Left: Cover + Track info + Controls -->
      <div class="ly-left">
        <div class="ly-left-cover">
          <div class="ly-cover-wrap">
            <img class="ly-cover" src={(player.cover || '') + '?param=600y600'} alt="" />
          </div>
          <div class="ly-track-wrap">
            <div class="ly-track-top">
              <div class="ly-track-title">{player.title || '未在播放'}</div>
               <button class="ly-star-btn" class:active={liked} onclick={toggleLike} aria-label="喜欢">
                 {#if liked}
                   <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                 {:else}
                   <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
                 {/if}
               </button>
              <div class="ly-menu-wrap">
                <button class="ly-menu-btn" onclick={() => showMenu = !showMenu} aria-label="菜单">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                </button>
                {#if showMenu}
                  <div class="ly-menu">
                    <div class="ly-menu-header">{player.title || '未知歌曲'}</div>
                    <button class="ly-menu-item" onclick={openPlaylistPicker}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      添加到歌单
                    </button>
                    <button class="ly-menu-item">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                      演奏者：{player.artist || '未知'}{player.artist ? ' (' + player.artist + ')' : ''}
                    </button>
                    <button class="ly-menu-item" onclick={() => { showMenu = false }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      专辑：{player.title || '未知'}
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
                {/if}
              </div>
            </div>
            <div class="ly-track-sub">
              <span class="ly-artist">{player.artist || ''}</span>
              {#if player.artist && player.album}
                <span class="ly-sep">—</span>
              {/if}
              <span class="ly-album">{player.album || player.title || ''}</span>
            </div>
          </div>
        </div>
        <div class="ly-left-controls">
          <div class="ly-progress-row">
            <span class="ly-time">{fmt(player.currentTime)}</span>
            <div class="ly-progress-track" onclick={onProgressClick}>
              <div class="ly-progress-fill" style="width:{getProgress()}%"></div>
            </div>
            <span class="ly-time">{fmtRemaining(player.duration)}</span>
          </div>
          <div class="ly-play-row">
            <button class="ly-ctrl-btn" class:active={player.mode === 'shuffle'} onclick={() => player.setMode(player.mode === 'shuffle' ? 'list' : 'shuffle')} aria-label="随机播放">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
            </button>
            <button class="ly-ctrl-btn" onclick={() => player.prev()} aria-label="上一首">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="19,20 9,12 19,4"/><line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
            <button class="ly-play-btn" onclick={() => player.togglePlay()} aria-label={player.playing ? '暂停' : '播放'}>
              {#if player.loading}
                <div style="display:flex;align-items:center;justify-content:center;height:100px;">
                  <Spinner size="md" />
                </div>
              {:else if player.playing}
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              {:else}
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
              {/if}
            </button>
            <button class="ly-ctrl-btn" onclick={() => player.next()} aria-label="下一首">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
            <button class="ly-ctrl-btn" class:active={player.mode === 'repeat'} onclick={() => player.setMode(player.mode === 'repeat' ? 'list' : 'repeat')} aria-label="单曲循环">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Right: Lyrics -->
      <div class="ly-right">
        <div class="ly-right-panel">
          <div class="ly-lyrics-scroll" bind:this={lyricsEl}>
          {#if lyrics.length > 0}
            <div class="ly-lyrics-pad"></div>
            {#each lyrics as line, i}
              <button
                class="ly-line"
                class:active={i === highlightIndex}
                class:sung={i < highlightIndex}
                data-idx={i}
                aria-current={i === highlightIndex ? 'true' : undefined}
                onclick={() => seekTo(line.time)}
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
            <div class="ly-lyrics-pad"></div>
          {:else}
            <div class="ly-no-lyric">暂无歌词</div>
          {/if}
          </div>
        </div>
      </div>

      <!-- Top-right: Volume -->
      <div class="ly-volume-area">
        <button class="ly-vol-btn" onclick={() => player.setVolume(player.volume > 0 ? 0 : 1)} aria-label="音量">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        </button>
        <div class="ly-vol-track" onclick={(e) => {
          const pct = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.offsetWidth
          player.setVolume(Math.max(0, Math.min(1, pct)))
        }}>
          <div class="ly-vol-fill" style="width:{player.volume * 100}%"></div>
        </div>
      </div>


    </div>

    {#if showCopied}
      <div class="ly-toast">已复制</div>
    {/if}

    {#if showPlaylistPicker}
      <div class="ly-picker-overlay" onclick={closeMenu}>
        <div class="ly-picker" onclick={(e) => e.stopPropagation()}>
          <div class="ly-picker-header">
            <span>添加到歌单</span>
            <button onclick={() => showPlaylistPicker = false}>✕</button>
          </div>
          <div class="ly-picker-list">
            {#each userPlaylists as pl}
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
            {/each}
          </div>
        </div>
      </div>
    {/if}

  </div>
{/if}
