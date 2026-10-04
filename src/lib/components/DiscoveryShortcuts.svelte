<script lang="ts">
  import Icon from './ui/Icon.svelte'
  import { auth } from '../stores/auth.svelte.ts'
  import { router } from '../stores/router.svelte.ts'
  import { discoveryPlayback } from '../stores/discovery-playback.svelte.ts'
  import { PRIVATE_RADAR_ID } from '../services/discovery-recommendations.ts'
  let { onNavigate, onOpenPlaylist, onOpenLogin }: {
    onNavigate?: (view: string) => void
    onOpenPlaylist?: (id: unknown, push?: boolean, preview?: unknown) => void
    onOpenLogin?: () => void
  } = $props()
  let message = $state('')
  $effect(() => { auth.user; auth.cookieOk; message = '' })
  const entries = [
    { key: 'daily', label: '每日推荐', icon: 'calendar' },
    { key: 'heart', label: '心动模式', icon: 'heart' },
    { key: 'roaming', label: '漫游模式', icon: 'compass' },
    { key: 'radar', label: '私人雷达', icon: 'radar' },
  ]
  function open(key: string): void {
    message = ''
    if (!auth.isLoggedIn || !auth.cookieOk) {
      message = '登录后开启专属推荐'
      onOpenLogin?.()
      return
    }
    if (key === 'daily') onNavigate?.('dailyRecommendations')
    else if (key === 'radar') {
      router.invalidatePlaylist(PRIVATE_RADAR_ID)
      onOpenPlaylist?.(PRIVATE_RADAR_ID)
    } else if (key === 'heart' || key === 'roaming') void discoveryPlayback.start(key)
  }
</script>

<section class="discovery-shortcuts" aria-label="专属推荐">
  <div class="discovery-shortcuts__row">
    {#each entries as entry (entry.key)}
      <button type="button" class="discovery-shortcut" class:active={discoveryPlayback.kind === entry.key}
        data-discovery={entry.key} aria-pressed={entry.key === 'heart' || entry.key === 'roaming' ? discoveryPlayback.kind === entry.key : undefined}
        disabled={discoveryPlayback.busy} onclick={() => open(entry.key)}>
        <span class="discovery-shortcut__icon"><Icon name={entry.icon} size={22} strokeWidth={1.8} fill="none" /></span>
        <span class="discovery-shortcut__label">{entry.label}</span>
      </button>
    {/each}
  </div>
  {#if discoveryPlayback.busy || discoveryPlayback.error || message}
    <p class="discovery-shortcuts__status" role="status">{discoveryPlayback.busy ? '正在获取推荐…' : discoveryPlayback.error || message}</p>
  {/if}
</section>

<style>
  .discovery-shortcuts { margin: 0 0 24px; color: var(--text); }
  .discovery-shortcuts__row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .discovery-shortcut { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; min-width: 0; min-height: 80px; padding: 8px 0; border: 0; border-radius: var(--radius-md); background: transparent; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .discovery-shortcut__icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--radius-md); background: var(--md-container-high, var(--bg-elevated)); color: var(--md-primary, var(--accent)); }
  .discovery-shortcut__label { font-size: 13px; line-height: 18px; font-weight: 500; white-space: nowrap; }
  .discovery-shortcut.active .discovery-shortcut__icon { background: var(--md-primary-container, var(--bg-elevated)); }
  .discovery-shortcut:active { background: var(--md-container, var(--bg-elevated)); }
  .discovery-shortcut:focus-visible { outline: 2px solid var(--md-primary, var(--accent)); outline-offset: 2px; }
  .discovery-shortcut:disabled { opacity: .6; cursor: wait; }
  .discovery-shortcuts__status { margin: 8px 0 0; font-size: 13px; line-height: 20px; color: var(--text-secondary); overflow-wrap: anywhere; }
  :global(html.mobile-runtime) .discovery-shortcuts { margin-bottom: 0; }
  @media (min-width: 768px) { .discovery-shortcut { flex-direction: row; gap: 12px; } .discovery-shortcut__label { font-size: 15px; } }
</style>
