<script>
  import { player } from '../stores/player.svelte.js';
  import { ncm } from '../api/client.js';
  import { coverUrl } from '../utils/image.js';
  import { parseLyricResponse, parseYrc } from '../utils/lyrics.js';
  import AppleMusicControls from './AppleMusicControls.svelte';
  import AppleMusicProgressBar from './AppleMusicProgressBar.svelte';
  import VolumeSlider from './VolumeSlider.svelte';
  import ArtistNames from './ArtistNames.svelte';
  import QueuePanel from './QueuePanel.svelte';

  let { onClose, onOpenArtist, showLocalQueue = false, toggleLocalQueue } = $props();

  let lyricsMode = $state(false);
  let entered = $state(false);
  let closing = $state(false);
  let lyricsEl = $state(null);

  let currentArtists = $derived(player.currentTrack?.ar || []);

  // ---- Enter animation on mount ----
  $effect(() => {
    setTimeout(() => { entered = true; }, 30);
  });

  function handleClose() {
    closing = true;
    setTimeout(() => { onClose?.(); }, 220);
  }

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
      const offset = target.offsetTop - container.clientHeight * 0.25 + target.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
    }
  });

  function toggleLyricsMode() {
    lyricsMode = !lyricsMode;
  }
</script>

<div class="apple-music-player" class:lyrics-mode={lyricsMode} class:entered={entered} class:closing={closing}>

  <!-- Blurred background -->
  <div class="am-bg">
    <div class="am-bg-cover" style="background-image: url({coverUrl(player.cover, 600)})"></div>
    <div class="am-bg-overlay"></div>
  </div>

  <!-- Close button (top-right) -->
  <button class="am-close-btn" onclick={handleClose} aria-label="关闭">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>

  <!-- Flying cover -->
  <div class="am-flying-cover" role="button" tabindex="0"
    onclick={toggleLyricsMode}
    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); toggleLyricsMode(); } }}>
    <img class="am-flying-cover-img" src={coverUrl(player.cover, 400)} alt="" referrerpolicy="no-referrer" />
  </div>

  <!-- Track info (controls mode, left-aligned with cover) -->
  <div class="am-track-info">
    <div class="am-track-title">{player.title || '未在播放'}</div>
    <div class="am-track-artist">
      <ArtistNames artists={currentArtists} onOpenArtist={onOpenArtist} fallback={player.artist || ''} />
    </div>
  </div>

  <!-- Corner info (lyrics mode only, top-left) -->
  <div class="am-corner-info">
    <div class="am-corner-title">{player.title || ''}</div>
    <div class="am-corner-artist">
      <ArtistNames artists={currentArtists} onOpenArtist={onOpenArtist} fallback={player.artist || ''} />
    </div>
  </div>

  <!-- Bottom controls (no background) -->
  <div class="am-bottom-controls">
    <div class="am-bottom-progress">
      <AppleMusicProgressBar currentTime={player.currentTime} duration={player.duration} disabled={!player.id} onseek={(t) => { player.seek(t) }} />
    </div>
    <AppleMusicControls onqueue={toggleLocalQueue} showQueue={showLocalQueue} />
    <div class="am-volume-row">
      <VolumeSlider volume={player.volume} disabled={!player.id} onvolumechange={(v) => player.setVolume(v)} />
    </div>
  </div>

  <!-- Lyrics area -->
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

  <!-- Queue Panel -->
  {#if showLocalQueue}
    <div class="am-queue-panel" role="presentation" onclick={(e) => e.stopPropagation()}>
      <QueuePanel show={true} mobileVisible={true} onClose={toggleLocalQueue} onOpenArtist={onOpenArtist} />
    </div>
  {/if}
</div>

<style>
  .apple-music-player {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: block;
    overflow: hidden;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    opacity: 1;
    transition: opacity 0.25s cubic-bezier(0.32, 0.94, 0.6, 1), transform 0.25s cubic-bezier(0.32, 0.94, 0.6, 1);
    transform: scale(1);
  }
  .apple-music-player.closing {
    opacity: 0;
    transform: scale(0.96);
  }

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

  /* ---- Close Button ---- */
  .am-close-btn {
    position: absolute;
    top: 22px;
    right: 16px;
    z-index: 15;
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
  }
  .am-close-btn:active {
    background: rgba(255,255,255,0.25);
    transform: scale(0.92);
  }

  /* ---- Flying Cover ---- */
  .am-flying-cover {
    position: absolute;
    z-index: 10;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 8px 30px rgba(0,0,0,0.6);
    cursor: pointer;
    transition: all 0.45s cubic-bezier(0.25, 0.1, 0.25, 1);
    -webkit-tap-highlight-color: transparent;
    top: calc(50% - 120px - 40px);
    left: calc(50% - 120px);
    width: 240px;
    height: 240px;
  }
  .am-flying-cover:active {
    transform: scale(0.96) !important;
  }
  .lyrics-mode .am-flying-cover {
    top: 18px;
    left: 18px;
    width: 62px;
    height: 62px;
    border-radius: 12px;
  }
  .am-flying-cover {
    opacity: 0;
    transform: scale(0.85);
  }
  .entered .am-flying-cover {
    opacity: 1;
    transform: scale(1);
  }
  .closing .am-flying-cover {
    opacity: 0 !important;
    transform: scale(0.7) translateY(40px) !important;
    transition: all 0.18s ease !important;
  }
  .am-flying-cover-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* ---- Track Info ---- */
  .am-track-info {
    position: absolute;
    z-index: 10;
    top: calc(50% + 120px - 40px + 16px);
    left: calc(50% - 120px);
    width: 240px;
    text-align: left;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.35s ease 0.12s, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.12s;
  }
  .entered .am-track-info {
    opacity: 1;
    transform: translateY(0);
  }
  .lyrics-mode .am-track-info {
    opacity: 0;
    pointer-events: none;
  }
  .am-track-title {
    font-size: 24px;
    font-weight: 800;
    color: #fff;
    margin-bottom: 4px;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .am-track-artist {
    font-size: 16px;
    font-weight: 500;
    color: #b3b3b7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ---- Corner Info ---- */
  .am-corner-info {
    position: absolute;
    top: 20px;
    left: 92px;
    right: 56px;
    z-index: 11;
    text-align: left;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }
  .lyrics-mode .am-corner-info {
    opacity: 1;
    pointer-events: auto;
  }
  .am-corner-title {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .am-corner-artist {
    font-size: 14px;
    color: #b3b3b7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  /* ---- Bottom Controls ---- */
  .am-bottom-controls {
    position: absolute;
    z-index: 10;
    top: calc(50% + 120px - 40px + 16px + 60px + 20px);
    left: 14px;
    right: 14px;
    background: transparent;
    backdrop-filter: none;
    border: none;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.35s ease 0.22s, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.22s;
  }
  .entered .am-bottom-controls {
    opacity: 1;
    transform: translateY(0);
  }
  .lyrics-mode .am-bottom-controls {
    opacity: 0;
    transform: translateY(15px);
    pointer-events: none;
  }
  .am-bottom-progress {
    width: 100%;
  }

  .am-volume-row {
    width: 100%;
    padding: 6px 16px 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .am-volume-row .vs {
    width: 100%;
    max-width: 240px;
  }

  /* ---- Lyrics Area ---- */
  .am-lyrics-area {
    position: absolute;
    top: 100px;
    bottom: 40px;
    left: 0;
    right: 0;
    z-index: 5;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
    mask-image: linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 15%, #000 85%, transparent 100%);
  }
  .lyrics-mode .am-lyrics-area {
    opacity: 1;
    pointer-events: auto;
  }
  .am-lyrics-area::-webkit-scrollbar { display: none; }

  .am-lyrics-inner {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 100%;
    padding: 20px 28px;
  }

  .am-lyric-line {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 10px 0;
    cursor: pointer;
    transition: all 0.25s ease;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }
  .am-lyric-text {
    display: block;
    font-size: 20px;
    font-weight: 500;
    color: rgba(255,255,255,0.3);
    line-height: 1.6;
    transition: all 0.3s ease;
  }
  .am-lyric-line.before .am-lyric-text {
    color: rgba(255,255,255,0.6);
  }
  .am-lyric-line.active .am-lyric-text {
    font-size: 26px;
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

  .am-queue-panel {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 70%;
    z-index: 30;
    background: rgba(28,28,30,0.96);
    backdrop-filter: blur(30px);
    -webkit-backdrop-filter: blur(30px);
    border-radius: 16px 16px 0 0;
    display: flex;
    animation: amQueueSlideUp 0.3s cubic-bezier(0.32, 0.94, 0.6, 1);
    overflow: hidden;
  }
  @keyframes amQueueSlideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
  .am-queue-panel > :global(*) {
    width: 100%;
  }
</style>
