<script lang="ts">
  import type { PlayMode } from '../types/player.ts'
  import Icon from './ui/Icon.svelte'

  let {
    /** 'compact' (PlayerBar) | 'lyrics' (LyricsPage with large circular buttons) */
    variant = 'compact',
    size = 'md',
    mode = 'list',
    playing = false,
    disabled = false,
    onshuffle,
    onprev,
    onplaypause,
    onnext,
    onrepeat,
    onqueue,
    showQueue = false,
    showQueueButton = true,
  }: {
    variant?: 'compact' | 'lyrics'
    size?: 'sm' | 'md' | 'lg'
    mode?: PlayMode
    playing?: boolean
    disabled?: boolean
    onshuffle?: () => void
    onprev?: () => void
    onplaypause?: () => void
    onnext?: () => void
    onrepeat?: () => void
    onqueue?: () => void
    showQueue?: boolean
    showQueueButton?: boolean
  } = $props()

  let isLyrics = $derived(variant === 'lyrics')
  let sz = $derived(isLyrics ? 32 : size === 'sm' ? 22 : 24)
  let playSize = $derived(isLyrics ? 36 : size === 'lg' ? 28 : 26)
  let gap = $derived(size === 'lg' ? '1rem' : '0.5rem')

  let btnClass = $derived(isLyrics ? 'ly-ctrl-btn' : 'pc-btn')
  let playClass = $derived(isLyrics ? 'ly-play-btn' : 'pc-btn pc-btn--play')

  const modeLabels: Record<PlayMode, string> = {
    list: '顺序播放',
    repeat: '单曲循环',
    shuffle: '随机播放'
  }

  // Mode cycle: list -> repeat -> shuffle -> list
  function handleClick(event: MouseEvent, action?: () => void): void {
    event.preventDefault()
    event.stopPropagation()
    action?.()
  }

  function cycleMode(): void {
    let nextMode: PlayMode = mode
    if (mode === 'list') nextMode = 'repeat'
    else if (mode === 'repeat') nextMode = 'shuffle'
    else nextMode = 'list'

    // Trigger appropriate callback
    if (nextMode === 'repeat') {
      onrepeat?.()
    } else if (nextMode === 'shuffle') {
      onshuffle?.()
    } else {
      // Go back to list mode - turn off both
      if (mode === 'repeat') onrepeat?.()
      else if (mode === 'shuffle') onshuffle?.()
    }

    // 播放模式的提示交给 PlayerHud（盯 player.mode），这里不再自己造 toast
  }
</script>

<div class="pc" class:ly-play-row={isLyrics} class:pc-disabled={disabled} style:gap={isLyrics ? undefined : gap}>
  <!-- 播放模式循环按钮: list → repeat → shuffle → list -->
  <button class={btnClass} class:active={mode === 'repeat' || mode === 'shuffle'}
    onclick={(e) => handleClick(e, cycleMode)} aria-label={modeLabels[mode]}
    disabled={isLyrics ? false : disabled}>
    {#if mode === 'shuffle'}
      <Icon name="shuffle-lg" size={sz} fill="currentColor" />
    {:else}
      <Icon name="repeat" size={sz} strokeWidth={2.2} />
    {/if}
  </button>

  <!-- 上一首 -->
  <button class={btnClass} onclick={(e) => handleClick(e, onprev)} aria-label="上一首" disabled={isLyrics ? false : disabled}>
    <Icon name="prev" size={sz} fill="currentColor" />
  </button>

  <!-- 播放/暂停 -->
  <button class={playClass} onclick={(e) => handleClick(e, onplaypause)} aria-label={playing ? '暂停' : '播放'} disabled={isLyrics ? false : disabled}>
    {#if playing}
      <Icon name="pause" size={playSize} fill="currentColor" />
    {:else}
      <Icon name="play" size={playSize} fill="currentColor" />
    {/if}
  </button>

  <!-- 下一首 -->
  <button class={btnClass} onclick={(e) => handleClick(e, onnext)} aria-label="下一首" disabled={isLyrics ? false : disabled}>
    <Icon name="next" size={sz} fill="currentColor" />
  </button>

  <!-- 播放列表 - 歌词模式下在PC端显示，移动端在下方操作按钮组显示 -->
  <!-- 播放列表按钮 - 总是显示 -->
  {#if showQueueButton}
    <button class={btnClass} class:active={showQueue} class:ly-queue-btn={true} onclick={(e) => handleClick(e, onqueue)} aria-label="播放列表">
      <Icon name="list" size={sz} strokeWidth={2.2} />
    </button>
  {/if}

</div>

<style>
  .pc {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pc-btn {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.8;
    transition: opacity var(--dur-fast), transform var(--dur-fast);
  }
  .pc-btn:hover:not(:disabled) { opacity: 1; transform: scale(1.1); }
  .pc-btn:active:not(:disabled) { transform: scale(0.95); }
  .pc-btn:disabled { opacity: 0.35; cursor: default; }
  .pc-btn.active { opacity: 1; color: var(--accent); }
  .pc-btn--play { padding: 0.3rem; }
  /* lyrics variant: disabled is visual only, never blocks clicks */
  .pc-disabled .pc-btn,
  .pc-disabled .ly-ctrl-btn,
  .pc-disabled .ly-play-btn {
    opacity: 0.38;
    cursor: default;
  }
  .pc-disabled .ly-ctrl-btn:hover,
  .pc-disabled .ly-play-btn:hover {
    color: rgba(255,255,255,0.5);
    background: none;
  }
</style>
