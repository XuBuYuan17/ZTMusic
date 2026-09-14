<script lang="ts">
  import type { SongId } from '../types/music.ts';
  import { player } from '../stores/player.svelte.ts';
  import { QUALITY_ORDER } from '../utils/constants.ts';
  import { QUALITY_LABELS } from '../composables/useSettings.svelte.ts';
  import SongContextStrip from './SongContextStrip.svelte';
  import Icon from './ui/Icon.svelte';

  export type Panel = 'quality' | 'comments' | 'playlists' | 'theme';
  // 与 SongContextStrip 本地 ContextPanel 同型（该类型未导出）
  export type StripPanel = 'songs' | 'playlists' | 'comments';

  let {
    panel,
    onClose,
    playerTheme,
    onSetPlayerTheme,
    onToggleTheme,
    onSetQuality,
    contextPanel = null,
    onContextPanelChange,
    onOpenArtist,
  }: {
    panel: Panel | null
    onClose?: () => void
    playerTheme: string
    onSetPlayerTheme: (theme: string) => void
    onToggleTheme?: () => void
    onSetQuality: (level: string) => void
    contextPanel?: StripPanel | null
    onContextPanelChange?: (panel: StripPanel | null) => void
    onOpenArtist?: (id: SongId) => void
  } = $props();

  const qualityLabels: Record<string, string> = QUALITY_LABELS;
  const playerThemeOptions: Array<{ value: string; label: string; icon: string }> = [
    { value: 'card', label: '卡片封面', icon: 'music' },
    { value: 'vinyl', label: '黑胶唱片', icon: 'disc' },
  ];

  let title = $derived.by(() => {
    if (panel === 'quality') return '音质';
    if (panel === 'comments') return '热评';
    if (panel === 'playlists') return '相似歌单';
    if (panel === 'theme') return '播放器主题';
    return '';
  });

  let activeContextPanel = $derived.by<StripPanel | null>(() => {
    if (panel === 'comments') return contextPanel || 'comments';
    if (panel === 'playlists') return contextPanel || 'playlists';
    return null;
  });
</script>

{#if panel}
  <div class="am-secondary-backdrop" role="presentation" onclick={() => onClose?.()}></div>
  <section class="am-secondary-sheet" class:compact={panel === 'quality' || panel === 'theme'} class:detail={panel === 'comments' || panel === 'playlists'} aria-label={title}>
    <div class="am-secondary-header">
      <div class="am-secondary-title">{title}</div>
      <button class="am-secondary-close" type="button" aria-label="关闭" onclick={() => onClose?.()}>
        <Icon name="close" size={18} />
      </button>
    </div>

    {#if panel === 'quality'}
      <div class="am-secondary-list">
        {#each QUALITY_ORDER as level}
          <button class="am-secondary-row" class:active={player.preferredLevel === level} type="button" onclick={() => onSetQuality(level)}>
            <Icon name={player.preferredLevel === level ? 'check' : 'music'} size={18} strokeWidth={1.8} />
            <span>{qualityLabels[level] || level}</span>
          </button>
        {/each}
      </div>
    {:else if panel === 'theme'}
      <div class="am-secondary-list">
        {#each playerThemeOptions as option}
          <button class="am-secondary-row" class:active={playerTheme === option.value} type="button" onclick={() => onSetPlayerTheme(option.value)}>
            <Icon name={playerTheme === option.value ? 'check' : option.icon} size={18} strokeWidth={1.8} />
            <span>{option.label}</span>
          </button>
        {/each}
        <button class="am-secondary-row" type="button" onclick={() => onToggleTheme?.()}>
          <Icon name="sun" size={18} strokeWidth={1.8} />
          <span>切换明暗色</span>
        </button>
      </div>
    {:else}
      <div class="am-secondary-context">
        <SongContextStrip variant="mobile" activePanel={activeContextPanel} showCards={false} onActivePanelChange={onContextPanelChange} onOpenArtist={onOpenArtist} />
      </div>
    {/if}
  </section>
{/if}

<style>
  .am-secondary-backdrop {
    position: fixed;
    inset: 0;
    z-index: 44;
    background: transparent;
  }

  .am-secondary-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 45;
    width: 100%;
    max-height: min(68vh, 520px);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--bg-surface);
    box-shadow: 0 -8px 30px rgba(0,0,0,0.18);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    overflow: hidden;
    animation: queue-slide-up 0.32s var(--ease-out);
  }

  .am-secondary-sheet.compact {
    height: auto;
  }

  .am-secondary-sheet.detail {
    height: min(68vh, 520px);
  }

  .am-secondary-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--border);
  }

  .am-secondary-title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .am-secondary-close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
    border-radius: 50%;
    transition: all 0.15s;
  }

  .am-secondary-close:active {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }

  .am-secondary-list {
    flex: 0 1 auto;
    overflow-y: auto;
    padding: 8px 0 calc(12px + env(safe-area-inset-bottom));
  }

  .am-secondary-sheet.compact .am-secondary-list {
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }

  .am-secondary-row {
    min-height: 44px;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    color: inherit;
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    transition: background 0.1s;
  }

  .am-secondary-row:hover {
    background: var(--bg-hover);
  }

  .am-secondary-row.active {
    color: var(--accent);
    background: var(--accent-bg);
  }

  .am-secondary-row.active span {
    font-weight: 700;
  }

  .am-secondary-context {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0 0 calc(12px + env(safe-area-inset-bottom));
  }

  .am-secondary-context :global(.ly-context-detail) {
    position: static;
    width: 100%;
    height: 100%;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .am-secondary-context :global(.ly-context-detail-head) {
    display: none;
  }

  .am-secondary-context :global(.ly-context-detail-list),
  .am-secondary-context :global(.ly-context-comment-list),
  .am-secondary-context :global(.ly-context-detail-grid) {
    max-height: none;
    height: 100%;
    overflow-y: auto;
  }

  .am-secondary-context :global(.ly-context-detail-grid) {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 8px 0 18px;
  }

  .am-secondary-context :global(.ly-context-detail-playlist) {
    width: 100%;
    min-height: 64px;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    border-radius: 0;
    color: inherit;
    background: transparent;
    transition: background 0.1s;
  }

  .am-secondary-context :global(.ly-context-detail-playlist:hover),
  .am-secondary-context :global(.ly-context-detail-playlist:active) {
    background: var(--bg-hover);
  }

  .am-secondary-context :global(.ly-context-detail-playlist img),
  .am-secondary-context :global(.ly-context-detail-playlist .ly-context-cover-ph) {
    width: 48px;
    height: 48px;
    aspect-ratio: auto;
    margin: 0;
    border-radius: var(--radius-xs);
    object-fit: cover;
    background: var(--bg-layer);
    flex-shrink: 0;
  }

  .am-secondary-context :global(.ly-context-detail-playlist strong) {
    display: block;
    min-width: 0;
    color: rgba(255,255,255,0.9);
    font-size: 14px;
    line-height: 1.35;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .am-secondary-context :global(.ly-context-subhead) {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 6px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .am-secondary-context :global(.ly-context-subhead button) {
    flex-shrink: 0;
    color: var(--accent);
    font-size: 14px;
    font-weight: 500;
  }

  .am-secondary-context :global(.ly-context-subhead span) {
    min-width: 0;
    color: rgba(255,255,255,0.9);
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .am-secondary-context :global(.ly-context-comment-list) {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 18px 16px 22px;
    scroll-padding-top: 18px;
  }

  .am-secondary-context :global(.ly-context-comment-row) {
    width: 100%;
    height: auto;
    min-height: 0;
    padding: 16px 0 18px;
    border-radius: 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: transparent;
  }

  .am-secondary-context :global(.ly-context-comment-row:last-child) {
    border-bottom: 0;
  }

  .am-secondary-context :global(.ly-context-comment-row strong) {
    display: block;
    margin-bottom: 9px;
    color: rgba(255,255,255,0.9);
    font-size: 14px;
    line-height: 1.35;
    font-weight: 700;
  }

  .am-secondary-context :global(.ly-context-comment-row p) {
    margin: 0;
    color: rgba(255,255,255,0.68);
    font-size: 14px;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  @keyframes queue-slide-up {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
