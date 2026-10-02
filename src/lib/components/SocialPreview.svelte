<script lang="ts">
  import type { UserPreview } from '../services/user-profile.ts'
  import { openUserRef } from '../app/nav-refs.ts'
  import { coverUrl } from '../utils/image.ts'

  let { title, count = 0, users = [], onOpenUser }: {
    title: string
    count?: number
    users?: UserPreview[]
    onOpenUser?: (id: unknown) => void
  } = $props()
</script>

<section class="social-preview">
  <header><h3>{title}</h3><span>{count}</span></header>
  {#if users.length}
    <div class="social-preview__rail">
      {#each users as user (user.userId)}
        <button type="button" onclick={() => (onOpenUser || openUserRef)(user.userId)} title={user.signature || user.nickname}>
          {#if user.avatarUrl}<img src={coverUrl(user.avatarUrl, 112)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span>人</span>{/if}
          <strong>{user.nickname}</strong>
        </button>
      {/each}
    </div>
  {:else}
    <div class="social-preview__empty">暂无公开内容</div>
  {/if}
</section>

<style>
  .social-preview { min-width: 0; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius-xl); background: var(--bg-surface); }
  .social-preview header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .social-preview h3 { margin: 0; font-size: 20px; font-weight: 700; }
  .social-preview header span { color: var(--text-tertiary); font-size: 12px; }
  .social-preview__rail { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .social-preview button { min-width: 0; display: grid; justify-items: center; gap: 8px; color: var(--text); }
  .social-preview img, .social-preview button > span { width: 58px; height: 58px; display: grid; place-items: center; object-fit: cover; border-radius: 50%; background: var(--bg-elevated); pointer-events: none; transition: transform var(--motion-release) var(--ease-out), box-shadow var(--motion-release) var(--ease-out); }
  .social-preview button:hover img, .social-preview button:hover > span { transform: scale(1.04); box-shadow: var(--shadow-md); }
  .social-preview strong { width: 100%; overflow: hidden; font-size: 11px; font-weight: 500; text-align: center; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; }
  .social-preview__empty { min-height: 76px; display: grid; place-items: center; color: var(--text-tertiary); font-size: 12px; }
  :global(html.mobile-runtime) .social-preview { padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  :global(html.mobile-runtime) .social-preview header { min-height: 48px; margin-bottom: 8px; }
  :global(html.mobile-runtime) .social-preview h3 { font-size: 18px; line-height: 24px; }
  :global(html.mobile-runtime) .social-preview header span { font-size: 13px; }
  :global(html.mobile-runtime) .social-preview__rail { display: flex; gap: 14px; overflow-x: auto; scrollbar-width: none; }
  :global(html.mobile-runtime) .social-preview button { flex: 0 0 72px; min-height: 48px; }
  :global(html.mobile-runtime) .social-preview img,
  :global(html.mobile-runtime) .social-preview button > span { width: 48px; height: 48px; }
  :global(html.mobile-runtime) .social-preview strong { font-size: 13px; line-height: 18px; }
  :global(html.mobile-runtime) .social-preview__empty { min-height: 48px; font-size: 13px; text-align: left; justify-items: start; }
  :global(html.mobile-runtime) .social-preview button:hover img,
  :global(html.mobile-runtime) .social-preview button:hover > span { transform: none; box-shadow: none; }
</style>
