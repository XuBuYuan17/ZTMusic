<script lang="ts">
  import type { Snippet } from 'svelte'

  // 歌单分区：标题、辅助说明与「更多」入口。
  // profile：主页那种带 kicker 的分区；group：资料库那种「标题 + 数量」分组（样式来自全局 app-mobile.css）
  let {
    variant = 'profile',
    kicker = '',
    title,
    count,
    moreLabel = '',
    onMore,
    children,
  }: {
    variant?: 'profile' | 'group'
    kicker?: string
    title: string
    count?: number
    moreLabel?: string
    onMore?: () => void
    children?: Snippet
  } = $props()
</script>

{#if variant === 'group'}
  <section class="library-mobile-section" aria-label={title}>
    <header><h2>{title}</h2>{#if count !== undefined}<span>{count}</span>{/if}</header>
    {@render children?.()}
  </section>
{:else}
  <section class="profile-home__section">
    <header>
      <div>{#if kicker}<span>{kicker}</span>{/if}<h2>{title}</h2></div>
      {#if onMore && moreLabel}<button type="button" onclick={() => onMore?.()}>{moreLabel}</button>{/if}
    </header>
    {@render children?.()}
  </section>
{/if}

<style>
  /* group 变体的样式在 app-mobile.css（全局），这里只提供 profile 变体的外观 */
  .profile-home__section { min-width: 0; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-surface); }
  .profile-home__section > header { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .profile-home__section header span { color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .1em; }
  .profile-home__section h2 { margin-top: 4px; font-size: 20px; }
  .profile-home__section header button { padding: 4px 8px; margin-right: -8px; border-radius: var(--radius-sm); color: var(--accent); font-size: 12px; transition: background-color var(--motion-release) var(--ease-out); }

  :global(html.mobile-runtime) .profile-home__section { padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  :global(html.mobile-runtime) .profile-home__section header span { display: none; }
  :global(html.mobile-runtime) .profile-home__section > header { align-items: center; min-height: 48px; margin-bottom: 8px; }
  :global(html.mobile-runtime) :global(.profile-home) .profile-home__section h2 { margin-top: 0; font-size: 18px; line-height: 24px; }
  :global(html.mobile-runtime) .profile-home__section header button { min-width: 48px; min-height: 48px; margin-right: 0; font-size: 13px; }
</style>
