<script lang="ts">
  import type { NormalizedPlaylist } from '../utils/normalize.ts'
  import { progressiveCover } from '../utils/image.ts'
  import LikedCoverFalls from './LikedCoverFalls.svelte'
  import Spinner from './Spinner.svelte'
  import { isTouchDevice, responsive } from '../utils/responsive.ts'
  import { mobileLongPress } from '../app/mobile-interaction.ts'
  import { router } from '../stores/router.svelte.ts'

  let {
    pl,
    index = 0,
    managed = false,
    owned = false,
    liked = false,
    covers = [],
    busy = false,
    onOpen,
    onPlay,
    onUnsubscribe,
    onEdit,
    onDelete,
    onOptions,
  }: {
    pl: NormalizedPlaylist
    index?: number
    /** 收藏来的歌单：露出「取消收藏」 */
    managed?: boolean
    /** 自己建的歌单：露出「编辑 / 删除」 */
    owned?: boolean
    liked?: boolean
    covers?: string[]
    busy?: boolean
    onOpen?: (pl: NormalizedPlaylist) => void
    onPlay?: (pl: NormalizedPlaylist) => void
    onUnsubscribe?: (pl: NormalizedPlaylist) => void
    onEdit?: (pl: NormalizedPlaylist) => void
    onDelete?: (pl: NormalizedPlaylist) => void
    onOptions?: (pl: NormalizedPlaylist, origin: HTMLElement) => void
  } = $props()
  let coverFailed = $state(false)
  $effect(() => { pl.picUrl; coverFailed = false })
  let card: HTMLElement
  // 歌单操作属于能力，不由布局决定：窄窗口的 Windows 仍可右键/按 Shift+F10 打开
  function openOptions() {
    if (!onOptions) return
    card.focus({ preventScroll: true })
    onOptions(pl, card)
  }
  function prefetch(): void {
    router.prefetchPlaylist(Number(pl.id))
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.target !== e.currentTarget) return
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); openOptions(); return }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen?.(pl)
    }
  }

</script>

<div
  class="library-card" data-motion="card" data-playlist-id={String(pl.id)}
  class:library-card-managed={managed}
  class:library-card-owned={owned}
  style={`--card-i:${index}`}
  role="button"
  tabindex="0"
  aria-label={`打开歌单 ${pl.name}`}
  aria-haspopup={onOptions ? 'dialog' : undefined}
  aria-keyshortcuts={onOptions ? 'Shift+F10' : undefined}
  bind:this={card}
  use:mobileLongPress={{ enabled: () => isTouchDevice() && !!onOptions && !card.closest('[inert]'), open: openOptions }}
  onpointerenter={prefetch}
  onpointerdown={prefetch}
  onfocus={prefetch}
  onclick={() => onOpen?.(pl)}
  oncontextmenu={(event) => { event.preventDefault(); openOptions() }}
  onkeydown={handleKeydown}
>
  <div class="library-card-cover">
    {#if liked}
      <LikedCoverFalls {covers} />
    {:else if pl.picUrl && !coverFailed}
      <img use:progressiveCover={{ source: pl.picUrl, size: 400 }} alt={pl.name as string} loading="lazy" referrerpolicy="no-referrer" onerror={() => coverFailed = true} />
    {:else}
      <div class="library-card-placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
    {/if}
    {#if onPlay && !$responsive.isMobile}
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
    {#if $responsive.isMobile && managed && pl.creator}<div class="library-card-creator">{pl.creator}</div>{/if}
    {#if !$responsive.isMobile && !liked}
      <div class="library-card-meta">
        {#if pl.trackCount}<span>{pl.trackCount} 首</span>{/if}
        {#if managed && pl.creator}<span class="library-card-creator">· {pl.creator}</span>{/if}
      </div>
    {/if}

  </div>
  {#if $responsive.isMobile && onOptions}
    <button class="library-card-menu" type="button" aria-label={`更多操作 ${pl.name}`} onclick={(e) => { e.stopPropagation(); openOptions() }}><span aria-hidden="true">⋮</span></button>
  {/if}
  {#if managed && !$responsive.isMobile}
    <button class="library-card-action library-card-action-danger" type="button" onclick={(e) => { e.stopPropagation(); onUnsubscribe?.(pl) }} aria-label={`取消收藏 ${pl.name}`}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  {/if}
  {#if owned && !$responsive.isMobile}
    <div class="library-card-actions">
      <button class="library-card-action" type="button" onclick={(e) => { e.stopPropagation(); onEdit?.(pl) }} aria-label={`编辑歌单 ${pl.name}`}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button class="library-card-action library-card-action-danger" type="button" onclick={(e) => { e.stopPropagation(); onDelete?.(pl) }} aria-label={`删除歌单 ${pl.name}`}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
      </button>
    </div>
  {/if}
</div>
