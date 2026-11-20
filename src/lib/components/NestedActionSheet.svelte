<script lang="ts">
  import type { Snippet } from 'svelte'
  import { dialogFocus } from '../app/desktop-motion.ts'
  import { mobileDrag, mobileSheet } from '../app/mobile-interaction.ts'
  import Icon from './ui/Icon.svelte'

  let { title, onBack, fill = false, children }: {
    title: string
    onBack: () => void
    fill?: boolean
    children: Snippet
  } = $props()
</script>

<button class="nested-action-backdrop" type="button" aria-label="返回上一级菜单" tabindex="-1" onclick={onBack}></button>
<div class="nested-action-sheet" class:fill role="dialog" aria-modal="true" aria-label={title} tabindex="-1"
  use:dialogFocus={onBack} in:mobileSheet out:mobileSheet>
  <button class="m-sheet-handle" type="button" aria-label="返回上一级" onclick={onBack} use:mobileDrag={{ close: onBack, panel: true }}></button>
  <header>
    <button type="button" aria-label="返回" onclick={onBack}><Icon name="chevron-left" size={20} /></button>
    <h2>{title}</h2>
  </header>
  <div class="nested-action-body">{@render children()}</div>
</div>

<style>
  .nested-action-backdrop { position: absolute; inset: 0; z-index: 2; background: rgb(0 0 0 / .19); }
  .nested-action-sheet {
    position: absolute; inset: auto 0 0; z-index: 3; display: flex; flex-direction: column;
    max-height: calc(100% - 28px); overflow: hidden;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    color: var(--text);
  }
  .nested-action-sheet.fill { height: calc(100% - 28px); }
  header { display: grid; flex: none; grid-template-columns: 44px minmax(0, 1fr); align-items: center; margin: 0 14px; border-bottom: 1px solid var(--border); }
  header button { width: 44px; height: 44px; display: grid; place-items: center; color: var(--text-secondary); }
  h2 { font-size: 16px; line-height: 22px; font-weight: 700; }
  .nested-action-body { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; overflow: hidden; padding: 4px 10px 0; }
  .nested-action-body :global(.am-secondary-list) { min-height: 0; padding: 0; }
  .nested-action-body :global(.am-secondary-context) { padding-bottom: 0; }
  .nested-action-body :global(.song-menu__playlists) { overflow-y: auto; }
  .nested-action-body :global(.nested-action-form) { min-height: 0; overflow-y: auto; padding: 8px 8px 4px; }
</style>
