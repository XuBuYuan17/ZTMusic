<script lang="ts">
  import Icon from './ui/Icon.svelte'

  // 只负责状态呈现；重试/返回都是页面传进来的动作
  let {
    variant,
    message = '',
    retrying = false,
    onRetry,
    onBack,
  }: {
    /** loading: 详情未到；waiting: 详情已到、曲目还在补；error / empty: 页面级空态 */
    variant: 'loading' | 'waiting' | 'error' | 'empty'
    message?: string
    retrying?: boolean
    onRetry?: () => void
    onBack?: () => void
  } = $props()

  const compact = $derived(variant === 'waiting')
  const title = $derived(compact ? '正在准备歌曲列表' : '正在打开歌单')
  const detail = $derived(compact ? '歌单信息已就绪' : '同步封面、介绍与歌曲信息')
</script>

{#if variant === 'loading' || variant === 'waiting'}
  <div class="playlist-loading-status" class:playlist-loading-status--compact={compact} role="status" aria-live="polite">
    <span class="playlist-loading-orbit"><Icon name="music" size={compact ? 15 : 17} strokeWidth={1.7} /></span>
    <span><strong>{title}</strong><small>{detail}</small></span>
    <span class="playlist-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
  </div>
{:else}
  <div class="detail-state">
    <p>{variant === 'empty' ? '没有找到详情信息' : message}</p>
    {#if variant === 'error' && onRetry}
      <button type="button" onclick={() => onRetry?.()} disabled={retrying}>{retrying ? '正在重试…' : '重试'}</button>
    {/if}
    <button type="button" onclick={() => onBack?.()}>返回</button>
  </div>
{/if}

<style>
  .playlist-loading-status {
    min-height: 62px;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-elevated) 66%, transparent);
    animation: playlistStatusIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both;
  }

  .playlist-loading-status--compact {
    min-height: 54px;
    margin: 10px 12px 4px;
    padding: 8px 10px;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
    border-radius: 0;
    background: transparent;
  }

  .playlist-loading-orbit {
    position: relative;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 11%, var(--bg-elevated));
  }

  .playlist-loading-orbit::after {
    content: '';
    position: absolute;
    inset: -3px;
    border: 1px solid transparent;
    border-top-color: color-mix(in srgb, var(--accent) 76%, transparent);
    border-right-color: color-mix(in srgb, var(--accent) 24%, transparent);
    border-radius: 50%;
    animation: playlistOrbit 0.9s linear infinite;
  }

  .playlist-loading-status > span:nth-child(2) {
    min-width: 0;
  }

  .playlist-loading-status strong,
  .playlist-loading-status small {
    display: block;
  }

  .playlist-loading-status strong {
    color: var(--text);
    font-size: 12px;
    font-weight: 700;
  }

  .playlist-loading-status small {
    margin-top: 3px;
    color: var(--text-tertiary);
    font-size: 10px;
  }

  .playlist-loading-dots {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 4px;
  }

  .playlist-loading-dots i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--accent);
    animation: playlistDot 1s ease-in-out infinite;
  }

  .playlist-loading-dots i:nth-child(2) { animation-delay: 0.14s; }
  .playlist-loading-dots i:nth-child(3) { animation-delay: 0.28s; }

  .detail-state {
    min-height: 360px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: var(--text-secondary);
  }

  .detail-state p {
    margin: 0;
    font-size: 14px;
  }

  .detail-state button {
    min-height: 36px;
    padding: 0 16px;
    border-radius: var(--radius-lg);
    background: var(--accent-bg);
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
  }

  .detail-state button:hover {
    background: var(--accent-bg-hover);
  }

  @keyframes playlistStatusIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes playlistOrbit { to { transform: rotate(360deg); } }

  @keyframes playlistDot {
    0%, 70%, 100% { opacity: 0.25; transform: translateY(0); }
    35% { opacity: 1; transform: translateY(-3px); }
  }

  :global(html.mobile-runtime) .playlist-loading-status {
    min-height: 56px;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    margin: 0;
    border-radius: var(--radius-md);
  }

  :global(html.mobile-runtime) .playlist-loading-status--compact {
    margin: 6px 4px 2px;
  }

  :global(html.mobile-runtime) .playlist-loading-orbit {
    width: 32px;
    height: 32px;
  }

  @media (prefers-reduced-motion: reduce) {
    .playlist-loading-status,
    .playlist-loading-orbit::after,
    .playlist-loading-dots i {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }

  /* 桌面：页面整体入场由 host 的 pageMotion 处理 */
  :global(html:not(.mobile-runtime)) .playlist-loading-status {
    animation: none;
    opacity: 1;
    transform: none;
  }
</style>
