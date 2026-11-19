<script lang="ts">
  import { coverUrl } from '../utils/image.ts'
  import { mobileLongPress } from '../app/mobile-interaction.ts'
  import { responsive } from '../utils/responsive.ts'

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
    onRowMenu,
  }: {
    rows?: CompactTrackRow[]
    ranked?: boolean
    emptyText?: string
    onPlay?: (index: number) => void
    onRowMenu?: (index: number, event: MouseEvent) => void
  } = $props()

  function rowLongPress(node: HTMLButtonElement, getIndex: () => number) {
    if (!onRowMenu) return
    return mobileLongPress(node, {
      enabled: () => Boolean(onRowMenu) && $responsive.isMobile && !node.closest('[inert]'),
      open: event => {
        node.focus({ preventScroll: true })
        onRowMenu?.(getIndex(), event)
      },
    })
  }

  function openContextMenu(event: MouseEvent & { currentTarget: HTMLButtonElement }, index: number): void {
    if (!onRowMenu) return
    event.preventDefault()
    if (event instanceof PointerEvent && event.pointerType === 'touch') return
    event.currentTarget.focus({ preventScroll: true })
    onRowMenu(index, event)
  }

  function handleMenuKey(event: KeyboardEvent & { currentTarget: HTMLButtonElement }, index: number): void {
    if (!onRowMenu || (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))) return
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    onRowMenu(index, new MouseEvent('contextmenu', { clientX: bounds.left, clientY: bounds.bottom }))
  }
</script>

{#if rows.length}
  <div class="profile-home__track-list" class:profile-home__track-list--rank={ranked}>
    {#each rows as row, index (row.key)}
      <button type="button" aria-haspopup={onRowMenu ? ($responsive.isMobile ? 'dialog' : 'menu') : undefined} aria-keyshortcuts={onRowMenu ? 'Shift+F10' : undefined}
        use:rowLongPress={() => index} onclick={() => onPlay?.(index)}
        oncontextmenu={event => openContextMenu(event, index)} onkeydown={event => handleMenuKey(event, index)}>
        {#if row.rank !== undefined}
          <span class="profile-home__rank">{String(row.rank).padStart(2, '0')}</span>
        {:else if row.cover}
          <img src={coverUrl(row.cover, 96)} alt="" loading="lazy" referrerpolicy="no-referrer" draggable={onRowMenu ? false : undefined} />
        {:else}
          <span class="profile-home__track-empty">♫</span>
        {/if}
        <span class="profile-home__track-copy"><strong>{row.title}</strong><em>{row.subtitle}</em></span>
      </button>
    {/each}
  </div>
{:else}
  <div class="profile-home__empty">{emptyText}</div>
{/if}

<style>
  .profile-home__track-list { display: grid; gap: 4px; }
  .profile-home__track-list > button { min-width: 0; display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: 12px; padding: 8px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--text); text-align: left; }
  .profile-home__track-list--rank > button { grid-template-columns: 32px minmax(0, 1fr); }
  .profile-home__track-list > button:hover { background: var(--bg-hover); }
  :global(html.mobile-runtime) .profile-home__track-list > button[aria-haspopup] { user-select: none; -webkit-touch-callout: none; }
  .profile-home__track-list img,
  .profile-home__track-empty { width: 44px; height: 44px; display: grid; place-items: center; object-fit: cover; border-radius: var(--radius-sm); background: var(--bg-hover); color: var(--text-tertiary); }
  .profile-home__track-copy { min-width: 0; display: grid; gap: 2px; }
  .profile-home__track-list strong,
  .profile-home__track-list em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .profile-home__track-list strong { font-size: 13px; }
  .profile-home__track-list em { color: var(--text-tertiary); font-size: 11px; font-style: normal; }
  .profile-home__rank { color: var(--text-tertiary); font-size: 12px; font-variant-numeric: tabular-nums; }
  .profile-home__empty { min-height: 168px; display: grid; place-items: center; color: var(--text-tertiary); font-size: 12px; }

  :global(html.mobile-runtime) .profile-home__track-list { gap: 2px; }
  :global(html.mobile-runtime) .profile-home__track-list > button { min-height: 60px; grid-template-columns: 44px minmax(0, 1fr); gap: 10px; padding: 6px; }
  :global(html.mobile-runtime) .profile-home__track-list--rank > button { grid-template-columns: 28px minmax(0, 1fr); }
  :global(html.mobile-runtime) .profile-home__track-list strong { font-size: 14px; }
  :global(html.mobile-runtime) .profile-home__empty { min-height: 80px; font-size: 13px; }

  /* 桌面端的行高由组件自己声明，不再由 desktop-system.css 反向覆盖 */
  :global(html:not(.mobile-runtime)) .profile-home__track-list > button { min-height: 56px; transform: none; }
</style>
