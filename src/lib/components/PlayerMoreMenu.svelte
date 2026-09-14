<script lang="ts">
  import Icon from './ui/Icon.svelte';

  interface MoreMenuItem {
    label: string;
    icon: string;
    action?: () => void;
    disabled?: boolean;
  }

  let {
    open = false,
    onToggle,
    onClose,
    items,
    message = '',
    cover = '',
    title = '',
    artist = '',
  }: {
    open?: boolean
    onToggle?: () => void
    onClose?: () => void
    items: MoreMenuItem[]
    message?: string
    cover?: string
    title?: string
    artist?: string
  } = $props();

  function handleItem(item: MoreMenuItem): void {
    onClose?.();
    item.action?.();
  }
</script>

<div class="am-more-shell">
  <button class="am-more-btn" class:active={open} type="button" aria-label="更多操作" aria-expanded={open} onclick={() => onToggle?.()}>
    <span class="am-more-dots" aria-hidden="true"><span></span><span></span><span></span></span>
  </button>
  {#if open}
    <div class="am-more-backdrop" role="presentation" onclick={() => onClose?.()}></div>
    <div class="am-more-menu" role="menu" aria-label="更多操作菜单">
      <div class="am-more-track" aria-hidden="true">
        {#if cover}<img src={cover} alt="" referrerpolicy="no-referrer" />{/if}
        <span><strong>{title}</strong><small>{artist}</small></span>
      </div>
      {#each items as item}
        <button class="am-more-item" type="button" role="menuitem" onclick={() => handleItem(item)} disabled={item.disabled}>
          <Icon name={item.icon} size={18} strokeWidth={1.8} />
          <span>{item.label}</span>
        </button>
      {/each}
      {#if message}
        <div class="am-more-message" aria-live="polite">{message}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .am-more-shell {
    position: absolute;
    top: calc(36px + env(safe-area-inset-top));
    right: 14px;
    z-index: 40;
  }

  .am-more-btn {
    position: relative;
    z-index: 42;
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    opacity: 0.9;
    color: rgba(255,255,255,0.92);
    background: rgba(20,20,20,0.28);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    transition: transform 0.16s var(--ease-out), background 0.16s var(--ease-out), color 0.16s var(--ease-out), opacity 0.16s var(--ease-out);
  }

  .am-more-btn:hover,
  .am-more-btn:focus-visible {
    opacity: 0.88;
    background: rgba(255,255,255,0.1);
  }

  .am-more-btn:active {
    transform: scale(0.94);
  }

  .am-more-btn.active {
    opacity: 1;
    color: #fff;
    background: rgba(255,255,255,0.16);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 24px rgba(0,0,0,0.18);
  }

  .am-more-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }

  .am-more-dots span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px rgba(255,255,255,0.14);
  }

  .am-more-backdrop {
    position: fixed;
    inset: 0;
    z-index: 41;
    background: transparent;
  }

  .am-more-menu {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 43;
    width: 100%;
    padding: 10px 0 calc(12px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    background: var(--bg-surface);
    box-shadow: 0 -8px 30px rgba(0,0,0,0.18);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    max-height: min(82dvh, 620px);
    overflow-x: hidden;
    overflow-y: auto;
    animation: queue-slide-up 0.32s var(--ease-out);
  }

  .am-more-track {
    min-height: 70px;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    margin: 0 16px 8px;
    padding: 0 4px 10px;
    border-bottom: 1px solid var(--border);
  }

  .am-more-track img { width: 48px; height: 48px; border-radius: var(--radius-xs); object-fit: cover; }
  .am-more-track span { min-width: 0; display: grid; gap: 2px; }
  .am-more-track strong,
  .am-more-track small { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .am-more-track strong { font-size: 15px; font-weight: 700; }
  .am-more-track small { color: var(--text-secondary); font-size: 12px; }

  .am-more-item {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    color: inherit;
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    background: transparent;
    transition: background 0.1s;
  }

  .am-more-item :global(svg) {
    flex: 0 0 20px;
    color: var(--text-secondary);
  }

  .am-more-item span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .am-more-item:hover {
    background: var(--bg-hover);
  }

  .am-more-item:active {
    background: var(--accent-bg);
  }

  .am-more-item:disabled {
    opacity: 0.38;
    transform: none;
  }

  .am-more-message {
    min-height: 24px;
    padding: 2px 20px 0;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  @keyframes queue-slide-up {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
