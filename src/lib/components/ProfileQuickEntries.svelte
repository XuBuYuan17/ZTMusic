<script lang="ts">
  import Icon from './ui/Icon.svelte'
  import LikedCoverFalls from './LikedCoverFalls.svelte'
  import type { ProfileQuickEntry } from './profile-quick-entries.ts'

  // 只负责把快捷入口画出来；数量/文案/目标由 buildProfileQuickEntries 决定
  let {
    entries = [],
    loading = false,
    likedCovers = [],
  }: {
    entries?: ProfileQuickEntry[]
    loading?: boolean
    likedCovers?: string[]
  } = $props()
</script>

{#if loading}
  <div class="profile-home__quick-skeleton">{#each Array(4) as _}<span class="skeleton-block"></span>{/each}</div>
{:else}
  <section class="profile-home__quick">
    {#each entries as entry (entry.id)}
      <button data-motion="card" class:profile-home__quick-favorite={entry.id === 'favorites'} onclick={entry.onSelect}>
        {#if entry.id === 'favorites'}
          <div class="profile-home__quick-art" aria-hidden="true"><LikedCoverFalls covers={likedCovers} /></div>
        {/if}
        <span class="profile-home__quick-icon"><Icon name={entry.icon} size={21} fill={entry.icon === 'calendar' ? 'none' : 'currentColor'} /></span>
        <span class="profile-home__quick-label">{entry.label}</span>
        <strong>{entry.title}</strong>
        <em>{entry.value}</em>
      </button>
    {/each}
  </section>
{/if}

<style>
  .profile-home__quick-skeleton, .profile-home__quick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .profile-home__quick-skeleton span { min-height: 112px; border-radius: var(--radius-xl); }
  .profile-home__quick > button { min-width: 0; min-height: 112px; display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto auto; align-content: center; gap: 4px 12px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-xl); color: var(--text); background: var(--bg-surface); text-align: left; transition: border-color var(--motion-release) var(--ease-out), background-color var(--motion-release) var(--ease-out); }
  .profile-home__quick > button:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); background: color-mix(in srgb, var(--bg-hover) 60%, var(--bg-surface)); }
  .profile-home__quick > .profile-home__quick-favorite { position: relative; isolation: isolate; overflow: hidden; color: white; }
  .profile-home__quick-art { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; background: var(--bg-layer); }
  .profile-home__quick-art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(12, 12, 16, .88), rgba(12, 12, 16, .55)); }
  .profile-home__quick-art :global(.liked-falls-badge) { display: none; }
  .profile-home__quick-favorite :is(strong, em) { color: white; }
  .profile-home__quick-favorite .profile-home__quick-label { color: white; }
  .profile-home__quick-favorite:hover .profile-home__quick-art :global(.liked-falls-track) { animation-play-state: paused; }
  .profile-home__quick-icon { grid-row: 1 / 4; width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--accent); background: var(--accent-bg); transition: background-color var(--motion-release) var(--ease-out); }
  .profile-home__quick > button:hover .profile-home__quick-icon { background: var(--accent-bg-hover); }
  .profile-home__quick-label { color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .1em; }
  .profile-home__quick strong { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
  .profile-home__quick em { overflow: hidden; color: var(--text-tertiary); font-size: 12px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }

  @media (max-width: 1100px) {
    .profile-home__quick { grid-template-columns: repeat(2, 1fr); }
  }

  :global(html.mobile-runtime) .profile-home__quick,
  :global(html.mobile-runtime) .profile-home__quick-skeleton { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  :global(html.mobile-runtime) .profile-home__quick > button { min-height: 104px; grid-template-columns: minmax(0, 1fr); grid-template-rows: repeat(3, auto); align-content: start; gap: 4px; padding: 14px; }
  :global(html.mobile-runtime) .profile-home__quick > button:nth-child(-n+3) { background: var(--bg-surface); }
  :global(html.mobile-runtime) .profile-home__quick-favorite :is(strong, em) { color: white; }
  :global(html.mobile-runtime) .profile-home__quick-art :global(.liked-falls-track) { animation: none; }
  :global(html.mobile-runtime) .profile-home__quick-skeleton span { min-height: 104px; border-radius: var(--radius-sm); }
  :global(html.mobile-runtime) .profile-home__quick-icon { grid-row: auto; width: 32px; height: 32px; border-radius: var(--radius-md); background: var(--md-surface); color: var(--md-primary); }
  :global(html.mobile-runtime) .profile-home__quick > button:hover .profile-home__quick-icon { background: var(--md-surface); }
  :global(html.mobile-runtime) .profile-home__quick-label { display: none; font-size: 12px; line-height: 16px; color: var(--md-primary); letter-spacing: .04em; }
  :global(html.mobile-runtime) .profile-home__quick strong { font-size: 16px; line-height: 22px; color: var(--text); }
  :global(html.mobile-runtime) .profile-home__quick em { font-size: 13px; line-height: 18px; color: var(--text-secondary); }
</style>
