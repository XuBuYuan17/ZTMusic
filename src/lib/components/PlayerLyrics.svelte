<script lang="ts">
  import type { DisplayLyricLine } from '../services/lyrics-loader.ts';
  import { player } from '../stores/player.svelte.ts';
  import { useLyrics } from '../composables/useLyrics.svelte.ts';
  import { scrollLyricIntoView } from '../utils/scroll-lyric.ts';

  let { active = false }: { active?: boolean } = $props();

  let lyricsEl = $state<HTMLElement | null>(null);
  const lyricState = useLyrics();

  // ---- Auto-scroll lyrics ----
  $effect(() => {
    if (!active || !lyricsEl) return;
    scrollLyricIntoView(lyricsEl, lyricState.highlightIndex, '.am-lyric-line', 0.25);
  });
</script>

{#snippet lyricLine(line: DisplayLyricLine, i: number)}
  <button class="am-lyric-line" class:active={i === lyricState.highlightIndex} class:before={i < lyricState.highlightIndex}
    aria-current={i === lyricState.highlightIndex ? 'true' : undefined}
    onclick={() => { if (player.duration) player.seek(Math.max(0, Math.min(player.duration, Number(line.time)))); }}>
    <span class="am-lyric-text">{line.text || '...'}</span>
    {#if line.translation}
      <span class="am-lyric-trans">{line.translation}</span>
    {/if}
  </button>
{/snippet}

<!-- Lyrics area -->
<div class="am-lyrics-area" bind:this={lyricsEl} aria-live="polite" aria-atomic="false">
  <div class="am-lyrics-inner">
    {#if lyricState.loading}
      <div class="am-no-lyric" aria-busy="true">歌词加载中…</div>
    {:else if lyricState.lyrics.length > 0}
      {#each lyricState.lyrics as line, i}
        {@render lyricLine(line, i)}
      {/each}
    {:else}
      <div class="am-no-lyric">暂无歌词</div>
    {/if}
  </div>
</div>
<!-- Gradient overlays replace mask-image for better mobile performance -->
<div class="am-lyrics-fade-top"></div>
<div class="am-lyrics-fade-bottom"></div>

<style>
  .am-lyrics-area {
    position: absolute;
    top: calc(134px + env(safe-area-inset-top));
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 5;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
    /* Removed mask-image for performance — using padding + overflow instead */
    padding-top: 26px;
    padding-bottom: 96px;
  }
  :global(.lyrics-mode) .am-lyrics-area {
    opacity: 1;
    pointer-events: auto;
  }
  .am-lyrics-area::-webkit-scrollbar { display: none; }

  /* Gradient fade overlays — GPU-friendly alternative to mask-image */
  .am-lyrics-fade-top,
  .am-lyrics-fade-bottom {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 96px;
    z-index: 6;
    pointer-events: none;
  }
  .am-lyrics-fade-top {
    top: -48px;
    display: none;
  }
  .am-lyrics-fade-bottom {
    bottom: -40px;
    background: linear-gradient(to top, rgba(0,0,0,0.38) 0%, transparent 100%);
  }

  .am-lyrics-inner {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
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
    transition: transform 0.25s ease, opacity 0.25s ease;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }
  .am-lyric-text {
    display: block;
    font-size: 20px;
    font-weight: 500;
    color: rgba(255,255,255,0.3);
    line-height: 1.6;
    transition: color 0.3s ease;
  }
  .am-lyric-line.before .am-lyric-text {
    color: rgba(255,255,255,0.6);
  }
  .am-lyric-line.active .am-lyric-text {
    font-weight: 700;
    color: #fff;
    font-size: 20px;
  }
  .am-lyric-trans {
    display: block;
    font-size: 13px;
    font-weight: 400;
    color: rgba(255,255,255,0.25);
    margin-top: 4px;
    transition: color 0.3s ease;
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

  @media (prefers-reduced-motion: reduce) {
    .am-lyrics-area,
    .am-lyric-line,
    .am-lyric-text {
      transition-duration: 0.01ms;
    }
  }
</style>
