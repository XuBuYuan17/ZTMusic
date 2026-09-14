<script lang="ts">
  import type { NormalizedPlaylist } from '../utils/normalize.ts'
  import { coverUrl } from '../utils/image.ts'
  import Spinner from './Spinner.svelte'

  let {
    pl,
    index = 0,
    managed = false,
    liked = false,
    covers = [],
    busy = false,
    onOpen,
    onPlay,
    onUnsubscribe,
  }: {
    pl: NormalizedPlaylist
    index?: number
    managed?: boolean
    liked?: boolean
    covers?: string[]
    busy?: boolean
    onOpen?: (pl: NormalizedPlaylist) => void
    onPlay?: (pl: NormalizedPlaylist) => void
    onUnsubscribe?: (pl: NormalizedPlaylist) => void
  } = $props()

  // 双列瀑布流：左列取偶数位封面、右列奇数位；不足 4 张循环补足以保证无缝滚动
  function padColumn(list: string[]): string[] {
    if (!list.length) return []
    if (list.length >= 4) return list
    return Array.from({ length: 4 }, (_, i) => list[i % list.length] ?? list[0] ?? '')
  }
  let coverColumns = $derived.by(() => {
    if (!liked || !covers.length) return { l: [] as string[], r: [] as string[] }
    if (covers.length === 1) return { l: padColumn(covers), r: [] as string[] }
    if (covers.length < 4) {
      // 封面少：两列共用循环流并错位一格，避免整列重复同一张
      const take = (start: number): string[] =>
        Array.from({ length: 4 }, (_, i) => covers[(start + i) % covers.length] ?? '')
      return { l: take(0), r: take(1) }
    }
    return {
      l: covers.filter((_, i) => i % 2 === 0),
      r: covers.filter((_, i) => i % 2 === 1),
    }
  })

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen?.(pl)
    }
  }

  // “喜爱歌曲”没有真实封面：灰色底 + 红色五角星，对齐 Apple Music
  const starPath = 'M12 2.6l2.95 6.01 6.62.94-4.8 4.65 1.15 6.57L12 17.68l-5.92 3.09 1.15-6.57-4.8-4.65 6.62-.94z'
</script>

<div
  class="library-card"
  class:library-card-managed={managed}
  style={`--card-i:${index}`}
  role="button"
  tabindex="0"
  aria-label={`打开歌单 ${pl.name}`}
  onclick={() => onOpen?.(pl)}
  onkeydown={handleKeydown}
>
  <div class="library-card-cover">
    {#if liked && covers.length === 1}
      <img class="liked-falls-single" src={coverUrl(covers[0], 400)} alt="" loading="lazy" referrerpolicy="no-referrer" />
      <span class="liked-falls-badge">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d={starPath}/></svg>
      </span>
    {:else if liked && coverColumns.l.length}
      <div class="liked-falls" aria-hidden="true">
        <div class="liked-falls-col">
          <div class="liked-falls-track liked-falls-track-l">
            {#each coverColumns.l as src}
              <img src={coverUrl(src, 200)} alt="" loading="lazy" referrerpolicy="no-referrer" />
            {/each}
            {#each coverColumns.l as src}
              <img src={coverUrl(src, 200)} alt="" loading="lazy" referrerpolicy="no-referrer" />
            {/each}
          </div>
        </div>
        {#if coverColumns.r.length}
          <div class="liked-falls-col">
            <div class="liked-falls-track liked-falls-track-r">
              {#each coverColumns.r as src}
                <img src={coverUrl(src, 200)} alt="" loading="lazy" referrerpolicy="no-referrer" />
              {/each}
              {#each coverColumns.r as src}
                <img src={coverUrl(src, 200)} alt="" loading="lazy" referrerpolicy="no-referrer" />
              {/each}
            </div>
          </div>
        {/if}
      </div>
      <span class="liked-falls-badge">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d={starPath}/></svg>
      </span>
    {:else if liked}
      <div class="library-card-liked-art" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="46%" height="46%" fill="currentColor"><path d={starPath}/></svg>
      </div>
    {:else if pl.picUrl}
      <img src={coverUrl(pl.picUrl, 400)} alt={pl.name as string} loading="lazy" referrerpolicy="no-referrer" />
    {:else}
      <div class="library-card-placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
    {/if}
    {#if onPlay}
      <button
        class="library-card-play-btn"
        type="button"
        title={liked ? '播放' : '播放'}
        aria-label={`播放 ${pl.name}`}
        disabled={busy}
        onclick={(e) => { e.stopPropagation(); onPlay?.(pl) }}
      >
        {#if busy}
          <Spinner size="sm" />
        {:else}
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        {/if}
      </button>
    {/if}
  </div>
  <div class="library-card-info">
    <div class="library-card-name">{pl.name}{#if liked}<span class="library-card-liked-star" aria-hidden="true">★</span>{/if}</div>
    {#if !liked}
      <div class="library-card-meta">
        {#if pl.trackCount}<span>{pl.trackCount} 首</span>{/if}
        {#if managed && pl.creator}<span class="library-card-creator">· {pl.creator}</span>{/if}
      </div>
    {/if}
  </div>
  {#if managed}
    <button class="library-card-unsubscribe" type="button" onclick={(e) => { e.stopPropagation(); onUnsubscribe?.(pl) }} aria-label={`取消收藏 ${pl.name}`}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  {/if}
</div>
