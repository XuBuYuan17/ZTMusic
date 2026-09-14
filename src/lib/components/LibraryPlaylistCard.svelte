<script lang="ts">
  import type { NormalizedPlaylist } from '../utils/normalize.ts'
  import { coverUrl } from '../utils/image.ts'

  let {
    pl,
    index = 0,
    managed = false,
    onOpen,
    onUnsubscribe,
  }: {
    pl: NormalizedPlaylist
    index?: number
    managed?: boolean
    onOpen?: (pl: NormalizedPlaylist) => void
    onUnsubscribe?: (pl: NormalizedPlaylist) => void
  } = $props()

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen?.(pl)
    }
  }
</script>

<div
  class="library-card"
  class:library-card-managed={managed}
  style={`--card-i:${index}`}
  role="button"
  tabindex="0"
  onclick={() => onOpen?.(pl)}
  onkeydown={handleKeydown}
>
  <div class="library-card-cover">
    {#if pl.picUrl}
      <img src={coverUrl(pl.picUrl, 400)} alt={pl.name as string} loading="lazy" referrerpolicy="no-referrer" />
    {:else}
      <div class="library-card-placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
    {/if}
    <div class="library-card-play-btn">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </div>
  </div>
  <div class="library-card-info">
    <div class="library-card-name">{pl.name}</div>
    <div class="library-card-meta">
      {#if pl.trackCount}<span>{pl.trackCount} 首</span>{/if}
      {#if managed && pl.creator}<span class="library-card-creator">· {pl.creator}</span>{/if}
    </div>
  </div>
  {#if managed}
    <button class="library-card-unsubscribe" type="button" onclick={(e) => { e.stopPropagation(); onUnsubscribe?.(pl) }} aria-label={`取消收藏 ${pl.name}`}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  {/if}
</div>
