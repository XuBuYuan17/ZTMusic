<script lang="ts">
  import { fade } from 'svelte/transition'
  import { dialogFocus, reducedMotion } from '../app/desktop-motion.ts'
  import { mobileDrag, mobileSheet } from '../app/mobile-interaction.ts'
  import type { PlaylistSortKey, PlaylistSortDir } from '../pages/playlist-sort.ts'
  import Icon from './ui/Icon.svelte'

  let { show, sort, direction, onSort, onDirection, onClose }: {
    show: boolean
    sort: PlaylistSortKey
    direction: PlaylistSortDir
    onSort: (sort: PlaylistSortKey) => void
    onDirection: (direction: PlaylistSortDir) => void
    onClose: () => void
  } = $props()
  const choices: { value: PlaylistSortKey; label: string }[] = [
    { value: 'added', label: '加入时间' }, { value: 'title', label: '歌曲' },
    { value: 'artist', label: '歌手' }, { value: 'duration', label: '时长' },
  ]
  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    const resize = () => { if (!document.documentElement.classList.contains('mobile-runtime')) onClose() }
    window.addEventListener('resize', resize)
    return { destroy() { window.removeEventListener('resize', resize); node.remove() } }
  }
</script>

{#if show}
  <div class="sort-sheet-portal" use:portal>
    <button class="sort-sheet-backdrop" type="button" aria-label="关闭排序面板" onclick={onClose} transition:fade={{ duration: reducedMotion() ? 0 : 240 }}></button>
    <div class="sort-sheet" role="dialog" aria-modal="true" aria-label="歌曲排序" tabindex="-1" use:dialogFocus={onClose} in:mobileSheet out:mobileSheet>
      <button class="m-sheet-handle" type="button" aria-label="关闭排序面板" onclick={onClose} use:mobileDrag={{ close: onClose, panel: true }}></button>
      <header><h2>歌曲排序</h2><button class="sort-sheet-done" onclick={onClose}>完成</button></header>
      <div class="sort-sheet-body">
        <div class="sort-sheet-options" role="group" aria-label="排序方式">
          {#each choices as choice}
            <button class="sort-sheet-option" class:active={sort === choice.value} aria-pressed={sort === choice.value} onclick={() => onSort(choice.value)}>
              <span>{choice.label}</span>{#if sort === choice.value}<Icon name="check" size={20} />{/if}
            </button>
          {/each}
        </div>
        <div class="sort-sheet-direction" role="group" aria-label="排序方向">
          <button class:active={direction === 'asc'} aria-pressed={direction === 'asc'} onclick={() => onDirection('asc')}>↑ 升序</button>
          <button class:active={direction === 'desc'} aria-pressed={direction === 'desc'} onclick={() => onDirection('desc')}>↓ 降序</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .sort-sheet-portal { display: contents; }
  :global(html.mobile-runtime) .sort-sheet-backdrop { position: fixed; inset: 0; z-index: 340; width: 100%; height: 100%; border: 0; border-radius: 0; background: rgb(0 0 0 / .4); }
  :global(html.mobile-runtime) .sort-sheet { position: fixed; inset: auto 0 0; z-index: 350; display: flex; flex-direction: column; width: 100%; max-width: 760px; max-height: min(calc(var(--mobile-viewport-height, 100dvh) * .85), calc(var(--mobile-viewport-height, 100dvh) - max(24px, env(safe-area-inset-top)))); margin-inline: auto; padding: 0 12px calc(16px + env(safe-area-inset-bottom)); border: 0; border-radius: var(--radius-xl) var(--radius-xl) 0 0; background: var(--bg); color: var(--text); box-shadow: 0 -12px 40px rgb(0 0 0 / .14); }
  :global(html.mobile-runtime) .sort-sheet header { display: flex; align-items: center; justify-content: space-between; flex: none; min-height: 60px; padding-left: 8px; border-bottom: 1px solid var(--border); }
  :global(html.mobile-runtime) .sort-sheet h2 { margin: 0; font-size: 20px; }
  :global(html.mobile-runtime) .sort-sheet button { min-height: 48px; border: 0; }
  :global(html.mobile-runtime) .sort-sheet-done { padding: 0 20px; border-radius: 999px; color: var(--md-primary); background: transparent; }
  :global(html.mobile-runtime) .sort-sheet-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
  :global(html.mobile-runtime) .sort-sheet-options { display: grid; gap: 4px; padding-block: 8px; }
  :global(html.mobile-runtime) .sort-sheet-option { display: flex; align-items: center; justify-content: space-between; min-height: 56px; padding: 0 14px; border-radius: var(--radius-md); text-align: left; background: transparent; color: var(--text); }
  :global(html.mobile-runtime) .sort-sheet-direction { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  :global(html.mobile-runtime) .sort-sheet-direction button { border-radius: 999px; background: var(--md-container); color: var(--text); }
  :global(html.mobile-runtime) .sort-sheet .active { background: var(--md-primary-container); color: var(--text); }
  :global(html.mobile-runtime) .sort-sheet button:active { filter: brightness(.96); }
</style>
