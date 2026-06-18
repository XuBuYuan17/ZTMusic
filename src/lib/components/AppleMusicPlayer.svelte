<script>
  import { player } from '../stores/player.svelte.js';
  import { ncm } from '../api/client.js';
  import { coverUrl } from '../utils/image.js';
  import { parseLyricResponse, parseYrc } from '../utils/lyrics.js';
  import AppleMusicControls from './AppleMusicControls.svelte';
  import AppleMusicProgressBar from './AppleMusicProgressBar.svelte';
  import ArtistNames from './ArtistNames.svelte';
  import QueuePanel from './QueuePanel.svelte';

  let { onClose, onOpenArtist, showLocalQueue = false, toggleLocalQueue } = $props();

  let lyricsMode = $state(false);
  let entered = $state(false);
  let lyricsEl = $state(null);

  let currentArtists = $derived(player.currentTrack?.ar || []);

  // ---- Enter animation on mount ----
  $effect(() => {
    setTimeout(() => { entered = true; }, 30);
  });

  // ---- Lyrics ----
  let lyrics = $state([]);
  let yrcLines = $state([]);
  let _lyricReqId = 0;

  let highlightIndex = $derived.by(() => {
    if (lyrics.length === 0) return -1;
    const now = player.currentTime;
    for (let i = lyrics.length - 1; i >= 0; i--) if (now >= lyrics[i].time) return i;
    return -1;
  });

  function splitWords(text = '') {
    return (text || '').trim().split(/\s+/).map(w => w.trim()).filter(Boolean);
  }

  async function fetchLyrics() {
    const id = player.id;
    if (!id) { lyrics = []; yrcLines = []; return; }
    const reqId = ++_lyricReqId;
    try {
      const res = await ncm.lyric(id).catch(() => null);
      if (reqId !== _lyricReqId || player.id !== id) return;
      const base = parseLyricResponse(res || {});
      lyrics = base.lines.map(l => ({
        time: l.time, text: l.content,
        translation: l.translation,
        words: l.content ? splitWords(l.content) : [],
      }));
    } catch {}
    try {
      const newRes = await ncm.lyricNew(id).catch(() => null);
      if (reqId !== _lyricReqId || player.id !== id) return;
      if (newRes?.yrc?.lyric) {
        const yrc = parseYrc(newRes.yrc.lyric);
        if (yrc.length > 0) yrcLines = yrc;
      }
    } catch {}
  }

  // ---- Fetch lyrics on mount and when track changes ----
  $effect(() => {
    const id = player.id;
    if (!id) { lyrics = []; yrcLines = []; return; }
    lyrics = []; yrcLines = [];
    fetchLyrics();
  });

  // ---- Auto-scroll lyrics ----
  $effect(() => {
    if (!lyricsMode || !lyricsEl) return;
    const idx = highlightIndex;
    if (idx < 0) return;
    const lines = lyricsEl.querySelectorAll('.am-lyric-line');
    const target = lines[idx];
    if (target) {
      const container = lyricsEl;
      const offset = target.offsetTop - container.clientHeight / 2 + target.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
    }
  });

  function toggleLyricsMode() {
    lyricsMode = !lyricsMode;
  }
</script>

<div class="apple-music-player" class:lyrics-mode={lyricsMode} class:entered={entered}>

  <!-- Blurred background layers -->
  <div class="am-bg">
    <div class="am-bg-cover" style="background-image: url({coverUrl(player.cover, 600)})"></div>
    <div class="am-bg-overlay"></div>
  </div>

  <!-- ===== TOP BAR ===== -->
  <div class="am-top-bar">
    <button class="am-close-btn" onclick={onClose} aria-label="关闭">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <div class="am-page-title">正在播放</div>
    <button class="am-queue-btn" onclick={() => toggleLocalQueue?.()} aria-label="播放列表">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 5h16M4 11h16M4 17h10"/>
        <path fill="currentColor" d="m14 14l5 3.5l-5 3.5z"/>
      </svg>
    </button>
  </div>

  <!-- ===== CONTROLS MODE ===== -->
  <div class="am-controls-mode">
    <!-- Cover art area -->
    <div class="am-cover-area">
      <div class="am-cover-shadow"></div>
      <div class="am-cover-wrap" role="button" tabindex="0" onclick={toggleLyricsMode}
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); toggleLyricsMode(); } }}>
        <img class="am-cover" src={coverUrl(player.cover, 600)} alt=""
          referrerpolicy="no-referrer" />
      </div>
      <!-- Tap hint -->
      <div class="am-cover-hint">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        <span>查看歌词</span>
      </div>
    </div>

    <!-- Track info -->
    <div class="am-track-info">
      <div class="am-track-title">{player.title || '未在播放'}</div>
      <div class="am-track-artist">
        <ArtistNames artists={currentArtists} onOpenArtist={onOpenArtist} fallback={player.artist || ''} />
      </div>
    </div>

    <!-- Controls -->
    <div class="am-controls">
      <AppleMusicProgressBar currentTime={player.currentTime} duration={player.duration} disabled={!player.id} onseek={(t) => { player.seek(t) }} />
      <AppleMusicControls onqueue={toggleLocalQueue} showQueue={showLocalQueue} />
    </div>

    <!-- Bottom options -->
    <div class="am-bottom-options">
      <button class="am-option-btn" aria-label="音量">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 5L6 9H2v6h4l5 4V5z"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
      </button>
      <button class="am-option-btn" aria-label="隔空播放">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"/>
          <polygon points="12 15 17 21 7 21 12 15"/>
        </svg>
      </button>
      <button class="am-option-btn" aria-label="分享">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      </button>
      <button class="am-option-btn" aria-label="更多">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- ===== LYRICS MODE OVERLAY ===== -->
  {#if lyricsMode}
    <div class="am-lyrics-overlay">
      <!-- Mini player header -->
      <div class="am-lyrics-header">
        <div class="am-lyrics-cover-wrap" role="button" tabindex="0" onclick={toggleLyricsMode}
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); toggleLyricsMode(); } }}>
          <img class="am-lyrics-cover" src={coverUrl(player.cover, 120)} alt="" referrerpolicy="no-referrer" />
        </div>
        <div class="am-lyrics-track">
          <div class="am-lyrics-badge">正在播放</div>
          <div class="am-lyrics-title">{player.title || ''}</div>
          <div class="am-lyrics-artist">
            <ArtistNames artists={currentArtists} onOpenArtist={onOpenArtist} fallback={player.artist || ''} />
          </div>
        </div>
        <button class="am-lyrics-queue-btn" onclick={() => toggleLocalQueue?.()} aria-label="播放列表">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M4 5h16M4 11h16M4 17h10"/>
            <path fill="currentColor" d="m14 14l5 3.5l-5 3.5z"/>
          </svg>
        </button>
      </div>

      <!-- Lyrics scroll area -->
      <div class="am-lyrics-area" bind:this={lyricsEl}>
        <div class="am-lyrics-inner">
          {#if lyrics.length > 0}
            {#each lyrics as line, i}
              <button class="am-lyric-line" class:active={i === highlightIndex} class:before={i < highlightIndex}
                aria-current={i === highlightIndex ? 'true' : undefined}
                onclick={() => { if (player.duration) player.seek(Math.max(0, Math.min(player.duration, line.time))); }}>
                <span class="am-lyric-text">{line.text || '...'}</span>
                {#if line.translation}
                  <span class="am-lyric-trans">{line.translation}</span>
                {/if}
              </button>
            {/each}
          {:else}
            <div class="am-no-lyric">暂无歌词</div>
          {/if}
        </div>
      </div>

      <!-- Mini controls in lyrics mode -->
      <div class="am-lyrics-controls">
        <button class="am-lyrics-ctrl" onclick={() => player.prev()} aria-label="上一首">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button class="am-lyrics-play" onclick={() => player.togglePlay()} aria-label={player.playing ? '暂停' : '播放'}>
          {#if player.playing}
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          {/if}
        </button>
        <button class="am-lyrics-ctrl" onclick={() => player.next()} aria-label="下一首">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Queue Panel -->
  {#if showLocalQueue}
    <div class="am-queue-panel" role="presentation" onclick={(e) => e.stopPropagation()}>
      <QueuePanel show={true} mobileVisible={true} onClose={toggleLocalQueue} onOpenArtist={onOpenArtist} />
    </div>
  {/if}
</div>

<style>
  /* =========================================================
     APPLE MUSIC MOBILE PLAYER — Full-screen music player
     ========================================================= */

  .apple-music-player {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }

  /* ---- Blurred Background ---- */
  .am-bg {
    position: absolute;
    inset: -40px;
    z-index: 0;
    overflow: hidden;
  }
  .am-bg-cover {
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    filter: blur(80px) saturate(1.4);
    transform: scale(1.1);
    transition: background-image 0.6s ease;
  }
  .am-bg-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.85) 100%);
  }

  /* ---- Top Bar ---- */
  .am-top-bar {
    position: relative;
    z-index: 20;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }
  .am-close-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.12);
    border: none;
    border-radius: 50%;
    color: #fff;
    cursor: pointer;
    transition: all 0.2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .am-close-btn:active {
    background: rgba(255,255,255,0.25);
    transform: scale(0.92);
  }
  .am-close-btn svg { width: 18px; height: 18px; }
  .am-page-title {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.7);
    letter-spacing: 0.3px;
  }
  .am-queue-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.7);
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .am-queue-btn:active {
    background: rgba(255,255,255,0.15);
    transform: scale(0.92);
  }

  /* =========================================================
     CONTROLS MODE
     ========================================================= */
  .am-controls-mode {
    position: relative;
    z-index: 10;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0 24px 24px;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .entered .am-controls-mode {
    opacity: 1;
    transform: translateY(0);
  }

  /* ---- Cover Art ---- */
  .am-cover-area {
    position: relative;
    width: min(100%, 300px);
    aspect-ratio: 1;
    margin-bottom: 24px;
  }
  .am-cover-shadow {
    position: absolute;
    inset: 0;
    border-radius: 16px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.6);
    transition: all 0.3s;
  }
  .am-cover-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    transform: scale(0.85);
    opacity: 0;
    transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .entered .am-cover-wrap {
    transform: scale(1);
    opacity: 1;
  }
  .am-cover-wrap:active {
    transform: scale(0.96) !important;
  }
  .am-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .am-cover-hint {
    position: absolute;
    bottom: -28px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: rgba(255,255,255,0.4);
    opacity: 0;
    transition: opacity 0.3s ease 0.6s;
    pointer-events: none;
  }
  .entered .am-cover-hint {
    opacity: 1;
  }

  /* ---- Track Info ---- */
  .am-track-info {
    width: 100%;
    max-width: 340px;
    text-align: center;
    margin-bottom: 16px;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.4s ease 0.15s, transform 0.4s ease 0.15s;
  }
  .entered .am-track-info {
    opacity: 1;
    transform: translateY(0);
  }
  .am-track-title {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 4px;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .am-track-artist {
    font-size: 14px;
    color: rgba(255,255,255,0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ---- Controls ---- */
  .am-controls {
    width: 100%;
    max-width: 340px;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.4s ease 0.25s, transform 0.4s ease 0.25s;
  }
  .entered .am-controls {
    opacity: 1;
    transform: translateY(0);
  }

  /* ---- Bottom Options ---- */
  .am-bottom-options {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    max-width: 340px;
    margin-top: 8px;
    padding: 0 8px;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.4s ease 0.35s, transform 0.4s ease 0.35s;
  }
  .entered .am-bottom-options {
    opacity: 1;
    transform: translateY(0);
  }
  .am-option-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.5);
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .am-option-btn:active {
    color: #fff;
    background: rgba(255,255,255,0.12);
  }

  /* =========================================================
     LYRICS MODE
     ========================================================= */
  .apple-music-player.lyrics-mode .am-controls-mode {
    opacity: 0;
    transform: translateY(-10px) scale(0.98);
    pointer-events: none;
    transition: opacity 0.25s ease, transform 0.3s ease;
  }

  .am-lyrics-overlay {
    position: absolute;
    inset: 0;
    z-index: 15;
    display: flex;
    flex-direction: column;
    background: transparent;
    animation: amLyricsFadeIn 0.35s ease;
  }
  @keyframes amLyricsFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* ---- Lyrics Header ---- */
  .am-lyrics-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    flex-shrink: 0;
    animation: amLyricsSlideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes amLyricsSlideDown {
    from { transform: translateY(-20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .am-lyrics-cover-wrap {
    width: 56px;
    height: 56px;
    border-radius: 10px;
    overflow: hidden;
    flex-shrink: 0;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    transition: transform 0.2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .am-lyrics-cover-wrap:active { transform: scale(0.94); }
  .am-lyrics-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .am-lyrics-track {
    flex: 1;
    min-width: 0;
  }
  .am-lyrics-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    color: #fa243c;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
    text-transform: uppercase;
  }
  .am-lyrics-title {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }
  .am-lyrics-artist {
    font-size: 12px;
    color: rgba(255,255,255,0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .am-lyrics-queue-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.5);
    cursor: pointer;
    border-radius: 50%;
    flex-shrink: 0;
    transition: all 0.2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .am-lyrics-queue-btn:active {
    color: #fff;
    background: rgba(255,255,255,0.12);
  }

  /* ---- Lyrics Area ---- */
  .am-lyrics-area {
    flex: 1;
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 20px 24px;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    mask-image: linear-gradient(to bottom, transparent 0%, #000 10%, #000 85%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 10%, #000 85%, transparent 100%);
  }
  .am-lyrics-area::-webkit-scrollbar { display: none; }

  .am-lyrics-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 0;
    min-height: 100%;
    justify-content: center;
  }

  .am-lyric-line {
    display: block;
    width: 100%;
    max-width: 360px;
    text-align: center;
    background: none;
    border: none;
    padding: 12px 8px;
    cursor: pointer;
    transition: all 0.25s ease;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    border-radius: 8px;
  }
  .am-lyric-line:active {
    background: rgba(255,255,255,0.06);
  }
  .am-lyric-text {
    display: block;
    font-size: 15px;
    font-weight: 450;
    color: rgba(255,255,255,0.3);
    line-height: 1.5;
    transition: all 0.3s ease;
  }
  .am-lyric-line.before .am-lyric-text {
    color: rgba(255,255,255,0.5);
  }
  .am-lyric-line.active .am-lyric-text {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
  }
  .am-lyric-trans {
    display: block;
    font-size: 13px;
    font-weight: 400;
    color: rgba(255,255,255,0.25);
    margin-top: 4px;
    transition: all 0.3s ease;
  }
  .am-lyric-line.active .am-lyric-trans {
    color: rgba(255,255,255,0.5);
  }
  .am-no-lyric {
    font-size: 15px;
    color: rgba(255,255,255,0.3);
    text-align: center;
    padding: 40px 0;
  }

  /* ---- Mini Controls in Lyrics Mode ---- */
  .am-lyrics-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 32px;
    padding: 12px 16px 24px;
    flex-shrink: 0;
    animation: amLyricsSlideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes amLyricsSlideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .am-lyrics-ctrl {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.6);
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .am-lyrics-ctrl:active {
    color: #fff;
    background: rgba(255,255,255,0.12);
    transform: scale(0.92);
  }
  .am-lyrics-play {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.15);
    border: none;
    color: #fff;
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.2s ease;
    -webkit-tap-highlight-color: transparent;
    backdrop-filter: blur(8px);
  }
  .am-lyrics-play:active {
    background: rgba(255,255,255,0.25);
    transform: scale(0.92);
  }

  /* ---- Queue Panel ---- */
  .am-queue-panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(360px, 85vw);
    z-index: 30;
    background: rgba(0,0,0,0.9);
    backdrop-filter: blur(20px);
    display: flex;
    animation: amQueueSlideIn 0.3s ease;
  }
  @keyframes amQueueSlideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .am-queue-panel > :global(*) {
    width: 100%;
  }
</style>
