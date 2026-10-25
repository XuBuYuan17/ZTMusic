<script lang="ts">
  import { coverUrl } from '../utils/image.ts'
  import Icon from './ui/Icon.svelte'

  // 紧凑歌曲列表：主页最近播放、本周常听、资料库概览共用。
  // 只负责行渲染与空态；播放由上层决定（onPlay 收到的是列表内索引）。
  export interface CompactTrackRow {
    key: string
    title: string
    subtitle: string
    cover?: string
    /** 有值时显示序号列（本周常听那种排行样式） */
    rank?: number
  }

  let {
    rows = [],
    ranked = false,
    emptyText = '',
    onPlay,
  }: {
    rows?: CompactTrackRow[]
    ranked?: boolean
    emptyText?: string
    onPlay?: (index: number) => void
  } = $props()
</script>

{#if rows.length}
  <div class="profile-home__track-list" class:profile-home__track-list--rank={ranked}>
    {#each rows as row, index (row.key)}
      <button type="button" onclick={() => onPlay?.(index)}>
        {#if row.rank !== undefined}
          <span class="profile-home__rank">{String(row.rank).padStart(2, '0')}</span>
        {:else if row.cover}
          <img src={coverUrl(row.cover, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" />
        {:else}
          <span class="profile-home__track-empty">♫</span>
        {/if}
        <span><strong>{row.title}</strong><em>{row.subtitle}</em></span>
        <Icon name="play" size={15} fill="currentColor" />
      </button>
    {/each}
  </div>
{:else}
  <div class="profile-home__empty">{emptyText}</div>
{/if}

<style>
  .profile-home__track-list { display: grid; gap: 4px; }
  .profile-home__track-list > button { min-width: 0; display: grid; grid-template-columns: 44px minmax(0, 1fr) 20px; align-items: center; gap: 12px; padding: 8px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--text); text-align: left; }
  .profile-home__track-list--rank > button { grid-template-columns: 32px minmax(0, 1fr) 20px; }
  .profile-home__track-list > button:hover { background: var(--bg-hover); }
  .profile-home__track-list > button > :global(svg) { color: var(--accent); opacity: 0; transition: opacity var(--motion-release) var(--ease-out); }
  .profile-home__track-list > button:hover > :global(svg),
  .profile-home__track-list > button:focus-visible > :global(svg) { opacity: 1; }
  .profile-home__track-list img,
  .profile-home__track-empty { width: 44px; height: 44px; display: grid; place-items: center; object-fit: cover; border-radius: var(--radius-sm); background: var(--bg-hover); color: var(--text-tertiary); }
  .profile-home__track-list > button > span:not(.profile-home__rank):not(.profile-home__track-empty) { min-width: 0; display: grid; gap: 2px; }
  .profile-home__track-list strong,
  .profile-home__track-list em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .profile-home__track-list strong { font-size: 13px; }
  .profile-home__track-list em { color: var(--text-tertiary); font-size: 11px; font-style: normal; }
  .profile-home__rank { color: var(--text-tertiary); font-size: 12px; font-variant-numeric: tabular-nums; }
  .profile-home__empty { min-height: 168px; display: grid; place-items: center; color: var(--text-tertiary); font-size: 12px; }

  :global(html.mobile-runtime) .profile-home__track-list { gap: 2px; }
  :global(html.mobile-runtime) .profile-home__track-list > button { min-height: 60px; grid-template-columns: 44px minmax(0, 1fr) 16px; gap: 10px; padding: 6px; }
  :global(html.mobile-runtime) .profile-home__track-list--rank > button { grid-template-columns: 28px minmax(0, 1fr) 16px; }
  :global(html.mobile-runtime) .profile-home__track-list > button > :global(svg) { opacity: 1; }
  :global(html.mobile-runtime) .profile-home__track-list strong { font-size: 14px; }
  :global(html.mobile-runtime) .profile-home__empty { min-height: 80px; font-size: 13px; }

  /* 桌面端的行高由组件自己声明，不再由 desktop-system.css 反向覆盖 */
  :global(html:not(.mobile-runtime)) .profile-home__track-list > button { min-height: 56px; transform: none; }
</style>
