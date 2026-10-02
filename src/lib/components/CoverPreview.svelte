<script lang="ts">
  import { fade } from 'svelte/transition'
  import { dialogFocus, reducedMotion } from '../app/desktop-motion.ts'
  import Icon from './ui/Icon.svelte'

  let { src, title, onClose }: { src: string; title: string; onClose: () => void } = $props()
  let failed = $state(false)

  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return { destroy() { node.remove() } }
  }
</script>

<div class="cover-preview-overlay" use:portal transition:fade={{ duration: reducedMotion() ? 0 : 240 }}>
  <button class="cover-preview-backdrop" type="button" aria-label="关闭封面预览" onclick={onClose}></button>
  <div class="cover-preview-dialog" role="dialog" aria-modal="true" aria-label={`${title}的封面`} tabindex="-1" use:dialogFocus={onClose}>
    <header><h2>{title}</h2><button class="cover-preview-close" type="button" aria-label="关闭封面预览" onclick={onClose}><Icon name="close" size={24} /></button></header>
    {#if failed}
      <div class="cover-preview-error" role="status"><Icon name="music" size={48} /><span>封面暂时无法加载</span></div>
    {:else}
      <img class="cover-preview-image" {src} alt={title} referrerpolicy="no-referrer" onerror={() => failed = true} />
    {/if}
  </div>
</div>

<style>
  .cover-preview-overlay { position: fixed; inset: 0; z-index: var(--z-dialog, 1000); display: grid; place-items: center; padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom)); }
  .cover-preview-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: rgb(0 0 0 / .6); }
  .cover-preview-dialog { position: relative; width: min(100%, 560px); max-height: calc(var(--mobile-viewport-height, 100dvh) - max(16px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom))); display: flex; flex-direction: column; padding: 12px; border-radius: var(--radius-xl); background: var(--md-container-highest); color: var(--text); overflow: hidden; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex: none; }
  h2 { flex: 1; min-width: 0; margin: 0; font-size: 16px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cover-preview-close { display: grid; place-items: center; flex: none; width: 48px; height: 48px; padding: 0; border: 0; border-radius: 999px; background: transparent; color: var(--text); }
  .cover-preview-image { display: block; min-height: 0; width: 100%; aspect-ratio: 1; object-fit: contain; border-radius: var(--radius-md); }
  .cover-preview-error { display: grid; place-content: center; justify-items: center; gap: 16px; min-height: 0; width: 100%; aspect-ratio: 1; border-radius: var(--radius-md); background: var(--md-container); color: var(--text-secondary); font-size: 14px; }
</style>
