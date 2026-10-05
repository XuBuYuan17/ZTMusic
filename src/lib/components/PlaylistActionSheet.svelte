<script module lang="ts">
  import type { SongId } from '../types/music.ts'
  import type { CompactTrackInput } from '../player/queue.ts'
  import { musicService } from '../music/service.ts'
  import { player } from '../stores/player.svelte.ts'
  import { toast } from '../stores/toast.svelte.ts'

  export function playlistPortal(node: HTMLElement) { document.body.append(node); return { destroy() { node.remove() } } }

  export interface PlaylistAction { label: string; icon: string; onSelect: () => void; danger?: boolean; disabled?: boolean }

  function validId(id: unknown): id is SongId { return (typeof id === 'string' && id.trim().length > 0) || (typeof id === 'number' && Number.isFinite(id)) }

  export async function queuePlaylist(id: unknown, action: 'play' | 'append' | 'next', supplied?: CompactTrackInput[]): Promise<void> {
    if (!validId(id)) { toast.error('无法识别歌单'); return }
    try {
      const tracks = supplied ?? ((await musicService.getPlaylist(id))?.tracks as CompactTrackInput[] | undefined)
      if (!tracks?.length) { toast.info('歌单暂无可播放歌曲'); return }
      if (action === 'play') player.playQueue(tracks, 0)
      else {
        if (action === 'next') player.playNext(tracks)
        else player.addToQueue(tracks)
        toast.success(action === 'next' ? `已插播 ${tracks.length} 首歌曲` : `已加入队列 · ${tracks.length} 首歌曲`)
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : '读取歌单失败') }
  }

  export async function sharePlaylist(id: unknown, title: string, type = '歌单'): Promise<void> {
    if (!validId(id)) { toast.error('无法识别歌单'); return }
    const url = `https://music.163.com/${type === '专辑' ? 'album' : 'playlist'}?id=${encodeURIComponent(String(id))}`
    try {
      if (typeof navigator.share === 'function') await navigator.share({ title, url })
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); toast.success('链接已复制') }
      else toast.error('当前环境无法分享链接')
    } catch (error) { if ((error as { name?: string })?.name !== 'AbortError') toast.error('分享失败，请重试') }
  }
</script>

<script lang="ts">
  import Icon from './ui/Icon.svelte'
  import { coverUrl } from '../utils/image.ts'
  import { dialogFocus, reducedMotion } from '../app/desktop-motion.ts'
  import { mobileDrag, mobileSheet } from '../app/mobile-interaction.ts'
  import { fade } from 'svelte/transition'

  let { title, cover = '', coverIsBundled = false, actions, onPlay, onClose, onClosed, show = true, label = '歌单管理' }: {
    show?: boolean; title: string; cover?: string; coverIsBundled?: boolean; actions: PlaylistAction[]; onPlay?: () => void; onClose: () => void; onClosed?: () => void; label?: string
  } = $props()
  let coverFailed = $state(false)
  $effect(() => { cover; coverFailed = false })
  let closed = false
  $effect(() => { if (show) closed = false })
  function finishClose(event: Event) {
    if (closed) return
    closed = true
    const node = event.currentTarget as HTMLElement
    // 整个退场组移除后，焦点隔离才会解除。
    const afterRemoval = () => {
      if (show) return
      if (node.isConnected) requestAnimationFrame(afterRemoval)
      else onClosed?.()
    }
    requestAnimationFrame(afterRemoval)
  }
</script>

{#if show}
  <button class="mobile-choice-backdrop" type="button" aria-label={`关闭${label}`} onclick={onClose} transition:fade={{ duration: reducedMotion() ? 0 : 240 }}></button>
  <div class="mobile-choice-sheet library-options-sheet playlist-action-sheet" data-bottom-panel role="dialog" aria-modal="true" aria-label={label} tabindex="-1" use:dialogFocus={onClose} in:mobileSheet out:mobileSheet onoutroend={finishClose}>
    <button class="m-sheet-handle" type="button" aria-label={`关闭${label}`} onclick={onClose} use:mobileDrag={{ close: onClose, panel: true }}></button>
    <header class="library-options-header">
      <button class="library-options-cover" type="button" aria-label={`播放歌单 ${title}`} onclick={onPlay} disabled={!onPlay}>
        {#if cover && !coverFailed}<img src={coverIsBundled ? cover : coverUrl(cover, 240)} alt="" referrerpolicy="no-referrer" onerror={() => coverFailed = true} />{:else}<Icon name="music" size={32} />{/if}
        {#if onPlay}<span class="playlist-sheet-play"><Icon name="play" size={28} /></span>{/if}
      </button>
      <h2>{title}</h2>
      <button class="mobile-choice-done" type="button" aria-label={`关闭${label}`} onclick={onClose}><Icon name="close" size={20} /></button>
    </header>
    <div class="mobile-choice-body">
      {#each actions as action}
        <button class="mobile-choice-option library-option" class:library-option--danger={action.danger} type="button" disabled={action.disabled} onclick={action.onSelect}>
          {#if action.icon === 'edit'}<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>{:else}<Icon name={action.icon} size={24} />{/if}
          <span>{action.label}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  :global(html.mobile-runtime) .playlist-action-sheet { padding: 0 0 max(12px, env(safe-area-inset-bottom)); max-height: calc(var(--mobile-viewport-height, 100dvh) - max(24px, env(safe-area-inset-top))); border-radius: var(--radius-xl) var(--radius-xl) 0 0; background: var(--bg); box-shadow: 0 -12px 40px rgb(0 0 0 / .14); }
  :global(html.mobile-runtime) .playlist-action-sheet .library-options-header { display: grid; grid-template-columns: 64px minmax(0, 1fr) 48px; align-items: center; gap: 14px; min-height: 84px; padding: 4px 12px 14px 20px; border-bottom: 1px solid var(--border); }
  :global(html.mobile-runtime) .playlist-action-sheet .library-options-cover { position: relative; width: 64px; height: 64px; padding: 0; border: 0; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-surface); color: var(--text-secondary); }
  .library-options-cover img { width: 100%; height: 100%; object-fit: cover; }
  .playlist-sheet-play { position: absolute; left: calc(50% - 20px); top: calc(50% - 20px); width: 40px; height: 40px; display: grid; place-items: center; border-radius: 999px; color: white; background: rgb(0 0 0 / .45); }
  :global(html.mobile-runtime) .playlist-action-sheet h2 { margin: 0; font-size: 18px; line-height: 24px; font-weight: 700; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
  :global(html.mobile-runtime) .playlist-action-sheet .mobile-choice-done { width: 48px; min-width: 48px; height: 48px; padding: 0; color: var(--text-secondary); }
  :global(html.mobile-runtime) .playlist-action-sheet .mobile-choice-body { padding: 8px 12px; gap: 4px; }
  :global(html.mobile-runtime) .playlist-action-sheet .library-option { min-height: 56px; padding: 12px 14px; gap: 14px; border-radius: var(--radius-md); background: transparent; color: var(--text); font-size: 16px; font-weight: 500; }
  .library-option :global(svg) { flex: none; color: var(--md-primary); }
  .library-option--danger :global(svg) { color: var(--danger); }
  .library-option:active { background: var(--bg-hover); }
</style>
