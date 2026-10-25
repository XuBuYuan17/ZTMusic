<script lang="ts">
  import { coverUrl } from '../utils/image.ts'

  // 普通展示卡片：封面 + 名称 + 一行说明。
  // 管理动作（编辑/删除/取消收藏/加入队列）不在这里，由业务层用别的卡片或菜单提供。
  let {
    title,
    meta = '',
    cover = '',
    onSelect,
  }: {
    title: string
    meta?: string
    cover?: string
    onSelect?: () => void
  } = $props()
</script>

<button class="playlist-card" type="button" data-motion="card" onclick={() => onSelect?.()}>
  <span class="playlist-card__cover">
    {#if cover}
      <img src={coverUrl(cover, 320)} alt="" loading="lazy" referrerpolicy="no-referrer" />
    {:else}
      <span class="playlist-card__fallback" aria-hidden="true">♫</span>
    {/if}
  </span>
  <strong class="playlist-card__title">{title}</strong>
  {#if meta}<em class="playlist-card__meta">{meta}</em>{/if}
</button>

<style>
  /* 封面固定 1:1，缺图时用同尺寸占位块，避免不同歌单高度参差 */
  .playlist-card { min-width: 0; display: grid; gap: 8px; color: var(--text); text-align: left; background: transparent; border: 0; padding: 0; }
  .playlist-card__cover { width: 100%; aspect-ratio: 1; display: grid; place-items: center; overflow: hidden; border-radius: var(--radius-md); color: var(--text-tertiary); background: var(--bg-hover); }
  .playlist-card__cover img { width: 100%; height: 100%; object-fit: cover; transition: transform var(--motion-release) var(--ease-out); }
  .playlist-card__fallback { font-size: 22px; opacity: .6; }
  .playlist-card:hover .playlist-card__cover { box-shadow: var(--shadow-md); }
  .playlist-card:hover .playlist-card__cover img { transform: scale(1.04); }
  .playlist-card__title,
  .playlist-card__meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .playlist-card__title { font-size: 13px; }
  .playlist-card__meta { margin-top: -4px; color: var(--text-tertiary); font-size: 11px; font-style: normal; }

  :global(html.mobile-runtime) .playlist-card { min-height: 48px; gap: 6px; align-content: start; }
  :global(html.mobile-runtime) .playlist-card__cover { border-radius: var(--radius-sm); box-shadow: none; }
  :global(html.mobile-runtime) .playlist-card:hover .playlist-card__cover { box-shadow: none; }
  :global(html.mobile-runtime) .playlist-card:hover .playlist-card__cover img { transform: none; }
  :global(html.mobile-runtime) .playlist-card__title { display: -webkit-box; -webkit-box-orient: vertical; line-clamp: 2; -webkit-line-clamp: 2; min-height: 40px; font-size: 15px; line-height: 20px; white-space: normal; }
  :global(html.mobile-runtime) .playlist-card__meta { margin-top: 0; font-size: 13px; line-height: 18px; }
</style>
